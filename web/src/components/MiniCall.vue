<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from './AppIcon.vue'
import BaseModal from './BaseModal.vue'
import { ApiError } from '../api/http'
import { useCallStore, withViewTransition } from '../stores/call'
import { useToastStore } from '../stores/toast'
import { initials } from '../utils/format'

const store = useCallStore()
const route = useRoute()
const router = useRouter()
const toast = useToastStore()

const peer = computed(() => store.peer)
const onCallPage = computed(() => route.path.startsWith('/call/'))
const inPip = computed(() => !!store.pipWindow)
const pipBody = computed(() => store.pipWindow?.document.body ?? null)
const show = computed(() => store.active && (inPip.value || !onCallPage.value))

const connected = computed(() => peer.value?.state.value === 'connected')
const muted = computed(() => peer.value?.muted.value ?? false)
const cameraOff = computed(() => peer.value?.cameraOff.value ?? false)
const hasMic = computed(() => peer.value?.hasMic.value ?? false)
const hasCamera = computed(() => peer.value?.hasCamera.value ?? false)
const sharing = computed(() => !!peer.value?.screenStream.value)

const view = computed(() => {
  const p = peer.value
  if (store.isConsultant && connected.value && p?.remoteSharing.value && p.remoteScreen.value)
    return { stream: p.remoteScreen.value, fit: 'contain' as const }
  if (p?.screenStream.value) return { stream: p.screenStream.value, fit: 'contain' as const }
  if (connected.value && p?.remoteCamera.value && p.remoteStream.value)
    return { stream: p.remoteStream.value, fit: 'cover' as const }
  return null
})
const statusText = computed(() => {
  switch (peer.value?.state.value) {
    case 'connected':
      return store.elapsed
    case 'waiting':
      return 'Waiting…'
    case 'peer-left':
      return 'Left the call'
    case 'failed':
      return 'Connection failed'
    default:
      return 'Connecting…'
  }
})

function bindStream(el: unknown, stream: MediaStream | null | undefined) {
  const media = el as HTMLMediaElement | null
  if (media && media.srcObject !== (stream ?? null)) media.srcObject = stream ?? null
}

const voiceEl = ref<HTMLAudioElement | null>(null)
watch([() => store.speakerId, voiceEl], ([id, el]) => {
  if (el && id) void el.setSinkId(id).catch(() => toast.show('Could not switch speaker', 'error'))
})

watch(
  () => store.call?.status,
  (status, prev) => {
    if (prev === 'ACTIVE' && status === 'ENDED' && !onCallPage.value) {
      toast.show(`Call with ${store.otherPerson} ended`)
    }
  },
)

function openCall() {
  const call = store.call
  if (!call) return
  if (inPip.value) {
    store.closePip()
    window.focus()
    router.push(`/call/${call.callId}`)
  } else {
    void withViewTransition(() => router.push(`/call/${call.callId}`))
  }
}
const ending = ref(false)
async function endCall() {
  ending.value = true
  try {
    await store.end()
  } catch (e) {
    toast.show(e instanceof ApiError ? e.message : 'Could not end the call', 'error')
  } finally {
    ending.value = false
  }
}

const recordingOn = computed(() => store.recording === 'ON')
const answering = ref(false)
async function answerConsent(allow: boolean) {
  if (answering.value) return
  answering.value = true
  try {
    await (allow ? store.allowRecording() : store.declineRecording())
  } catch (e) {
    toast.show(e instanceof ApiError ? e.message : 'Could not answer the recording request', 'error')
  } finally {
    answering.value = false
  }
}

