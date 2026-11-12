<script setup lang="ts">
import { computed, ref } from 'vue'
import QueueRow from './QueueRow.vue'
import type { HelpRequest, RequestStatus } from '../../types'

const props = defineProps<{
  requests: HelpRequest[]
  newIds: Set<string>
  busy: { requestId: string; action: 'start' | 'resolve' } | null
}>()
defineEmits<{ 'start-call': [request: HelpRequest]; resolve: [request: HelpRequest] }>()

type Filter = 'ALL' | RequestStatus

const TABS: { value: Filter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_CALL', label: 'In call' },
  { value: 'RESOLVED', label: 'Resolved' },
]

const filter = ref<Filter>('ALL')

const count = (f: Filter) =>
  f === 'ALL' ? props.requests.length : props.requests.filter((r) => r.status === f).length

const visible = computed(() =>
  filter.value === 'ALL' ? props.requests : props.requests.filter((r) => r.status === filter.value),
)
</script>

<template>
  <section class="queue" aria-labelledby="queue-h">
    <div class="head">
      <h2 id="queue-h">Queue</h2>
      <div class="tabs" role="tablist" aria-label="Filter by status">
        <button
          v-for="tab in TABS"
          :key="tab.value"
          type="button"
          role="tab"
          class="tab"
          :aria-selected="filter === tab.value"
          @click="filter = tab.value"
        >
          {{ tab.label }} ({{ count(tab.value) }})
        </button>
      </div>
    </div>

    <ul v-if="visible.length" class="list">
      <QueueRow
        v-for="r in visible"
        :key="r.requestId"
        :request="r"
        :is-new="newIds.has(r.requestId)"
        :busy="busy?.requestId === r.requestId ? busy.action : null"
        @start="$emit('start-call', r)"
        @resolve="$emit('resolve', r)"
      />
    </ul>
    <p v-else class="empty">No requests in this view.</p>
  </section>
</template>

<style scoped>
.queue {
  padding: 24px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.head h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 4px;
  border-radius: var(--radius-md);
  background: var(--divider);
}
.tab {
  height: 36px;
  padding: 0 14px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.tab[aria-selected='true'] {
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.12);
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.empty {
  margin: 0;
  padding: 40px 0;
  border-top: 1px solid var(--divider);
  text-align: center;
  font-size: 14px;
  color: var(--text-muted);
}
</style>
