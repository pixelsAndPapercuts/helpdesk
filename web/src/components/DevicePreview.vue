<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { getLocalMedia, mediaWarning } from '../communication/webrtc'
import { useAuthStore } from '../stores/auth'
import { useCallStore } from '../stores/call'
import { initials } from '../utils/format'

const store = useCallStore()
const auth = useAuthStore()
const prefs = store.prefs

const stream = shallowRef<MediaStream | null>(null)
const starting = ref(true)
const mics = ref<MediaDeviceInfo[]>([])
const cameras = ref<MediaDeviceInfo[]>([])
const speakers = ref<MediaDeviceInfo[]>([])
const level = ref(0)
const canPickSpeaker = 'setSinkId' in HTMLMediaElement.prototype

const hasMic = computed(() => !!stream.value?.getAudioTracks().length)
const hasCamera = computed(() => !!stream.value?.getVideoTracks().length)
const showVideo = computed(() => hasCamera.value && prefs.cameraOn)
const warning = computed(() => (starting.value ? '' : mediaWarning(stream.value)))
const deviceId = (kind: 'audio' | 'video') =>
  stream.value?.getTracks().find((t) => t.kind === kind)?.getSettings().deviceId ?? ''

let unmounted = false
let requestId = 0

async function acquire() {
  const id = ++requestId
  stream.value?.getTracks().forEach((t) => t.stop())
  stopMeter()
  const fresh = await getLocalMedia(prefs)
  if (unmounted || id !== requestId) {
    fresh?.getTracks().forEach((t) => t.stop())
    return
  }
  stream.value = fresh
  store.setPreview(fresh)
  applyOnOff()
  prefs.micId = deviceId('audio') || prefs.micId
  prefs.cameraId = deviceId('video') || prefs.cameraId
  startMeter()
  void loadDevices()
  starting.value = false
}

async function loadDevices() {
  const all = await navigator.mediaDevices.enumerateDevices()
  mics.value = all.filter((d) => d.kind === 'audioinput' && d.deviceId)
  cameras.value = all.filter((d) => d.kind === 'videoinput' && d.deviceId)
  speakers.value = all.filter((d) => d.kind === 'audiooutput' && d.deviceId)
}

function applyOnOff() {
  const mic = stream.value?.getAudioTracks()[0]
  const cam = stream.value?.getVideoTracks()[0]
  if (mic) mic.enabled = prefs.micOn
  if (cam) cam.enabled = prefs.cameraOn
}
watch(() => [prefs.micOn, prefs.cameraOn], applyOnOff)

watch(
  () => [prefs.micId, prefs.cameraId],
  () => {
    if (starting.value) return
    if (prefs.micId !== deviceId('audio') || prefs.cameraId !== deviceId('video')) void acquire()
  },
)

let audioCtx: AudioContext | null = null
let meterTimer: ReturnType<typeof setInterval> | undefined
function startMeter() {
  const track = stream.value?.getAudioTracks()[0]
  if (!track) return
  audioCtx ??= new AudioContext()
  void audioCtx.resume()
  const source = audioCtx.createMediaStreamSource(new MediaStream([track]))
  const analyser = audioCtx.createAnalyser()
  analyser.fftSize = 512
  source.connect(analyser)
  const samples = new Uint8Array(analyser.fftSize)
  meterTimer = setInterval(() => {
    analyser.getByteTimeDomainData(samples)
    let sum = 0
    for (const s of samples) sum += ((s - 128) / 128) ** 2
    level.value = Math.min(1, Math.sqrt(sum / samples.length) * 4)
  }, 100)
}
function stopMeter() {
  clearInterval(meterTimer)
  level.value = 0
}

onMounted(() => {
  prefs.micOn = false
  prefs.cameraOn = false
  void acquire()
  navigator.mediaDevices.addEventListener('devicechange', loadDevices)
})
onUnmounted(() => {
  unmounted = true
  stopMeter()
  void audioCtx?.close()
  navigator.mediaDevices.removeEventListener('devicechange', loadDevices)
  store.dropPreview(stream.value)
})

const label = (d: MediaDeviceInfo, i: number, kind: string) => d.label || `${kind} ${i + 1}`
</script>