const pos = ref<{ x: number; y: number } | null>(null)
const winEl = ref<HTMLElement | null>(null)
function startDrag(e: PointerEvent) {
  if (inPip.value || (e.target as HTMLElement).closest('button') || !winEl.value) return
  const box = winEl.value.getBoundingClientRect()
  const dx = e.clientX - box.left
  const dy = e.clientY - box.top
  const move = (ev: PointerEvent) => {
    pos.value = {
      x: Math.min(Math.max(0, ev.clientX - dx), innerWidth - box.width),
      y: Math.min(Math.max(0, ev.clientY - dy), innerHeight - box.height),
    }
  }
  const stop = () => {
    removeEventListener('pointermove', move)
    removeEventListener('pointerup', stop)
  }
  addEventListener('pointermove', move)
  addEventListener('pointerup', stop)
}
const posStyle = computed(() =>
  pos.value ? { left: `${pos.value.x}px`, top: `${pos.value.y}px`, right: 'auto', bottom: 'auto' } : {},
)
</script>

<template>
  <audio
    v-if="peer"
    ref="voiceEl"
    :srcObject.prop="peer.remoteStream.value ?? null"
    autoplay
  ></audio>

  <Teleport :to="pipBody ?? 'body'" :disabled="!pipBody">
  <aside
    v-if="show"
    :key="inPip ? 'pip' : 'tab'"
    ref="winEl"
    class="mini"
    :class="{ 'in-pip': inPip }"
    :style="inPip ? undefined : posStyle"
    aria-label="Ongoing call"
  >
    <header class="head" @pointerdown="startDrag">
      <span class="dot" :class="{ ok: connected }" aria-hidden="true"></span>
      <div class="titles">
        <strong>{{ store.otherPerson }}</strong>
        <span>
          <template v-if="recordingOn"><span class="rec-tag">● REC</span> · </template>{{ statusText }}
        </span>
      </div>
      <button type="button" class="icon-btn" aria-label="Open call" title="Open call" @click="openCall">
        <AppIcon name="expand" :size="16" />
      </button>
    </header>

    <div class="media">
      <video
        v-if="view"
        :ref="(el) => bindStream(el, view?.stream)"
        :style="{ objectFit: view.fit }"
        autoplay
        playsinline
        muted
      ></video>
      <span v-else class="avatar" :class="store.isConsultant ? 'client' : 'consultant'" aria-hidden="true">
        {{ initials(store.otherPerson) }}
      </span>
      <span v-if="sharing" class="chip">
        <span class="rec" aria-hidden="true"></span>You’re sharing your screen
      </span>
    </div>

    <div v-if="inPip && store.consentPending" class="consent" role="alert">
      <p><strong>{{ store.otherPerson }}</strong> wants to record this call.</p>
      <div class="consent-actions">
        <button type="button" class="ghost" :disabled="answering" @click="answerConsent(false)">
          Don’t allow
        </button>
        <button type="button" class="allow" :disabled="answering" @click="answerConsent(true)">
          Allow
        </button>
      </div>
    </div>

    <div class="controls">
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
        <AppIcon :name="muted || !hasMic ? 'mic-off' : 'mic'" :size="18" />
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
        <AppIcon :name="cameraOff || !hasCamera ? 'video-off' : 'video'" :size="18" />
      </button>
      <button
        v-if="sharing"
        type="button"
        class="round off"
        aria-label="Stop sharing"
        title="Stop sharing"
        @click="peer?.stopShare()"
      >
        <AppIcon name="screen" :size="18" />
      </button>
      <button
        type="button"
        class="end"
        aria-label="End call"
        title="End call"
        :disabled="ending"
        @click="endCall"
      >
        <AppIcon name="phone-off" :size="18" />
      </button>
    </div>
  </aside>
  </Teleport>

  <BaseModal
    :open="store.consentPending && !inPip"
    title="Allow recording?"
    :subtitle="`${store.otherPerson} wants to record this call.`"
    @close="answerConsent(false)"
  >
    <div class="consent-body">
      <p>
        The recording includes <strong>your shared screen and both voices</strong>. It’s used to
        make a transcript and summary of the call.
      </p>
      <p class="consent-note">You can stop the recording at any time during the call.</p>
      <div class="consent-buttons">
        <button type="button" class="btn secondary" :disabled="answering" @click="answerConsent(false)">
          Don’t allow
        </button>
        <button type="button" class="btn primary" :disabled="answering" @click="answerConsent(true)">
          Allow recording
        </button>
      </div>
    </div>
  </BaseModal>
