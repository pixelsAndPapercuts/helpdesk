<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from './AppIcon.vue'
import BaseModal from './BaseModal.vue'
import DevicePreview from './DevicePreview.vue'
import { callsApi } from '../api/calls'
import { ApiError } from '../api/http'
import { onEvent } from '../communication/socket'
import { useCallStore } from '../stores/call'
import { useToastStore } from '../stores/toast'
import type { Call } from '../types'

const props = defineProps<{
  open: boolean
  title: string
  subtitle: string
  confirmLabel: string
  busyLabel: string
  confirm: () => Promise<string>
  ringing?: string
}>()
const emit = defineEmits<{ close: []; done: [] }>()

const router = useRouter()
const store = useCallStore()
const toast = useToastStore()
const busy = ref(false)

type Phase = 'ready' | 'ringing' | 'declined' | 'missed'
const phase = ref<Phase>('ready')
const callId = ref<string | null>(null)
watch(
  () => props.open,
  (open) => {
    if (open) {
      phase.value = 'ready'
      callId.value = null
    }
  },
)

const heading = computed(() => {
  switch (phase.value) {
    case 'ringing':
      return `Calling ${props.ringing}…`
    case 'declined':
      return `${props.ringing} declined the call`
    case 'missed':
      return `${props.ringing} didn’t pick up`
    default:
      return props.title
  }
})

function enterCall(id: string) {
  phase.value = 'ready'
  callId.value = null
  store.keepPreview()
  emit('done')
  router.push(`/call/${id}`)
}

async function onConfirm() {
  busy.value = true
  try {
    const id = await props.confirm()
    if (!props.ringing) return enterCall(id)
    callId.value = id
    phase.value = 'ringing'
  } catch (e) {
    toast.show(e instanceof ApiError ? e.message : 'Could not start the call', 'error')
    emit('close')
  } finally {
    busy.value = false
  }
}

async function cancelRinging() {
  const id = callId.value
  if (phase.value !== 'ringing' || !id) return
  phase.value = 'ready'
  callId.value = null
  await callsApi.cancel(id).catch(() => {})
}
function close() {
  void cancelRinging()
  emit('close')
}

let offs: (() => void)[] = []
onMounted(() => {
  const mine = (call: Call) => phase.value === 'ringing' && call.callId === callId.value
  offs = [
    onEvent<Call>('call.accepted', (call) => mine(call) && enterCall(call.callId)),
    onEvent<Call>('call.declined', (call) => mine(call) && (phase.value = 'declined')),
    onEvent<Call>('call.missed', (call) => mine(call) && (phase.value = 'missed')),
  ]
})
onUnmounted(() => {
  offs.forEach((off) => off())
  void cancelRinging()
})
</script>

<template>
  <BaseModal :open="open" :title="heading" :subtitle="subtitle" @close="close">
    <DevicePreview v-if="open" />

    <p v-if="phase === 'ringing'" class="status ringing" role="status">
      <span class="pulse" aria-hidden="true"></span>Ringing {{ ringing }}
    </p>
    <p v-else-if="phase === 'declined' || phase === 'missed'" class="status warn" role="status">
      The request is still open. You can try again now or later.
    </p>

    <div class="actions">
      <template v-if="phase === 'ringing'">
        <button type="button" class="btn danger" @click="cancelRinging">
          <AppIcon name="phone-off" :size="16" />Cancel call
        </button>
      </template>
      <template v-else>
        <button type="button" class="btn secondary" :disabled="busy" @click="close">
          {{ phase === 'ready' ? 'Not now' : 'Close' }}
        </button>
        <button type="button" class="btn primary" :disabled="busy" @click="onConfirm">
          {{ busy ? busyLabel : phase === 'ready' ? confirmLabel : 'Call again' }}
        </button>
      </template>
    </div>
  </BaseModal>
</template>

<style scoped>
.status {
  margin: 0;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.status.ringing {
  background: #e3f1ff;
  color: var(--link);
}
.status.warn {
  background: #fdecea;
  color: #b42318;
}
.pulse {
  width: 10px;
  height: 10px;
  flex: none;
  border-radius: 50%;
  background: var(--nurture-blue);
  animation: pulse 1.2s ease-in-out infinite;
}
@keyframes pulse {
  50% {
    transform: scale(1.6);
    opacity: 0.4;
  }
}
@media (prefers-reduced-motion: reduce) {
  .pulse {
    animation: none;
  }
}
.actions {
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
  display: inline-flex;
  align-items: center;
  gap: 8px;
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
.btn.danger {
  border: none;
  background: #e5372a;
  color: #fff;
  font-weight: 600;
}
.btn:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>
