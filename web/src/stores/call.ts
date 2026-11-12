import { defineStore } from 'pinia'
import { computed, nextTick, reactive, ref, shallowRef, watch } from 'vue'
import { callsApi } from '../api/calls'
import { onEvent } from '../communication/socket'
import { startRecorder, type Recorder } from '../communication/recorder'
import { createCallConnection } from '../communication/webrtc'
import { useAuthStore } from './auth'
import { useToastStore } from './toast'
import type { Call } from '../types'

type Connection = ReturnType<typeof createCallConnection>

export async function withViewTransition(update: () => unknown): Promise<void> {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!document.startViewTransition || reduceMotion || document.hidden) {
    await update()
    return
  }
  const transition = document.startViewTransition(async () => {
    await update()
    await nextTick()
  })
  transition.ready.catch(() => {})
  await transition.finished.catch(() => {})
}

function copyStyles(target: Document) {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const style = target.createElement('style')
      style.textContent = Array.from(sheet.cssRules, (rule) => rule.cssText).join('\n')
      target.head.appendChild(style)
    } catch {
      if (!sheet.href) continue
      const link = target.createElement('link')
      link.rel = 'stylesheet'
      link.href = sheet.href
      target.head.appendChild(link)
    }
  }
}

export const useCallStore = defineStore('call', () => {
  const auth = useAuthStore()
  const toast = useToastStore()

  const call = ref<Call | null>(null)
  const peer = shallowRef<Connection | null>(null)
  const speakerId = ref('')
  let offs: (() => void)[] = []

  const isConsultant = computed(() => auth.user?.role === 'CONSULTANT')
  const otherPerson = computed(() => {
    if (!call.value) return ''
    return isConsultant.value ? call.value.client.name : call.value.consultant.name
  })
  const active = computed(() => call.value?.status === 'ACTIVE')

  const prefs = reactive({ micOn: false, cameraOn: false, micId: '', cameraId: '' })
  const preview = shallowRef<MediaStream | null>(null)
  let previewKept = false
  let keepTimer: ReturnType<typeof setTimeout> | undefined

  function stopStream(stream: MediaStream | null) {
    stream?.getTracks().forEach((t) => t.stop())
  }
  function setPreview(stream: MediaStream | null) {
    preview.value = stream
    previewKept = false
  }
  function releasePreview() {
    clearTimeout(keepTimer)
    stopStream(preview.value)
    preview.value = null
    previewKept = false
  }
  function keepPreview() {
    previewKept = true
    clearTimeout(keepTimer)
    keepTimer = setTimeout(releasePreview, 45_000)
  }
  function dropPreview(stream: MediaStream | null) {
    if (preview.value !== stream) return
    if (previewKept) return
    stopStream(stream)
    preview.value = null
  }
  function takePreview(): MediaStream | undefined {
    const stream = preview.value
    preview.value = null
    previewKept = false
    clearTimeout(keepTimer)
    return stream ?? undefined
  }

  const pipWindow = shallowRef<Window | null>(null)
  const canPip = 'documentPictureInPicture' in window

  async function openPip(): Promise<boolean> {
    if (pipWindow.value) return true
    if (!window.documentPictureInPicture) return false
    try {
      const win = await window.documentPictureInPicture.requestWindow({ width: 320, height: 300 })
      copyStyles(win.document)
      win.document.title = `Call with ${otherPerson.value}`
      win.document.body.classList.add('pip-body')
      win.addEventListener('pagehide', () => (pipWindow.value = null), { once: true })
      pipWindow.value = win
      return true
    } catch {
      return false
    }
  }
  function closePip() {
    pipWindow.value?.close()
    pipWindow.value = null
  }

  async function open(callId: string) {
    if (call.value?.callId === callId) return
    leave()
    const update = (updated: Call) => {
      if (updated.callId === callId) call.value = updated
    }
    offs = ['call.accepted', 'call.declined', 'call.missed', 'call.ended', 'call.recording'].map((event) =>
      onEvent<Call>(event, update),
    )
    try {
      call.value = await callsApi.get(callId)
    } catch (e) {
      leave()
      throw e
    }
  }

  async function end() {
    if (!call.value) return
    call.value = await callsApi.end(call.value.callId)
  }

  const recording = computed(() => call.value?.recording ?? 'OFF')
  const consentPending = computed(() => !isConsultant.value && active.value && recording.value === 'REQUESTED')

  async function recordingAction(action: (callId: string) => Promise<Call>) {
    if (!call.value) return
    call.value = await action(call.value.callId)
  }
  const requestRecording = () => recordingAction(callsApi.requestRecording)
  const allowRecording = () => recordingAction(callsApi.allowRecording)
  const declineRecording = () => recordingAction(callsApi.declineRecording)
  const stopRecording = () => recordingAction(callsApi.stopRecording)

  let recorder: Recorder | null = null
  function stopRecorder() {
    void recorder?.stop()
    recorder = null
  }
  watch(
    () => !isConsultant.value && recording.value === 'ON' && !!peer.value,
    (shouldRecord) => {
      if (!shouldRecord) return stopRecorder()
      if (recorder || !peer.value || !call.value) return
      const callId = call.value.callId
      const p = peer.value
      try {
        recorder = startRecorder(
          {
            mic: p.localStream,
            remote: p.remoteStream,
            screen: p.screenStream,
            people: [
              {
                name: call.value.client.name,
                role: 'CLIENT',
                stream: p.localStream,
                cameraOn: computed(() => p.hasCamera.value && !p.cameraOff.value),
                speaking: computed(() => p.hasMic.value && !p.muted.value && p.speaking.value),
              },
              {
                name: call.value.consultant.name,
                role: 'CONSULTANT',
                stream: p.remoteStream,
                cameraOn: p.remoteCamera,
                speaking: computed(() => p.remoteMic.value && p.remoteSpeaking.value),
              },
            ],
          },
          (chunk, first) => callsApi.uploadChunk(callId, chunk, first),
          (message) => {
            toast.show(message, 'error')
            stopRecorder()
            if (recording.value === 'ON') void stopRecording().catch(() => {})
          },
        )
      } catch (e) {
        toast.show(e instanceof Error ? e.message : 'Could not start recording', 'error')
        void stopRecording().catch(() => {})
      }
    },
  )

  watch(recording, (now, prev) => {
    if (isConsultant.value && active.value && prev === 'REQUESTED' && now === 'OFF') {
      toast.show(`${otherPerson.value} declined recording`, 'error')
    }
  })

  function leave() {
    stopRecorder()
    closePip()
    offs.forEach((off) => off())
    offs = []
    peer.value?.close()
    peer.value = null
    call.value = null
  }

  watch(
    () => call.value?.status,
    (status) => {
      if (status === 'ACTIVE' && !peer.value) {
        peer.value = createCallConnection(call.value!.callId, isConsultant.value, {
          ...prefs,
          stream: takePreview(),
        })
        void peer.value.start()
      }
      if (status && status !== 'ACTIVE' && status !== 'RINGING') releasePreview()
      if (status !== 'ACTIVE' && peer.value) {
        stopRecorder()
        peer.value.close()
        peer.value = null
        closePip()
      }
    },
  )

  watch(
    () => auth.user,
    (user) => {
      if (!user) {
        leave()
        releasePreview()
      }
    },
  )

  const now = ref(Date.now())
  let clock: ReturnType<typeof setInterval> | undefined
  watch(
    active,
    (isActive) => {
      clearInterval(clock)
      if (isActive) clock = setInterval(() => (now.value = Date.now()), 1000)
    },
    { immediate: true },
  )
  function since(from: string | null | undefined) {
    if (!from) return '00:00'
    const secs = Math.max(0, Math.floor((now.value - new Date(from).getTime()) / 1000))
    const pad = (n: number) => String(n).padStart(2, '0')
    const h = Math.floor(secs / 3600)
    const mm = pad(Math.floor((secs % 3600) / 60))
    return h ? `${h}:${mm}:${pad(secs % 60)}` : `${mm}:${pad(secs % 60)}`
  }
  const elapsed = computed(() => since(call.value?.startedAt))
  const recordingElapsed = computed(() => since(call.value?.consentAt))

  return {
    call,
    peer,
    speakerId,
    isConsultant,
    otherPerson,
    active,
    elapsed,
    recording,
    recordingElapsed,
    consentPending,
    requestRecording,
    allowRecording,
    declineRecording,
    stopRecording,
    prefs,
    setPreview,
    keepPreview,
    dropPreview,
    pipWindow,
    canPip,
    open,
    end,
    leave,
    openPip,
    closePip,
  }
})
