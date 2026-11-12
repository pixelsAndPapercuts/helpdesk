<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import HelpRequestQueue from '../../components/consultant/HelpRequestQueue.vue'
import PreCallModal from '../../components/PreCallModal.vue'
import { callsApi } from '../../api/calls'
import { helpRequestsApi } from '../../api/helpRequests'
import { ApiError } from '../../api/http'
import { connected, onEvent } from '../../communication/socket'
import { useToastStore } from '../../stores/toast'
import type { HelpRequest } from '../../types'

const toast = useToastStore()

const busy = ref<{ requestId: string; action: 'start' | 'resolve' } | null>(null)
const requests = ref<HelpRequest[]>([])
const newIds = ref(new Set<string>())
const loading = ref(true)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    const fetched = await helpRequestsApi.list()
    const fetchedIds = new Set(fetched.map((r) => r.requestId))
    requests.value = [...requests.value.filter((r) => !fetchedIds.has(r.requestId)), ...fetched]
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Could not load requests.'
  } finally {
    loading.value = false
  }
}

function onRequestCreated(request: HelpRequest) {
  if (requests.value.some((r) => r.requestId === request.requestId)) return
  requests.value.unshift(request)
  newIds.value.add(request.requestId)
  toast.show(`New request from ${request.client.name}`)
}

function onRequestUpdated(updated: HelpRequest) {
  const i = requests.value.findIndex((r) => r.requestId === updated.requestId)
  if (i !== -1) requests.value[i] = updated
}

const starting = ref<HelpRequest | null>(null)
function startCall(request: HelpRequest) {
  starting.value = request
}
async function confirmStart(): Promise<string> {
  return (await callsApi.start(starting.value!.requestId)).callId
}

async function resolveRequest(request: HelpRequest) {
  busy.value = { requestId: request.requestId, action: 'resolve' }
  try {
    onRequestUpdated(await helpRequestsApi.resolve(request.requestId))
    toast.show(`Resolved “${request.title}”`)
  } catch (e) {
    toast.show(e instanceof ApiError ? e.message : 'Could not resolve the request', 'error')
  } finally {
    busy.value = null
  }
}

let unsubscribers: (() => void)[] = []

onMounted(() => {
  unsubscribers = [
    onEvent<HelpRequest>('help-request.created', onRequestCreated),
    onEvent<HelpRequest>('help-request.updated', onRequestUpdated),
  ]
  load()
})
onUnmounted(() => unsubscribers.forEach((off) => off()))
</script>

<template>
  <div class="header">
    <div class="titles">
      <h1 class="page-title">Help requests</h1>
      <p class="page-subtitle">New requests from your clients appear here instantly.</p>
    </div>
    <span class="live" :class="{ off: !connected }" role="status">
      <span class="dot" aria-hidden="true"></span>
      {{ connected ? 'Live updates on' : 'Reconnecting…' }}
    </span>
  </div>

  <p v-if="loading" class="state">Loading requests…</p>

  <div v-else-if="error" class="state error" role="alert">
    {{ error }}
    <button type="button" class="link" @click="load">Try again</button>
  </div>

  <HelpRequestQueue
    v-else
    :requests="requests"
    :new-ids="newIds"
    :busy="busy"
    @start-call="startCall"
    @resolve="resolveRequest"
  />

  <PreCallModal
    :open="!!starting"
    title="Ready to start the call?"
    :subtitle="starting ? `Call ${starting.client.name} about “${starting.title}”` : ''"
    confirm-label="Start call"
    busy-label="Starting…"
    :confirm="confirmStart"
    :ringing="starting?.client.name"
    @close="starting = null"
    @done="starting = null"
  />
</template>

<style scoped>
.header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}
.titles {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.live {
  height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  background: #e0f8e7;
  color: #0b6b2a;
  font-size: 13px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.live .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--close-green);
}
.live.off {
  background: #edf1f6;
  color: var(--text-muted);
}
.live.off .dot {
  background: var(--border-strong);
}

.state {
  margin: 0;
  font-size: 14px;
  color: var(--text-muted);
}
.state.error {
  color: #b42318;
  display: flex;
  align-items: center;
  gap: 12px;
}
.link {
  border: none;
  background: none;
  padding: 0;
  color: var(--link);
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
}
</style>
