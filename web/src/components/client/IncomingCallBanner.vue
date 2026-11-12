<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import AppIcon from '../AppIcon.vue'
import PreCallModal from '../PreCallModal.vue'
import { callsApi } from '../../api/calls'
import { ApiError } from '../../api/http'
import { onEvent } from '../../communication/socket'
import { useToastStore } from '../../stores/toast'
import type { Call } from '../../types'

const toast = useToastStore()

const call = ref<Call | null>(null)
const busy = ref(false)

let unsubscribers: (() => void)[] = []
onMounted(() => {
  unsubscribers = [
    onEvent<Call>('call.incoming', (incoming) => {
      call.value = incoming
      joinOpen.value = false
    }),
    onEvent<Call>('call.missed', (missed) => (call.value = missed)),
  ]
})
onUnmounted(() => unsubscribers.forEach((off) => off()))

const joinOpen = ref(false)
function onJoined() {
  joinOpen.value = false
  call.value = null
}
async function accept(): Promise<string> {
  return (await callsApi.accept(call.value!.callId)).callId
}

async function decline() {
  if (!call.value) return
  busy.value = true
  try {
    await callsApi.decline(call.value.callId)
    toast.show('Call declined')
  } catch (e) {
    toast.show(e instanceof ApiError ? e.message : 'Could not decline the call', 'error')
  } finally {
    busy.value = false
    call.value = null
  }
}
</script>

<template>
  <section
    v-if="call?.status === 'RINGING'"
    class="banner"
    role="alert"
    aria-label="Incoming call"
  >
    <div class="who">
      <span class="icon"><AppIcon name="video" :size="22" /></span>
      <div class="text">
        <span class="title">{{ call.consultant.name }} is calling you</span>
        <span class="about">About: {{ call.request.title }}</span>
      </div>
    </div>
    <div class="actions">
      <button type="button" class="btn secondary" :disabled="busy" @click="decline">Decline</button>
      <button type="button" class="btn primary" :disabled="busy" @click="joinOpen = true">
        Join call
      </button>
    </div>
  </section>

  <section v-else-if="call?.status === 'MISSED'" class="banner missed" role="status">
    <div class="who">
      <span class="icon"><AppIcon name="video" :size="22" /></span>
      <div class="text">
        <span class="title">
          <span class="missed-tag">MISSED</span>
          Call from {{ call.consultant.name }}
        </span>
        <span class="about">About: {{ call.request.title }} · Your request is still open.</span>
      </div>
    </div>
    <div class="actions">
      <button type="button" class="btn secondary" @click="call = null">Dismiss</button>
    </div>
  </section>

  <PreCallModal
    v-if="call"
    :open="joinOpen && call.status === 'RINGING'"
    title="Ready to join?"
    :subtitle="`${call.consultant.name} is calling about “${call.request.title}”`"
    confirm-label="Join now"
    busy-label="Joining…"
    :confirm="accept"
    @close="joinOpen = false"
    @done="onJoined"
  />
</template>

<style scoped>
.banner {
  padding: 20px 24px;
  border: 1px solid #bfddfd;
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: 0 6px 20px rgba(40, 150, 251, 0.12);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.who {
  display: flex;
  align-items: center;
  gap: 16px;
}
.icon {
  width: 48px;
  height: 48px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: #e3f1ff;
  color: var(--link);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: pulse 1.6s ease-in-out infinite;
}
.text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.title {
  font-size: 16px;
  font-weight: 600;
}
.about {
  font-size: 14px;
  color: var(--text-muted);
}
.actions {
  display: flex;
  gap: 12px;
}
.btn {
  height: 44px;
  padding: 0 20px;
  border-radius: var(--radius-md);
  font-size: 14px;
  color: var(--text);
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

.banner.missed {
  border-color: var(--border);
  box-shadow: none;
}
.banner.missed .icon {
  background: #fdecea;
  color: #b42318;
  animation: none;
}
.missed-tag {
  height: 20px;
  margin-right: 6px;
  padding: 0 8px;
  border-radius: 999px;
  background: #fdecea;
  color: #b42318;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
}

@keyframes pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(40, 150, 251, 0.35);
  }
  50% {
    box-shadow: 0 0 0 10px rgba(40, 150, 251, 0);
  }
}
@media (prefers-reduced-motion: reduce) {
  .icon {
    animation: none;
  }
}
</style>
