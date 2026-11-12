<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import { callsApi } from '../api/calls'
import { helpRequestsApi } from '../api/helpRequests'
import { ApiError } from '../api/http'
import { homeFor } from '../router'
import { initials } from '../utils/format'
import { useAuthStore } from '../stores/auth'
import { useCallStore, withViewTransition } from '../stores/call'
import { useToastStore } from '../stores/toast'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const toast = useToastStore()

const callId = route.params.callId as string
const callStore = useCallStore()
const { call, peer, speakerId, isConsultant, otherPerson, elapsed, recording, recordingElapsed } =
  storeToRefs(callStore)
const loading = ref(callStore.call?.callId !== callId)
const error = ref('')
const busy = ref(false)

const recordingBusy = ref(false)
async function onRecordClick() {
  recordingBusy.value = true
  try {
    if (recording.value === 'ON') await callStore.stopRecording()
    else await callStore.requestRecording()
  } catch (e) {
    toast.show(e instanceof ApiError ? e.message : 'Could not change recording', 'error')
  } finally {
    recordingBusy.value = false
  }
}
const recordLabel = computed(() => {
  if (recording.value === 'ON') return 'Stop recording'
  if (recording.value === 'REQUESTED') return 'Waiting for consent…'
  return 'Start recording'
})

const firstName = (name: string) => name.split(' ')[0]

const peerState = computed(() => peer.value?.state.value ?? 'starting')
const connected = computed(() => peerState.value === 'connected')
const muted = computed(() => peer.value?.muted.value ?? false)
const cameraOff = computed(() => peer.value?.cameraOff.value ?? false)
const hasMic = computed(() => peer.value?.hasMic.value ?? false)
const hasCamera = computed(() => peer.value?.hasCamera.value ?? false)
const mediaError = computed(() => peer.value?.mediaError.value ?? '')
const sharing = computed(() => !!peer.value?.screenStream.value)
const remoteSharing = computed(() => connected.value && (peer.value?.remoteSharing.value ?? false))
const presenting = computed(() => sharing.value || remoteSharing.value)
const layoutPresenting = ref(presenting.value)
const animatingLayout = ref(false)
watch(presenting, async (v) => {
  animatingLayout.value = true
  await nextTick()
  await withViewTransition(() => (layoutPresenting.value = v))
  animatingLayout.value = false
})

const statusPill = computed(() => {
  const who = firstName(otherPerson.value)
  switch (peerState.value) {
    case 'connected':
      return { text: 'Connected', tone: 'ok' }
    case 'waiting':
      return { text: `Waiting for ${who}`, tone: 'wait' }
    case 'reconnecting':
      return { text: 'Reconnecting…', tone: 'wait' }
    case 'peer-left':
      return { text: `${who} left`, tone: 'bad' }
    case 'failed':
      return { text: 'Connection failed', tone: 'bad' }
    default:
      return { text: 'Connecting…', tone: 'wait' }
  }
})

const people = computed(() => {
  const c = call.value
  const p = peer.value
  if (!c) return []
  const themSpeaking = connected.value && !!p?.remoteMic.value && !!p?.remoteSpeaking.value
  const meSpeaking = hasMic.value && !muted.value && !!p?.speaking.value
  const them = {
    key: 'them',
    name: otherPerson.value,
    tone: isConsultant.value ? 'client' : 'consultant',
    stream: p?.remoteStream.value ?? null,
    showVideo: connected.value && !!p?.remoteCamera.value,
    mirror: false,
    speaking: themSpeaking,
    mic: !connected.value
      ? 'Not connected'
      : !p?.remoteMic.value
        ? 'Muted'
        : themSpeaking
          ? 'Speaking'
          : 'Mic on',
  }
  const myName = isConsultant.value ? c.consultant.name : c.client.name
  const me = {
    key: 'me',
    name: `${myName} (you)`,
    tone: isConsultant.value ? 'consultant' : 'client',
    stream: p?.localStream.value ?? null,
    showVideo: hasCamera.value && !cameraOff.value,
    mirror: true,
    speaking: meSpeaking,
    mic: !hasMic.value ? 'No mic' : muted.value ? 'Muted' : meSpeaking ? 'Speaking' : 'Mic on',
  }
  return isConsultant.value ? [them, me] : [me, them]
})