<template>
  <div class="preview">
    <div class="stage">
      <video v-show="showVideo" :srcObject.prop="stream" class="mirror" autoplay playsinline muted></video>
      <div v-if="!showVideo" class="cam-off">
        <span class="avatar" :class="auth.user?.role === 'CONSULTANT' ? 'consultant' : 'client'" aria-hidden="true">
          {{ initials(auth.user?.name ?? '') }}
        </span>
        <span>{{ starting ? 'Starting camera…' : hasCamera ? 'Camera is off' : 'No camera' }}</span>
      </div>

      <div class="toggles">
        <button
          type="button"
          class="round"
          :class="{ off: !prefs.micOn || !hasMic }"
          :aria-pressed="!prefs.micOn"
          :aria-label="prefs.micOn ? 'Turn microphone off' : 'Turn microphone on'"
          :title="prefs.micOn ? 'Turn microphone off' : 'Turn microphone on'"
          :disabled="!hasMic"
          @click="prefs.micOn = !prefs.micOn"
        >
          <AppIcon :name="prefs.micOn && hasMic ? 'mic' : 'mic-off'" :size="20" />
        </button>
        <button
          type="button"
          class="round"
          :class="{ off: !prefs.cameraOn || !hasCamera }"
          :aria-pressed="!prefs.cameraOn"
          :aria-label="prefs.cameraOn ? 'Turn camera off' : 'Turn camera on'"
          :title="prefs.cameraOn ? 'Turn camera off' : 'Turn camera on'"
          :disabled="!hasCamera"
          @click="prefs.cameraOn = !prefs.cameraOn"
        >
          <AppIcon :name="prefs.cameraOn && hasCamera ? 'video' : 'video-off'" :size="20" />
        </button>
      </div>
    </div>

    <p v-if="warning" class="warn" role="alert">{{ warning }}</p>

    <div class="devices">
      <label class="field">
        <span>Microphone</span>
        <select v-model="prefs.micId" :disabled="!mics.length">
          <option v-for="(d, i) in mics" :key="d.deviceId" :value="d.deviceId">{{ label(d, i, 'Microphone') }}</option>
        </select>
        <span
          class="meter"
          role="meter"
          aria-label="Microphone level"
          :aria-valuenow="Math.round(level * 100)"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <span :style="{ transform: `scaleX(${prefs.micOn ? level : 0})` }"></span>
        </span>
      </label>
      <label class="field">
        <span>Camera</span>
        <select v-model="prefs.cameraId" :disabled="!cameras.length">
          <option v-for="(d, i) in cameras" :key="d.deviceId" :value="d.deviceId">{{ label(d, i, 'Camera') }}</option>
        </select>
      </label>
      <label v-if="canPickSpeaker && speakers.length" class="field">
        <span>Speaker</span>
        <select v-model="store.speakerId">
          <option value="">System default</option>
          <option v-for="(d, i) in speakers" :key="d.deviceId" :value="d.deviceId">{{ label(d, i, 'Speaker') }}</option>
        </select>
      </label>
    </div>
  </div>
</template>

<style scoped>
.preview {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.stage {
  position: relative;
  aspect-ratio: 16 / 9;
  border-radius: var(--radius-lg);
  background: #0a2540;
  overflow: hidden;
}
.stage video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.mirror {
  transform: scaleX(-1);
}
.cam-off {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--on-dark-subtle);
  font-size: 13px;
}
.avatar {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  color: var(--space-blue);
  font-size: 24px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
.avatar.client {
  background: var(--nurture-blue);
}
.avatar.consultant {
  background: var(--close-green);
}
.toggles {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 12px;
  display: flex;
  justify-content: center;
  gap: 12px;
}
.round {
  width: 44px;
  height: 44px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 50%;
  background: rgba(6, 26, 47, 0.55);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.round.off {
  border-color: transparent;
  background: #d92d20;
}
.round:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.round:focus-visible {
  outline: 2px solid var(--nurture-blue);
  outline-offset: 2px;
}
.warn {
  margin: 0;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  background: #fff6d6;
  color: #7a5b00;
  font-size: 13px;
}
.devices {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}
.field {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
}
.field select {
  width: 100%;
  height: 40px;
  padding: 0 32px 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  background: var(--surface)
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%234a5b6e' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")
    no-repeat right 12px center;
  appearance: none;
  color: var(--text);
  font: inherit;
  font-size: 13px;
  font-weight: 400;
  text-overflow: ellipsis;
}
.field select:disabled {
  opacity: 0.6;
}
.meter {
  height: 4px;
  border-radius: 2px;
  background: var(--divider);
  overflow: hidden;
}
.meter span {
  display: block;
  height: 100%;
  background: var(--close-green);
  transform-origin: left;
  transition: transform 0.1s linear;
}
</style>
