import { ref, watch, type Ref } from 'vue'
import { emitEvent, emitWithAck, onEvent } from './socket'

export type PeerState =
  | 'starting'
  | 'waiting'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'peer-left'
  | 'failed'

type Signal =
  | RTCSessionDescriptionInit
  | { candidate: RTCIceCandidateInit }
  | { media: { camera: boolean; screen: boolean; mic: boolean } }
type JoinAck = { ok: true; peerPresent: boolean } | { ok: false; error: string }

const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]

export interface DeviceChoice {
  micId: string
  cameraId: string
}

export async function getLocalMedia({ micId, cameraId }: DeviceChoice): Promise<MediaStream | null> {
  const attempts: MediaStreamConstraints[] = []
  if (micId || cameraId) {
    attempts.push({
      audio: micId ? { deviceId: { exact: micId } } : true,
      video: cameraId ? { deviceId: { exact: cameraId } } : true,
    })
  }
  attempts.push({ audio: true, video: true }, { audio: true }, { video: true })
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints)
    } catch {
      // blocked, missing or unplugged device: try with less
    }
  }
  return null
}

export function mediaWarning(stream: MediaStream | null): string {
  const audio = !!stream?.getAudioTracks().length
  const video = !!stream?.getVideoTracks().length
  if (!audio && !video) return 'Camera and microphone blocked — you can watch and listen only.'
  if (!video) return 'Camera unavailable — they can hear you, but can’t see you.'
  if (!audio) return 'Microphone blocked — they can see you, but can’t hear you.'
  return ''
}

export interface CallSetup extends DeviceChoice {
  stream?: MediaStream | null
  micOn: boolean
  cameraOn: boolean
}

