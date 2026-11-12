<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import PreCallModal from './PreCallModal.vue'
import RecordingModal from './RecordingModal.vue'
import { callsApi } from '../api/calls'
import { useAuthStore } from '../stores/auth'
import { formatDateTime, formatDuration } from '../utils/format'
import type { CallStatus, HelpRequestCall } from '../types'

const props = defineProps<{
  call: HelpRequestCall
  requestTitle: string
  otherName: string
}>()

const auth = useAuthStore()
const isConsultant = computed(() => auth.user?.role === 'CONSULTANT')

const STATUS: Record<CallStatus, { label: string; bg: string; fg: string }> = {
  RINGING: { label: 'Ringing', bg: '#E3F1FF', fg: '#0B5CAD' },
  ACTIVE: { label: 'In progress', bg: '#E3F1FF', fg: '#0B5CAD' },
  MISSED: { label: 'Missed', bg: '#FDECEA', fg: '#B42318' },
  DECLINED: { label: 'Declined', bg: '#EDF1F6', fg: '#4A5B6E' },
  ENDED: { label: 'Ended', bg: '#EDF1F6', fg: '#4A5B6E' },
  PROCESSING: { label: 'Processing', bg: '#EDF1F6', fg: '#4A5B6E' },
  READY: { label: 'Ready', bg: '#E0F8E7', fg: '#0B6B2A' },
  FAILED: { label: 'Failed', bg: '#FDECEA', fg: '#B42318' },
}
const status = computed(() => STATUS[props.call.status])

const when = computed(() => {
  const c = props.call
  const start = formatDateTime(c.startedAt ?? c.createdAt)
  if (c.status === 'ACTIVE') return `${start} · in progress`
  if (c.startedAt && c.endedAt) return `${start} · ${formatDuration(c.startedAt, c.endedAt)}`
  return start
})

const note = computed(() => {
  const consultant = isConsultant.value
  switch (props.call.status) {
    case 'RINGING':
      return consultant ? `Ringing ${props.otherName}…` : 'Your consultant is calling you now.'
    case 'MISSED':
      return consultant
        ? `${props.otherName} didn’t pick up.`
        : 'This call wasn’t answered. Your consultant can call again.'
    case 'DECLINED':
      return consultant ? `${props.otherName} declined this call.` : 'You declined this call.'
    case 'ACTIVE':
      return 'This call is happening now.'
    case 'PROCESSING':
      return 'Preparing the recording and transcript…'
    case 'READY':
      return 'The recording and transcript are ready.'
    case 'FAILED':
      return canOpen.value
        ? 'The recording is ready, but the transcript couldn’t be made.'
        : 'Something went wrong while preparing this recording.'
    default:
      return 'The call has ended.'
  }
})

const canOpen = computed(
  () => props.call.hasRecording && (props.call.status === 'READY' || props.call.status === 'FAILED'),
)
const showRecording = ref(false)

const joinOpen = ref(false)
const accept = async () => (await callsApi.accept(props.call.callId)).callId
</script>

<template>
  <article class="call-card">
    <div class="thumb" aria-hidden="true"><AppIcon name="video" :size="26" /></div>
    <div class="body">
      <div class="title-line">
        <span class="title">Call with {{ otherName }}</span>
        <span class="chip" :style="{ background: status.bg, color: status.fg }">{{ status.label }}</span>
      </div>
      <span class="when">{{ when }}</span>
      <p class="note">{{ note }}</p>
    </div>
    <button
      v-if="!isConsultant && call.status === 'RINGING'"
      type="button"
      class="join"
      @click="joinOpen = true"
    >
      <AppIcon name="video" :size="16" />
      Join call
    </button>
    <div v-if="canOpen" class="open-wrap">
      <button type="button" class="open" @click="showRecording = true">
        <AppIcon name="video" :size="16" />
        Open recording
      </button>
      <span class="transcript-state" :class="{ missing: call.status === 'FAILED' }">
        {{ call.status === 'READY' ? 'Transcript ready' : 'Transcript not available' }}
      </span>
    </div>
  </article>

  <PreCallModal
    v-if="!isConsultant"
    :open="joinOpen && call.status === 'RINGING'"
    title="Ready to join?"
    :subtitle="`${otherName} is calling about “${requestTitle}”`"
    confirm-label="Join now"
    busy-label="Joining…"
    :confirm="accept"
    @close="joinOpen = false"
    @done="joinOpen = false"
  />
  <RecordingModal
    :open="showRecording"
    :call-id="call.callId"
    :transcript="call.status === 'READY'"
    :subtitle="`Call with ${otherName} · ${when}`"
    @close="showRecording = false"
  />
</template>

<style scoped>
.call-card {
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 16px;
}
.thumb {
  width: 160px;
  height: 90px;
  flex: 0 0 auto;
  border-radius: var(--radius-sm);
  background: var(--space-blue);
  color: var(--on-dark-muted);
  display: flex;
  align-items: center;
  justify-content: center;
}
.body {
  flex: 1 1 280px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.title-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.title {
  font-size: 14px;
  font-weight: 600;
}
.chip {
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
}
.when {
  font-size: 13px;
  color: var(--text-muted);
}
.note {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
}
.join {
  height: 40px;
  padding: 0 16px;
  border: none;
  border-radius: 10px;
  background: var(--capture-yellow);
  color: var(--space-blue);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.open {
  height: 40px;
  padding: 0 16px;
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.open:hover {
  background: var(--bg);
}
.open-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.transcript-state {
  font-size: 12px;
  color: #0b6b2a;
}
.transcript-state.missing {
  color: var(--text-muted);
}
</style>
