<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '../../components/AppIcon.vue'
import RaiseHelpRequestModal from '../../components/client/RaiseHelpRequestModal.vue'
import HelpRequestsTable from '../../components/client/HelpRequestsTable.vue'
import { helpRequestsApi } from '../../api/helpRequests'
import { ApiError } from '../../api/http'
import { onEvent } from '../../communication/socket'
import { useToastStore } from '../../stores/toast'
import type { HelpRequest } from '../../types'

const route = useRoute()
const router = useRouter()
const toast = useToastStore()

const requests = ref<HelpRequest[]>([])
const loading = ref(true)
const error = ref('')
const modalOpen = ref(false)

async function load() {
  loading.value = true
  error.value = ''
  try {
    requests.value = await helpRequestsApi.list()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Could not load your requests.'
  } finally {
    loading.value = false
  }
}

function onCreated(request: HelpRequest) {
  requests.value.unshift(request)
  modalOpen.value = false
  toast.show('A consultant will reach out to you shortly.')
}

let unsubscribe = () => {}
onUnmounted(() => unsubscribe())

onMounted(() => {
  unsubscribe = onEvent<HelpRequest>('help-request.updated', (updated) => {
    const i = requests.value.findIndex((r) => r.requestId === updated.requestId)
    if (i !== -1) requests.value[i] = updated
  })
  load()
  if (route.query.new === '1') {
    modalOpen.value = true
    router.replace({ query: {} })
  }
})
</script>

<template>
  <div class="header">
    <div class="titles">
      <h1 class="page-title">Support</h1>
      <p class="page-subtitle">
        Your requests and the calls held for each one. Expand a request to see its details.
      </p>
    </div>
    <button type="button" class="raise" @click="modalOpen = true">
      <AppIcon name="plus" :size="16" />
      Raise request
    </button>
  </div>

  <p v-if="loading" class="state">Loading your requests…</p>

  <div v-else-if="error" class="state error" role="alert">
    {{ error }}
    <button type="button" class="link" @click="load">Try again</button>
  </div>

  <div v-else-if="requests.length === 0" class="empty">
    <h2>No requests yet</h2>
    <p>When you’re stuck, raise a request and your consultant will call you.</p>
    <button type="button" class="raise" @click="modalOpen = true">
      <AppIcon name="plus" :size="16" />
      Raise your first request
    </button>
  </div>

  <HelpRequestsTable v-else :requests="requests" />

  <RaiseHelpRequestModal :open="modalOpen" @close="modalOpen = false" @created="onCreated" />
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

.raise {
  height: 44px;
  padding: 0 20px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--capture-yellow);
  color: var(--space-blue);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.raise:hover {
  filter: brightness(0.95);
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

.empty {
  padding: 48px 24px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-xl);
  background: var(--surface);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
}
.empty h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
.empty p {
  margin: 0 0 12px;
  font-size: 14px;
  color: var(--text-muted);
}
</style>
