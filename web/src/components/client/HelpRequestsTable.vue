<script setup lang="ts">
import { ref } from 'vue'
import AppIcon from '../AppIcon.vue'
import CallCard from '../CallCard.vue'
import StatusBadge from '../StatusBadge.vue'
import { formatDateTime } from '../../utils/format'
import type { HelpRequest } from '../../types'

defineProps<{ requests: HelpRequest[] }>()

const expandedId = ref<string | null>(null)

const callCount = (n: number) => (n === 0 ? 'None yet' : n === 1 ? '1 call' : `${n} calls`)

function toggle(id: string) {
  expandedId.value = expandedId.value === id ? null : id
}
</script>

<template>
  <section class="card" aria-label="My requests">
    <div class="scroll">
      <div class="table" role="table" aria-label="My requests">
        <div class="row head" role="row">
          <span role="columnheader"><span class="sr-only">Expand</span></span>
          <span role="columnheader">Request</span>
          <span role="columnheader">Raised</span>
          <span role="columnheader">Calls</span>
          <span role="columnheader">Status</span>
        </div>

        <div v-for="r in requests" :key="r.requestId" class="item">
          <div class="row" :class="{ open: expandedId === r.requestId }" role="row">
            <span role="cell">
              <button
                type="button"
                class="chevron"
                :aria-expanded="expandedId === r.requestId"
                :aria-controls="`details-${r.requestId}`"
                :aria-label="`Show details for ${r.title}`"
                @click="toggle(r.requestId)"
              >
                <AppIcon name="chevron" :size="16" />
              </button>
            </span>
            <span role="cell" class="request">
              <span class="title">{{ r.title }}</span>
              <span class="desc">{{ r.description }}</span>
            </span>
            <span role="cell" class="muted">{{ formatDateTime(r.createdAt) }}</span>
            <span role="cell" class="muted">{{ callCount(r.calls.length) }}</span>
            <span role="cell"><StatusBadge :status="r.status" /></span>
          </div>

          <div
            v-if="expandedId === r.requestId"
            :id="`details-${r.requestId}`"
            class="details"
            role="row"
          >
            <div role="cell" class="details-inner">
              <span class="label">Calls</span>
              <CallCard
                v-for="c in r.calls"
                :key="c.callId"
                :call="c"
                :request-title="r.title"
                :other-name="c.consultant.name"
              />
              <div v-if="r.calls.length === 0" class="no-calls">
                No calls yet. Your consultant will call you here once they pick this up.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  overflow: hidden;
}
.scroll {
  overflow-x: auto;
}
.table {
  min-width: 720px;
}

.row {
  display: grid;
  grid-template-columns: 44px minmax(0, 3fr) minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
  padding: 14px 20px;
  align-items: center;
  background: var(--surface);
}
.row.head {
  background: var(--surface-subtle);
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.row.open {
  background: var(--surface-subtle);
}
.item {
  border-bottom: 1px solid var(--divider);
}
.item:last-child {
  border-bottom: none;
}

.chevron {
  width: 36px;
  height: 36px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.chevron :deep(svg) {
  transition: transform 0.15s ease;
}
.chevron[aria-expanded='true'] :deep(svg) {
  transform: rotate(90deg);
}

.request {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.title {
  font-size: 15px;
  font-weight: 600;
}
.desc {
  font-size: 13px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.muted {
  font-size: 14px;
  color: var(--text-secondary);
}

.details {
  background: var(--surface-subtle);
  padding: 4px 20px 20px 76px;
}
.details-inner {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.full-desc {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.full-desc p {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-secondary);
  white-space: pre-line;
}
.no-calls {
  padding: 16px;
  border: 1px dashed var(--border-strong);
  border-radius: 12px;
  background: var(--surface);
  font-size: 13px;
  color: var(--text-muted);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .chevron :deep(svg) {
    transition: none;
  }
}
</style>