function bindStream(el: unknown, stream: MediaStream | null | undefined) {
  const media = el as HTMLMediaElement | null
  if (media && media.srcObject !== (stream ?? null)) media.srcObject = stream ?? null
}
const screenSource = computed(() =>
  isConsultant.value ? peer.value?.remoteScreen.value : peer.value?.screenStream.value,
)

const canPickSpeaker = 'setSinkId' in HTMLMediaElement.prototype
async function onMicChange(e: Event) {
  const id = (e.target as HTMLSelectElement).value
  try {
    await peer.value?.setMic(id)
  } catch {
    toast.show('Could not switch microphone', 'error')
  }
}
const deviceLabel = (d: MediaDeviceInfo, i: number, kind: string) => d.label || `${kind} ${i + 1}`

const roomEl = ref<HTMLElement | null>(null)
const isFullscreen = ref(false)
const onFullscreenChange = () => (isFullscreen.value = !!document.fullscreenElement)
function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen()
  else void roomEl.value?.requestFullscreen()
}

onMounted(async () => {
  document.addEventListener('fullscreenchange', onFullscreenChange)
  try {
    await callStore.open(callId)
  } catch (e) {
    error.value =
      e instanceof ApiError && e.status === 404
        ? 'This call doesn’t exist or you’re not part of it.'
        : 'Could not load the call.'
  } finally {
    loading.value = false
  }
})
onUnmounted(() => document.removeEventListener('fullscreenchange', onFullscreenChange))

onBeforeRouteLeave(async () => {
  if (isConsultant.value && call.value?.status === 'RINGING') {
    await callsApi.cancel(callId).catch(() => {})
  }
})

function leave() {
  router.push(auth.user ? homeFor(auth.user.role) : '/login')
}

async function minimise() {
  const home = auth.user ? homeFor(auth.user.role) : '/login'
  if (await callStore.openPip()) {
    if (document.fullscreenElement) await document.exitFullscreen()
    router.push(home)
    return
  }
  if (document.fullscreenElement) await document.exitFullscreen()
  void withViewTransition(() => router.push(home))
}

async function endCall() {
  busy.value = true
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    await callStore.end()
  } catch (e) {
    toast.show(e instanceof ApiError ? e.message : 'Could not end the call', 'error')
  } finally {
    busy.value = false
  }
}

