import { watch, type Ref } from 'vue'
import { ApiError } from '../api/http'
import { initials } from '../utils/format'

export interface RecorderPerson {
  name: string
  role: 'CLIENT' | 'CONSULTANT'
  stream: Ref<MediaStream | null>
  cameraOn: Readonly<Ref<boolean>>
  speaking: Readonly<Ref<boolean>>
}

export interface RecorderSources {
  mic: Ref<MediaStream | null>
  remote: Ref<MediaStream | null>
  screen: Ref<MediaStream | null>
  people: [RecorderPerson, RecorderPerson]
}
export type UploadChunk = (chunk: Blob, first: boolean) => Promise<unknown>
export type Recorder = { stop: () => Promise<void> }

const WIDTH = 1280
const HEIGHT = 720
const FPS = 15
const CHUNK_MS = 5000

const BG = '#061a2f'
const TILE_BG = '#0d2b4a'
const GAP = 16
const ROLE_COLOUR = { CLIENT: '#2896fb', CONSULTANT: '#17d94b' }
const SPEAKING_GREEN = '#17d94b'
const FONT = 'Poppins, system-ui, sans-serif'

function pickMimeType(): string | undefined {
  const types = ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
  return types.find((t) => MediaRecorder.isTypeSupported(t))
}

export function startRecorder(sources: RecorderSources, upload: UploadChunk, onFail: (message: string) => void): Recorder {
  if (typeof MediaRecorder === 'undefined') throw new Error('This browser can’t record calls')
  const mimeType = pickMimeType()
  if (!mimeType) throw new Error('This browser can’t record calls')

  const audioCtx = new AudioContext()
  const mixed = audioCtx.createMediaStreamDestination()
  // Client mic on the left channel, consultant on the right, so the transcript can tell who spoke.
  const channels = audioCtx.createChannelMerger(2)
  channels.connect(mixed)
  const LEFT = 0
  const RIGHT = 1
  const resume = () => void audioCtx.resume()
  resume()
  // Audio contexts start suspended until a user gesture (e.g. after a page refresh).
  addEventListener('pointerdown', resume)

  function plugIn(stream: Ref<MediaStream | null>, channel: number) {
    let node: MediaStreamAudioSourceNode | undefined
    const stopWatch = watch(
      () => stream.value?.getAudioTracks()[0] ?? null,
      (track) => {
        node?.disconnect()
        node = track ? audioCtx.createMediaStreamSource(new MediaStream([track])) : undefined
        node?.connect(channels, 0, channel)
      },
      { immediate: true },
    )
    return () => {
      stopWatch()
      node?.disconnect()
    }
  }
  const unplug = [plugIn(sources.mic, LEFT), plugIn(sources.remote, RIGHT)]

  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const g = canvas.getContext('2d')!

  function follow(stream: Ref<MediaStream | null>) {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    const stop = watch(
      () => stream.value,
      (s) => {
        video.srcObject = s
        if (s) void video.play().catch(() => {})
      },
      { immediate: true },
    )
    return {
      video,
      release: () => {
        stop()
        video.srcObject = null
      },
    }
  }
  const screen = follow(sources.screen)
  const cameras = sources.people.map((p) => follow(p.stream))

  function drawCover(video: HTMLVideoElement, x: number, y: number, w: number, h: number) {
    const vw = video.videoWidth
    const vh = video.videoHeight
    const scale = Math.max(w / vw, h / vh)
    const sw = w / scale
    const sh = h / scale
    g.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, x, y, w, h)
  }

  function drawContain(video: HTMLVideoElement, x: number, y: number, w: number, h: number) {
    const scale = Math.min(w / video.videoWidth, h / video.videoHeight)
    const dw = video.videoWidth * scale
    const dh = video.videoHeight * scale
    g.drawImage(video, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
  }

  function drawTile(person: RecorderPerson, video: HTMLVideoElement, x: number, y: number, w: number, h: number) {
    g.save()
    g.beginPath()
    g.roundRect(x, y, w, h, 12)
    g.clip()
    g.fillStyle = TILE_BG
    g.fillRect(x, y, w, h)

    if (person.cameraOn.value && video.videoWidth) {
      drawCover(video, x, y, w, h)
    } else {
      const r = Math.min(w, h) * 0.2
      g.fillStyle = ROLE_COLOUR[person.role]
      g.beginPath()
      g.arc(x + w / 2, y + h / 2, r, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = '#07223d'
      g.font = `700 ${Math.round(r * 0.8)}px ${FONT}`
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(initials(person.name), x + w / 2, y + h / 2)
    }

    const size = Math.max(13, Math.round(h * 0.06))
    g.font = `600 ${size}px ${FONT}`
    g.textAlign = 'left'
    g.textBaseline = 'middle'
    const pad = size * 0.6
    const labelW = g.measureText(person.name).width + pad * 2
    const labelH = size * 1.8
    g.fillStyle = 'rgba(6, 26, 47, 0.75)'
    g.beginPath()
    g.roundRect(x + 10, y + h - labelH - 10, labelW, labelH, labelH / 2)
    g.fill()
    g.fillStyle = '#fff'
    g.fillText(person.name, x + 10 + pad, y + h - 10 - labelH / 2)
    g.restore()

    if (person.speaking.value) {
      const line = 4
      g.strokeStyle = SPEAKING_GREEN
      g.lineWidth = line
      g.beginPath()
      g.roundRect(x + line / 2, y + line / 2, w - line, h - line, 12 - line / 2)
      g.stroke()
    }
  }

  function draw() {
    g.fillStyle = BG
    g.fillRect(0, 0, WIDTH, HEIGHT)
    const [a, b] = sources.people

    if (sources.screen.value && screen.video.videoWidth) {
      const tileW = 320
      const tileH = 180
      const screenW = WIDTH - GAP * 3 - tileW
      g.fillStyle = '#000'
      g.fillRect(GAP, GAP, screenW, HEIGHT - GAP * 2)
      drawContain(screen.video, GAP, GAP, screenW, HEIGHT - GAP * 2)
      const tileX = WIDTH - GAP - tileW
      const top = (HEIGHT - (tileH * 2 + GAP)) / 2
      drawTile(a, cameras[0].video, tileX, top, tileW, tileH)
      drawTile(b, cameras[1].video, tileX, top + tileH + GAP, tileW, tileH)
    } else {
      const tileW = (WIDTH - GAP * 3) / 2
      const tileH = (tileW * 9) / 16
      const top = (HEIGHT - tileH) / 2
      drawTile(a, cameras[0].video, GAP, top, tileW, tileH)
      drawTile(b, cameras[1].video, GAP * 2 + tileW, top, tileW, tileH)
    }
  }
  draw()
  const tickerUrl = URL.createObjectURL(
    new Blob([`setInterval(() => postMessage(0), ${Math.round(1000 / FPS)})`], { type: 'text/javascript' }),
  )
  const ticker = new Worker(tickerUrl)
  ticker.onmessage = draw

  const stream = new MediaStream([...canvas.captureStream(FPS).getVideoTracks(), ...mixed.stream.getAudioTracks()])
  const recorder = new MediaRecorder(stream, { mimeType })
  let first = true
  let broken = false
  let queue: Promise<void> = Promise.resolve()

  async function send(chunk: Blob, isFirst: boolean) {
    if (broken) return
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await upload(chunk, isFirst)
        return
      } catch (e) {
        const refused = e instanceof ApiError && e.status >= 400 && e.status < 500
        if (refused || attempt === 3) {
          broken = true
          onFail(refused ? e.message : 'Recording upload failed — check your connection')
          return
        }
        await new Promise((r) => setTimeout(r, 1000 * attempt))
      }
    }
  }
  recorder.ondataavailable = (e) => {
    if (!e.data.size) return
    const isFirst = first
    first = false
    queue = queue.then(() => send(e.data, isFirst))
  }
  recorder.start(CHUNK_MS)

  let stopping: Promise<void> | null = null
  function stop() {
    stopping ??= (async () => {
      if (recorder.state !== 'inactive') {
        const stopped = new Promise((r) => recorder.addEventListener('stop', r, { once: true }))
        recorder.stop()
        await stopped
      }
      ticker.terminate()
      URL.revokeObjectURL(tickerUrl)
      screen.release()
      cameras.forEach((c) => c.release())
      unplug.forEach((off) => off())
      removeEventListener('pointerdown', resume)
      stream.getTracks().forEach((t) => t.stop())
      void audioCtx.close()
      await queue
    })()
    return stopping
  }

  return { stop }
}
