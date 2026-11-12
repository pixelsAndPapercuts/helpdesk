<script setup lang="ts">
import { ref } from 'vue'
import AppIcon from '../AppIcon.vue'
import CallCard from '../CallCard.vue'
import StatusBadge from '../StatusBadge.vue'
import { formatDateTime, initials } from '../../utils/format'
import type { HelpRequest } from '../../types'

defineProps<{
  request: HelpRequest
  isNew: boolean
  busy?: 'start' | 'resolve' | null
}>()
defineEmits<{ start: []; resolve: [] }>()

const open = ref(false)
</script>

<template>
  <li class="row" :class="{ new: isNew, open }">
    <button
      type="button"
      class="chevron"
      :aria-expanded="open"
      :aria-controls="`calls-${request.requestId}`"
      :aria-label="`Show details for ${request.title}`"
      @click="open = !open"
    >
      <AppIcon name="chevron" :size="16" />
    </button>
    <div class="avatar" aria-hidden="true">{{ initials(request.client.name) }}</div>

    <div class="main">
      <div class="title-line">
        <span class="title">{{ request.title }}</span>
        <span v-if="isNew" class="new-tag">NEW</span>
      </div>
      <span class="meta">{{ request.client.name }} · {{ formatDateTime(request.createdAt) }}</span>
      <span class="desc">{{ request.description }}</span>
    </div>

    <StatusBadge :status="request.status" />

    <div class="action">
      <button
        v-if="request.status === 'OPEN'"
        type="button"
        class="btn resolve"
        :disabled="!!busy"
        @click="$emit('resolve')"
      >
        <AppIcon name="check" :size="16" />
        {{ busy === 'resolve' ? 'Resolving…' : 'Resolve' }}
      </button>
      <button
        v-if="request.status === 'OPEN'"
        type="button"
        class="btn start"
        :disabled="!!busy"
        @click="$emit('start')"
      >
        <AppIcon name="video" :size="16" />
        {{ busy === 'start' ? 'Starting…' : 'Start call' }}
      </button>
      <button
        v-else-if="request.status === 'IN_CALL'"
        type="button"
        class="btn rejoin"
        disabled
        title="Coming soon"
      >
        Rejoin
      </button>
    </div>

    <div v-if="open" :id="`calls-${request.requestId}`" class="details">
      <span class="label">Calls</span>
      <CallCard
        v-for="c in request.calls"
        :key="c.callId"
        :call="c"
        :request-title="request.title"
        :other-name="request.client.name"
      />
      <p v-if="request.calls.length === 0" class="no-calls">No calls yet. Start one when you’re ready.</p>
    </div>
  </li>
</template>

<style scoped>
.row {
  padding: 16px;
  margin: 0 -16px;
  border-top: 1px solid var(--divider);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
}
.row.new {
  background: #fffbea;
}
.row.open {
  background: var(--surface-subtle);
}

.chevron {
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
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
.chevron:focus-visible {
  outline: 2px solid var(--nurture-blue);
  outline-offset: 2px;
}

.details {
  flex: 1 0 100%;
  padding: 4px 0 4px 108px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.full-desc {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.full-desc p {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-secondary);
  white-space: pre-wrap;
}
.label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.no-calls {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted);
}
@media (max-width: 720px) {
  .details {
    padding-left: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .chevron :deep(svg) {
    transition: none;
  }
}

.avatar {
  width: 40px;
  height: 40px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: #e3f1ff;
  color: var(--link);
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}

.main {
  flex: 1 1 280px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.title-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.title {
  font-size: 15px;
  font-weight: 600;
}
.new-tag {
  height: 20px;
  padding: 0 8px;
  border-radius: 999px;
  background: var(--nurture-blue);
  color: var(--space-blue);
  font-size: 11px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
}
.meta {
  font-size: 13px;
  color: var(--text-muted);
}
.desc {
  font-size: 13px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action {
  width: 240px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.btn {
  height: 40px;
  padding: 0 14px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.btn.start {
  border: none;
  background: var(--close-green);
  color: var(--space-blue);
}
.btn.resolve {
  border: 1px solid var(--border-strong);
  background: var(--surface);
  color: var(--text);
}
.btn.rejoin {
  border: 1px solid #bfddfd;
  background: #e3f1ff;
  color: var(--link);
}
.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