</template>

<style scoped>
.mini {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 90;
  width: 300px;
  max-width: calc(100vw - 32px);
  border-radius: var(--radius-lg);
  background: #061a2f;
  color: var(--on-dark);
  box-shadow: 0 12px 32px rgba(7, 34, 61, 0.35);
  overflow: hidden;
  view-transition-name: call-window;
}
.mini.in-pip {
  position: static;
  width: 100%;
  max-width: none;
  height: 100vh;
  border-radius: 0;
  box-shadow: none;
  display: flex;
  flex-direction: column;
}
.mini.in-pip .head {
  cursor: default;
}
.mini.in-pip .media {
  flex: 1;
  min-height: 0;
  aspect-ratio: auto;
}
.head {
  padding: 10px 10px 10px 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: grab;
  touch-action: none;
  user-select: none;
}
.head:active {
  cursor: grabbing;
}
.dot {
  width: 8px;
  height: 8px;
  flex: none;
  border-radius: 50%;
  background: var(--capture-yellow);
}
.dot.ok {
  background: var(--close-green);
}
.titles {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.titles strong {
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.titles span {
  font-size: 12px;
  color: var(--on-dark-subtle);
  font-variant-numeric: tabular-nums;
}
.icon-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.08);
  color: var(--on-dark);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.media {
  position: relative;
  aspect-ratio: 16 / 9;
  background: #0a2540;
  display: flex;
  align-items: center;
  justify-content: center;
}
.media video {
  width: 100%;
  height: 100%;
  background: #000;
}
.avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  color: var(--space-blue);
  font-size: 22px;
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
.chip {
  position: absolute;
  left: 8px;
  bottom: 8px;
  padding: 3px 10px;
  border-radius: 999px;
  background: rgba(6, 26, 47, 0.85);
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}
.rec {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #f04438;
}
.titles .rec-tag {
  color: #fda29b;
  font-weight: 700;
}
.consent {
  padding: 10px 12px;
  background: rgba(255, 208, 0, 0.12);
  font-size: 13px;
}
.consent p {
  margin: 0 0 8px;
}
.consent-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.consent-actions button {
  height: 32px;
  padding: 0 12px;
  border: none;
  border-radius: 999px;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.consent-actions .ghost {
  background: rgba(255, 255, 255, 0.1);
  color: var(--on-dark);
}
.consent-actions .allow {
  background: var(--capture-yellow);
  color: var(--space-blue);
}
.consent-body p {
  margin: 0 0 12px;
  font-size: 15px;
  line-height: 1.5;
}
.consent-body .consent-note {
  color: var(--text-muted);
  font-size: 14px;
}
.consent-buttons {
  margin-top: 8px;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
.btn {
  height: 44px;
  padding: 0 20px;
  border-radius: var(--radius-md);
  color: var(--text);
  font: inherit;
  cursor: pointer;
}
.btn.secondary {
  border: 1px solid var(--border-strong);
  background: var(--surface);
  font-weight: 500;
}
.btn.primary {
  border: none;
  background: var(--capture-yellow);
  font-weight: 600;
}
.btn:disabled {
  opacity: 0.6;
  cursor: default;
}
.controls {
  padding: 10px;
  display: flex;
  justify-content: center;
  gap: 8px;
}
.round,
.end {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  color: var(--on-dark);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.round.off {
  background: #d92d20;
}
.end {
  width: 56px;
  border-radius: 999px;
  background: #e5372a;
}
.mini button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.mini button:focus-visible {
  outline: 2px solid var(--nurture-blue);
  outline-offset: 2px;
}
</style>