export function createCallConnection(
  callId: string,
  isOfferer: boolean,
  setup: CallSetup = { micId: '', cameraId: '', micOn: true, cameraOn: true },
) {
  const state = ref<PeerState>('starting')
  const localStream = ref<MediaStream | null>(null)
  const remoteStream = ref<MediaStream | null>(null)
  const muted = ref(false)
  const cameraOff = ref(false)
  const hasMic = ref(false)
  const hasCamera = ref(false)
  const remoteCamera = ref(false)
  const mediaError = ref('')
  const screenStream = ref<MediaStream | null>(null)
  const remoteScreen = ref<MediaStream | null>(null)
  const remoteSharing = ref(false)
  const remoteMic = ref(true)
  const speaking = ref(false)
  const remoteSpeaking = ref(false)
  const mics = ref<MediaDeviceInfo[]>([])
  const speakers = ref<MediaDeviceInfo[]>([])
  const micId = ref('')

  let pc: RTCPeerConnection | null = null
  let screenSlot: RTCRtpTransceiver | null = null
  let pendingCandidates: RTCIceCandidateInit[] = []
  let offs: (() => void)[] = []
  let closed = false

  const send = (data: Signal) => emitEvent('call.signal', { callId, data })
  const sendMedia = () =>
    send({
      media: {
        camera: hasCamera.value && !cameraOff.value,
        screen: !!screenStream.value,
        mic: hasMic.value && !muted.value,
      },
    })

  let audioCtx: AudioContext | null = null
  const resumeAudio = () => void audioCtx?.resume()
  function watchLoudness(stream: MediaStream | null, out: Ref<boolean>): () => void {
    const track = stream?.getAudioTracks()[0]
    if (!track) return () => (out.value = false)
    audioCtx ??= new AudioContext()
    const source = audioCtx.createMediaStreamSource(new MediaStream([track]))
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 512
    source.connect(analyser)
    const samples = new Uint8Array(analyser.fftSize)
    let lastLoud = 0
    const timer = setInterval(() => {
      analyser.getByteTimeDomainData(samples)
      let sum = 0
      for (const s of samples) sum += ((s - 128) / 128) ** 2
      const loudness = Math.sqrt(sum / samples.length)
      if (loudness > 0.03) lastLoud = Date.now()
      out.value = Date.now() - lastLoud < 500
    }, 100)
    return () => {
      clearInterval(timer)
      source.disconnect()
      out.value = false
    }
  }
  let stopLocalLoudness = () => {}
  let stopRemoteLoudness = () => {}
  const stopRemoteWatch = watch(remoteStream, (stream) => {
    stopRemoteLoudness()
    stopRemoteLoudness = watchLoudness(stream, remoteSpeaking)
  })

  async function loadDevices() {
    const all = await navigator.mediaDevices.enumerateDevices()
    mics.value = all.filter((d) => d.kind === 'audioinput' && d.deviceId)
    speakers.value = all.filter((d) => d.kind === 'audiooutput' && d.deviceId)
  }

  async function setMic(deviceId: string) {
    const stream = localStream.value
    const old = stream?.getAudioTracks()[0]
    if (!stream || !old || deviceId === micId.value) return
    const fresh = (
      await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } })
    ).getAudioTracks()[0]!
    fresh.enabled = !muted.value
    await pc?.getSenders().find((s) => s.track === old)?.replaceTrack(fresh)
    stream.removeTrack(old)
    stream.addTrack(fresh)
    old.stop()
    micId.value = deviceId
    stopLocalLoudness()
    stopLocalLoudness = watchLoudness(stream, speaking)
  }

  function createPeer() {
    pc?.close()
    pendingCandidates = []
    remoteStream.value = null
    remoteCamera.value = false
    remoteScreen.value = null
    remoteSharing.value = false
    screenSlot = null

    const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    const stream = localStream.value
    for (const kind of ['audio', 'video'] as const) {
      const track = stream?.getTracks().find((t) => t.kind === kind)
      if (track) peer.addTrack(track, stream!)
      else if (isOfferer) peer.addTransceiver(kind, { direction: 'recvonly' })
    }
    if (isOfferer) screenSlot = peer.addTransceiver('video', { direction: 'recvonly' })

    peer.onicecandidate = (e) => {
      if (e.candidate) send({ candidate: e.candidate.toJSON() })
    }
    peer.ontrack = (e) => {
      if (e.transceiver === screenSlot) remoteScreen.value = new MediaStream([e.track])
      else remoteStream.value = e.streams[0] ?? new MediaStream([e.track])
    }
    peer.onconnectionstatechange = () => {
      if (peer !== pc) return
      const s = peer.connectionState
      if (s === 'connected') {
        state.value = 'connected'
        sendMedia()
      } else if (s === 'disconnected') state.value = 'reconnecting'
      else if (s === 'failed') state.value = 'failed'
      else if (s === 'new' || s === 'connecting') state.value = 'connecting'
    }

    pc = peer
    return peer
  }

  async function makeOffer() {
    const peer = createPeer()
    state.value = 'connecting'
    await peer.setLocalDescription(await peer.createOffer())
    send(peer.localDescription!.toJSON())
  }

  async function flushCandidates() {
    for (const c of pendingCandidates) await pc?.addIceCandidate(c)
    pendingCandidates = []
  }

  async function onSignal({ callId: id, data }: { callId: string; data: Signal }) {
    if (id !== callId || closed) return
    try {
      if ('type' in data && data.type === 'offer') {
        const peer = createPeer()
        state.value = 'connecting'
        await peer.setRemoteDescription(data)
        screenSlot = peer.getTransceivers().filter((t) => t.receiver.track.kind === 'video')[1] ?? null
        if (screenSlot) {
          screenSlot.direction = 'sendonly'
          const screenTrack = screenStream.value?.getVideoTracks()[0]
          if (screenTrack) await screenSlot.sender.replaceTrack(screenTrack)
        }
        await flushCandidates()
        await peer.setLocalDescription(await peer.createAnswer())
        send(peer.localDescription!.toJSON())
      } else if ('type' in data && data.type === 'answer') {
        await pc?.setRemoteDescription(data)
        await flushCandidates()
      } else if ('candidate' in data) {
        if (pc?.remoteDescription) await pc.addIceCandidate(data.candidate)
        else pendingCandidates.push(data.candidate)
      } else if ('media' in data) {
        remoteCamera.value = data.media.camera
        remoteSharing.value = data.media.screen
        remoteMic.value = data.media.mic
      }
    } catch (e) {
      console.error('Signalling error', e)
      state.value = 'failed'
    }
  }

  async function start() {
    const stream = setup.stream !== undefined ? setup.stream : await getLocalMedia(setup)
    if (closed) return stream?.getTracks().forEach((t) => t.stop())
    localStream.value = stream
    mediaError.value = mediaWarning(stream)
    hasMic.value = !!stream?.getAudioTracks().length
    hasCamera.value = !!stream?.getVideoTracks().length
    const mic = stream?.getAudioTracks()[0]
    const cam = stream?.getVideoTracks()[0]
    if (mic) mic.enabled = setup.micOn
    if (cam) cam.enabled = setup.cameraOn
    muted.value = !!mic && !setup.micOn
    cameraOff.value = !!cam && !setup.cameraOn
    micId.value = stream?.getAudioTracks()[0]?.getSettings().deviceId ?? ''
    stopLocalLoudness = watchLoudness(stream, speaking)
    void loadDevices()
    navigator.mediaDevices.addEventListener('devicechange', loadDevices)
    document.addEventListener('pointerdown', resumeAudio)

    offs = [
      onEvent('call.signal', onSignal),
      onEvent<{ callId: string }>('call.peer-joined', ({ callId: id }) => {
        if (id !== callId) return
        if (isOfferer) void makeOffer()
        else {
          createPeer()
          state.value = 'connecting'
        }
      }),
      onEvent<{ callId: string }>('call.peer-left', ({ callId: id }) => {
        if (id !== callId) return
        pc?.close()
        pc = null
        remoteStream.value = null
        remoteCamera.value = false
        remoteScreen.value = null
        remoteSharing.value = false
        state.value = 'peer-left'
      }),
    ]

    try {
      const ack = await emitWithAck<JoinAck>('call.join', { callId })
      if (!ack.ok) {
        state.value = 'failed'
        return
      }
      if (!ack.peerPresent) state.value = 'waiting'
      else if (isOfferer) await makeOffer()
      else state.value = 'connecting'
    } catch {
      state.value = 'failed'
    }
  }

  function toggleMute() {
    const track = localStream.value?.getAudioTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    muted.value = !track.enabled
    sendMedia()
  }

  function toggleCamera() {
    const track = localStream.value?.getVideoTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    cameraOff.value = !track.enabled
    sendMedia()
  }

  async function shareScreen() {
    let stream: MediaStream
    try {
      const options: DisplayMediaStreamOptions & {
        selfBrowserSurface?: 'include' | 'exclude'
        surfaceSwitching?: 'include' | 'exclude'
      } = { video: true, selfBrowserSurface: 'include', surfaceSwitching: 'include' }
      stream = await navigator.mediaDevices.getDisplayMedia(options)
    } catch {
      return
    }
    const track = stream.getVideoTracks()[0]!
    track.onended = () => stopShare()
    screenStream.value = stream
    await screenSlot?.sender.replaceTrack(track)
    sendMedia()
  }

  function stopShare() {
    if (!screenStream.value) return
    screenStream.value.getTracks().forEach((t) => t.stop())
    screenStream.value = null
    void screenSlot?.sender.replaceTrack(null)
    sendMedia()
  }

  function close() {
    if (closed) return
    closed = true
    emitEvent('call.leave')
    offs.forEach((off) => off())
    stopRemoteWatch()
    stopLocalLoudness()
    stopRemoteLoudness()
    void audioCtx?.close()
    navigator.mediaDevices.removeEventListener('devicechange', loadDevices)
    document.removeEventListener('pointerdown', resumeAudio)
    screenStream.value?.getTracks().forEach((t) => t.stop())
    screenStream.value = null
    pc?.close()
    pc = null
    remoteStream.value = null
    remoteScreen.value = null
    localStream.value?.getTracks().forEach((t) => t.stop())
    localStream.value = null
  }

  return {
    state,
    localStream,
    remoteStream,
    muted,
    cameraOff,
    hasMic,
    hasCamera,
    remoteCamera,
    mediaError,
    screenStream,
    remoteScreen,
    remoteSharing,
    remoteMic,
    speaking,
    remoteSpeaking,
    mics,
    speakers,
    micId,
    start,
    toggleMute,
    toggleCamera,
    setMic,
    shareScreen,
    stopShare,
    close,
  }
}