async function resolveRequest() {
  if (!call.value) return
  busy.value = true
  try {
    await helpRequestsApi.resolve(call.value.request.requestId)
    toast.show('Request marked as resolved')
    leave()
  } catch (e) {
    toast.show(e instanceof ApiError ? e.message : 'Could not resolve the request', 'error')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="call?.status === 'ACTIVE'" ref="roomEl" class="room">
    <header class="bar">
      <div class="bar-left">
        <span class="bar-icon" aria-hidden="true"><AppIcon name="message" :size="20" /></span>
        <div class="bar-titles">
          <h1>{{ call.request.title }}</h1>
          <span>
            Call with {{ otherPerson }} · {{ isConsultant ? 'Client' : 'Consultant' }}
          </span>
        </div>
      </div>
      <div class="bar-right">
        <span v-if="recording === 'ON'" class="pill rec" role="status" aria-label="Recording">
          <span class="dot" aria-hidden="true"></span>REC · {{ recordingElapsed }}
        </span>
        <span v-else-if="recording === 'REQUESTED'" class="pill wait" role="status">
          {{ isConsultant ? 'Asking to record…' : 'Recording requested' }}
        </span>
        <span class="pill" :class="statusPill.tone" role="status">
          <span class="dot" aria-hidden="true"></span>{{ statusPill.text }}
        </span>
        <span class="pill timer" aria-label="Call duration">{{ elapsed }}</span>
      </div>
    </header>

    <p v-if="mediaError" class="media-warn" role="alert">{{ mediaError }}</p>

    <main class="body" :class="{ presenting: layoutPresenting }">
      <section
        v-if="layoutPresenting"
        class="screen-col"
        :style="animatingLayout ? { viewTransitionName: 'shared-screen' } : undefined"
        aria-label="Shared screen"
      >
        <div class="screen-head">
          <span class="screen-label">
            <AppIcon name="screen" :size="16" />
            {{ isConsultant ? `Viewing ${firstName(otherPerson)}’s screen` : 'Your shared screen' }}
          </span>
        </div>
        <div class="screen-frame">
          <video
            :ref="(el) => bindStream(el, screenSource)"
            autoplay
            playsinline
            muted
          ></video>
        </div>
      </section>

      <section :class="layoutPresenting ? 'side' : 'stage'" aria-label="In this call">
        <h2 v-if="layoutPresenting" class="side-title">In this call</h2>
        <div class="people">
          <article
            v-for="p in people"
            :key="p.key"
            class="person"
            :class="[p.key, { speaking: p.speaking }]"
            :style="animatingLayout ? { viewTransitionName: `person-${p.key}` } : undefined"
          >
            <div class="media" :class="{ 'has-video': p.showVideo }">
              <video
                v-show="p.showVideo"
                :ref="(el) => bindStream(el, p.stream)"
                :class="{ mirror: p.mirror }"
                autoplay
                playsinline
                muted
              ></video>
              <span v-if="!p.showVideo" class="avatar" :class="p.tone" aria-hidden="true">
                {{ initials(p.name) }}
              </span>
            </div>
            <strong class="person-name">{{ p.name }}</strong>
            <span
              class="badge"
              :class="{ on: p.mic === 'Speaking', off: p.mic === 'Muted' || p.mic === 'No mic' }"
            >
              <AppIcon :name="p.mic === 'Muted' || p.mic === 'No mic' ? 'mic-off' : 'mic'" :size="14" />
              {{ p.mic }}
            </span>
          </article>
        </div>
      </section>
    </main>

    <footer class="controls">
      <button
        type="button"
        class="round"
        :class="{ off: muted }"
        :aria-pressed="muted"
        :aria-label="muted ? 'Unmute' : 'Mute'"
        :title="muted ? 'Unmute' : 'Mute'"
        :disabled="!hasMic"
        @click="peer?.toggleMute()"
      >
        <AppIcon :name="muted || !hasMic ? 'mic-off' : 'mic'" :size="20" />
      </button>
      <button
        type="button"
        class="round"
        :class="{ off: cameraOff }"
        :aria-pressed="cameraOff"
        :aria-label="cameraOff ? 'Turn camera on' : 'Turn camera off'"
        :title="cameraOff ? 'Turn camera on' : 'Turn camera off'"
        :disabled="!hasCamera"
        @click="peer?.toggleCamera()"
      >
        <AppIcon :name="cameraOff || !hasCamera ? 'video-off' : 'video'" :size="20" />
      </button>

      <label v-if="peer?.mics.value.length" class="field">
        <span>Microphone</span>
        <select :value="peer.micId.value" :disabled="!hasMic" @change="onMicChange">
          <option v-for="(d, i) in peer.mics.value" :key="d.deviceId" :value="d.deviceId">
            {{ deviceLabel(d, i, 'Microphone') }}
          </option>
        </select>
      </label>
      <label v-if="canPickSpeaker && peer?.speakers.value.length" class="field">
        <span>Speaker</span>
        <select v-model="speakerId">
          <option value="">System default</option>
          <option v-for="(d, i) in peer.speakers.value" :key="d.deviceId" :value="d.deviceId">
            {{ deviceLabel(d, i, 'Speaker') }}
          </option>
        </select>
      </label>

      <button
        v-if="!isConsultant"
        type="button"
        class="ctrl-btn"
        :class="{ active: sharing }"
        :aria-pressed="sharing"
        :disabled="!connected"
        @click="sharing ? peer?.stopShare() : peer?.shareScreen()"
      >
        <AppIcon name="screen" :size="18" />{{ sharing ? 'Stop sharing' : 'Share screen' }}
      </button>
      <button
        v-if="isConsultant || recording === 'ON'"
        type="button"
        class="ctrl-btn"
        :class="{ recording: recording === 'ON' }"
        :aria-pressed="recording === 'ON'"
        :disabled="!connected || recording === 'REQUESTED' || recordingBusy"
        @click="onRecordClick"
      >
        <AppIcon name="record" :size="18" />{{ recordLabel }}
      </button>
      <button
        type="button"
        class="round"
        :aria-pressed="isFullscreen"
        :aria-label="isFullscreen ? 'Exit full screen' : 'Full screen'"
        :title="isFullscreen ? 'Exit full screen' : 'Full screen'"
        @click="toggleFullscreen"
      >
        <AppIcon :name="isFullscreen ? 'shrink' : 'expand'" :size="20" />
      </button>
      <button
        type="button"
        class="round"
        aria-label="Minimise call"
        :title="
          callStore.canPip
            ? 'Pop out — keep the call on top while you use other tabs and apps'
            : 'Minimise — keep the call going while you use the portal'
        "
        @click="minimise"
      >
        <AppIcon name="minimise" :size="20" />
      </button>
      <button type="button" class="end" :disabled="busy" @click="endCall">
        <AppIcon name="phone-off" :size="20" />{{ busy ? 'Ending…' : 'End call' }}
      </button>
    </footer>
  </div>

  <div v-else class="call-page">
    <p v-if="loading" class="muted">Loading call…</p>

    <div v-else-if="error" class="card">
      <h1>Call unavailable</h1>
      <p class="muted">{{ error }}</p>
      <button type="button" class="btn" @click="leave">Back to dashboard</button>
    </div>

    <div v-else-if="call" class="card">
      <span class="label">Call about</span>
      <h1>{{ call.request.title }}</h1>
      <p class="muted">
        With <strong>{{ otherPerson }}</strong>
      </p>

      <template v-if="call.status === 'RINGING'">
        <p class="notice">
          {{ isConsultant ? `Ringing ${call.client.name}…` : 'Connecting…' }}
        </p>
        <button type="button" class="btn" @click="leave">
          {{ isConsultant ? 'Cancel call' : 'Leave' }}
        </button>
      </template>

      <template v-else-if="['ENDED', 'PROCESSING', 'READY', 'FAILED'].includes(call.status)">
        <template v-if="isConsultant">
          <div class="prompt">
            <strong>Call ended. Is {{ call.client.name }}’s issue resolved?</strong>
            <span>Resolving closes the request. Keep it open if you need another call.</span>
          </div>
          <div class="actions">
            <button type="button" class="btn secondary" :disabled="busy" @click="leave">
              Keep open
            </button>
            <button type="button" class="btn resolve" :disabled="busy" @click="resolveRequest">
              Mark as resolved
            </button>
          </div>
        </template>
        <template v-else>
          <p class="notice">The call has ended.</p>
          <button type="button" class="btn" @click="leave">Back to dashboard</button>
        </template>
      </template>

      <template v-else>
        <p v-if="call.status === 'DECLINED'" class="notice warn">
          {{ isConsultant ? `${call.client.name} declined the call.` : 'You declined this call.' }}
          The request is still open.
        </p>
        <p v-else-if="call.status === 'MISSED'" class="notice warn">
          <template v-if="isConsultant">
            <strong>Not picked up.</strong> The request is still open.
          </template>
          <template v-else><strong>Missed.</strong> Your request is still open.</template>
        </p>
        <p v-else class="notice">Status: {{ call.status }}</p>
        <button type="button" class="btn" @click="leave">Back to dashboard</button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.room {
  --room-bg: #061a2f;
  --panel: rgba(255, 255, 255, 0.05);
  --panel-border: rgba(255, 255, 255, 0.09);
  --green-text: #4ade80;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--room-bg);
  view-transition-name: call-window;
  color: var(--on-dark);
  overflow: hidden;
}

.bar {
  flex: none;
  padding: 14px 24px;
  border-bottom: 1px solid var(--panel-border);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.bar-left {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 14px;
}
.bar-icon {
  width: 40px;
  height: 40px;
  flex: none;
  border-radius: 10px;
  background: var(--capture-yellow);
  color: var(--space-blue);
  display: flex;
  align-items: center;
  justify-content: center;
}
.bar-titles {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.bar-titles h1 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bar-titles span {
  font-size: 13px;
  color: var(--on-dark-subtle);
}
.bar-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.pill {
  height: 32px;
  padding: 0 14px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  font-size: 13px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.pill .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}
.pill.ok {
  background: rgba(23, 217, 75, 0.14);
  color: var(--green-text);
}
.pill.wait {
  background: rgba(255, 208, 0, 0.12);
  color: var(--capture-yellow);
}
.pill.bad {
  background: rgba(240, 68, 56, 0.16);
  color: #fda29b;
}
.pill.rec {
  background: rgba(240, 68, 56, 0.16);
  color: #fda29b;
  font-variant-numeric: tabular-nums;
}
.pill.rec .dot {
  background: #f04438;
  animation: rec-blink 1.2s ease-in-out infinite;
}
@keyframes rec-blink {
  50% {
    opacity: 0.3;
  }
}
@media (prefers-reduced-motion: reduce) {
  .pill.rec .dot {
    animation: none;
  }
}
.pill.timer {
  font-variant-numeric: tabular-nums;
}

.media-warn {
  margin: 12px 24px 0;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  background: rgba(255, 208, 0, 0.12);
  color: var(--capture-yellow);
  font-size: 13px;
}

.body {
  flex: 1;
  min-height: 0;
  padding: 20px 24px;
  display: flex;
  gap: 20px;
}

.stage {
  flex: 1;
  min-height: 0;
  padding: 24px;
  border: 1px solid var(--panel-border);
  border-radius: var(--radius-xl);
  background: radial-gradient(ellipse at top, #0e3358 0%, #08223d 60%);
  overflow: auto;
  display: flex;
  align-items: center;
  justify-content: center;
}
.stage .people {
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 24px;
}
.stage .person {
  flex: 1 1 420px;
  max-width: 600px;
}

.screen-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.screen-head,
.side-title {
  height: 24px;
  display: flex;
  align-items: center;
}
.screen-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--on-dark-muted);
}
.screen-label :deep(svg) {
  color: var(--nurture-blue);
}
.screen-frame {
  position: relative;
  flex: 1;
  min-height: 0;
  padding: 12px;
  border: 1px solid rgba(40, 150, 251, 0.35);
  border-radius: var(--radius-lg);
  background: #0a2540;
}
.screen-frame video {
  width: 100%;
  height: 100%;
  border-radius: var(--radius-sm);
  object-fit: contain;
}
.side {
  width: 320px;
  flex: none;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.side-title {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--on-dark-muted);
}
.side .people {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.person {
  padding: 18px;
  border: 2px solid transparent;
  border-radius: var(--radius-lg);
  background: var(--panel);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  text-align: center;
  transition: border-color 0.15s;
}
.person.speaking {
  border-color: var(--close-green);
}
.media {
  width: 100%;
  aspect-ratio: 16 / 9;
  margin-bottom: 8px;
  border-radius: var(--radius-md);
  overflow: hidden;
  background: rgba(255, 255, 255, 0.04);
  display: flex;
  align-items: center;
  justify-content: center;
}
.media.has-video {
  background: #000;
}
.media video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.media video.mirror {
  transform: scaleX(-1);
}
.avatar {
  width: 112px;
  height: 112px;
  border-radius: 50%;
  box-shadow: 0 0 0 8px rgba(255, 255, 255, 0.06);
  color: var(--space-blue);
  font-size: 34px;
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
.side .avatar {
  width: 72px;
  height: 72px;
  font-size: 24px;
  box-shadow: none;
}
.side .person {
  padding: 14px;
}
.person-name {
  font-size: 16px;
  font-weight: 600;
}
.badge {
  margin-top: 2px;
  height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--on-dark-muted);
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.badge.on {
  color: var(--green-text);
}
.badge.off {
  color: #fda29b;
}

.controls {
  flex: none;
  padding: 12px 24px 22px;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: center;
  gap: 12px;
}
.round {
  width: 52px;
  height: 52px;
  flex: none;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  color: var(--on-dark);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.round:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.16);
}
.round.off {
  background: #d92d20;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--on-dark-subtle);
}
.field select {
  width: 220px;
  height: 44px;
  padding: 0 40px 0 14px;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23c9d6e5' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 14px center;
  text-overflow: ellipsis;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: var(--radius-md);
  background-color: #0c2a49;
  color: var(--on-dark);
  font: inherit;
  font-size: 14px;
}
.ctrl-btn {
  height: 52px;
  padding: 0 20px;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  color: var(--on-dark);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.ctrl-btn.active {
  background: var(--nurture-blue);
  color: var(--space-blue);
}
.ctrl-btn.recording {
  background: rgba(240, 68, 56, 0.18);
  color: #fda29b;
}
.end {
  height: 52px;
  padding: 0 26px;
  border: none;
  border-radius: 999px;
  background: #e5372a;
  color: #fff;
  font: inherit;
  font-size: 16px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}
.room button:disabled,
.room select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.room button:focus-visible,
.room select:focus-visible {
  outline: 2px solid var(--nurture-blue);
  outline-offset: 2px;
}

@media (max-width: 760px) {
  .room {
    height: auto;
    min-height: 100vh;
    overflow: visible;
  }
  .bar,
  .body,
  .controls {
    padding-left: 16px;
    padding-right: 16px;
  }
  .body {
    flex-direction: column;
  }
  .screen-frame {
    flex: none;
    aspect-ratio: 16 / 10;
  }
  .side {
    width: 100%;
  }
  .side .people {
    flex-direction: row;
  }
  .side .person {
    flex: 1;
    min-width: 0;
  }
  .field select {
    width: 160px;
  }
}

.call-page {
  min-height: 100vh;
  padding: 40px 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--space-blue);
}
.card {
  width: 100%;
  max-width: 520px;
  padding: 32px;
  border-radius: var(--radius-xl);
  background: var(--surface);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}
.label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.card h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
}
.muted {
  margin: 0;
  font-size: 15px;
  color: var(--text-muted);
}
.call-page > .muted {
  color: var(--on-dark-muted);
}
.notice {
  margin: 8px 0;
  padding: 12px 14px;
  border-radius: var(--radius-md);
  background: #e3f1ff;
  color: var(--link);
  font-size: 14px;
}
.notice.warn {
  background: #fff4c2;
  color: #6b5000;
}
.prompt {
  margin: 8px 0;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 14px;
}
.prompt span {
  color: var(--text-muted);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.btn {
  height: 44px;
  padding: 0 20px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--space-blue);
  color: var(--on-dark);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
.btn.secondary {
  border: 1px solid var(--border-strong);
  background: var(--surface);
  color: var(--text);
}
.btn.resolve {
  background: var(--close-green);
  color: var(--space-blue);
}
.btn:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>
