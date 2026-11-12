<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue'
import BaseModal from './BaseModal.vue'
import { callsApi } from '../api/calls'
import { ApiError } from '../api/http'
import type { CallSummary, TranscriptLine } from '../types'

const props = defineProps<{ open: boolean; callId: string; subtitle?: string; transcript: boolean }>()
const emit = defineEmits<{ close: [] }>()
const headingId = useId()

const src = ref<string | null>(null)
const videoError = ref('')
const video = ref<HTMLVideoElement | null>(null)
const currentTime = ref(0)

const lines = ref<TranscriptLine[] | null>(null)
const transcriptState = ref<'loading' | 'ready' | 'unavailable'>('loading')
const summary = ref<CallSummary | null>(null)
const summaryId = useId()

let loadId = 0

async function loadVideo(id = loadId) {
  videoError.value = ''
  try {
    const url = await callsApi.recordingLink(props.callId)
    if (id === loadId) src.value = url
  } catch (e) {
    if (id === loadId) videoError.value = e instanceof ApiError ? e.message : 'Could not load the recording'
  }
}

async function loadTranscript(id: number) {
  if (!props.transcript) {
    transcriptState.value = 'unavailable'
    return
  }
  transcriptState.value = 'loading'
  try {
    const t = await callsApi.transcript(props.callId)
    if (id !== loadId) return
    lines.value = t.segments
    summary.value = t.summary
    transcriptState.value = 'ready'
  } catch {
    if (id === loadId) transcriptState.value = 'unavailable'
  }
}

watch(
  () => props.open,
  (open) => {
    const id = ++loadId
    src.value = null
    lines.value = null
    summary.value = null
    currentTime.value = 0
    if (open) {
      void loadVideo(id)
      void loadTranscript(id)
    }
  },
  { immediate: true },
)

let retriedFor: string | null = null
async function onVideoError() {
  const v = video.value
  if (!v || !src.value || retriedFor === src.value) {
    videoError.value = 'Could not play the recording'
    return
  }
  retriedFor = src.value
  const at = v.currentTime
  const playing = !v.paused
  await loadVideo()
  await nextTick()
  v.addEventListener(
    'loadedmetadata',
    () => {
      v.currentTime = at
      if (playing) void v.play().catch(() => {})
    },
    { once: true },
  )
  v.load()
}

const active = computed(() => {
  const list = lines.value
  if (!list) return -1
  let index = -1
  for (let i = 0; i < list.length && list[i].start <= currentTime.value + 0.05; i++) index = i
  return index
})

function jumpTo(line: TranscriptLine) {
  const v = video.value
  if (!v) return
  v.currentTime = line.start
  currentTime.value = line.start
  void v.play().catch(() => {})
}

const list = ref<HTMLElement | null>(null)
const moreBelow = ref(false)
function updateMoreBelow() {
  const box = list.value
  moreBelow.value = !!box && box.scrollTop + box.clientHeight < box.scrollHeight - 4
}
watch(lines, () => void nextTick(updateMoreBelow))
let userScrolledAt = 0
const FOLLOW_PAUSE_MS = 4000
function onUserScroll() {
  userScrolledAt = Date.now()
}
watch(active, async (index) => {
  if (Date.now() - userScrolledAt < FOLLOW_PAUSE_MS) return
  await nextTick()
  const box = list.value
  const row = box?.querySelector<HTMLElement>(`[data-line="${index}"]`)
  if (!box || !row) return
  box.scrollTo({ top: row.offsetTop - box.clientHeight / 3, behavior: 'smooth' })
})

function clock(seconds: number) {
  const s = Math.floor(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
</script>

<template>
  <BaseModal :open="open" title="Call recording" :subtitle="subtitle" wide @close="emit('close')">
    <div class="review">
      <div class="player">
        <p v-if="videoError" class="state error" role="alert">{{ videoError }}</p>
        <video
          v-else-if="src"
          ref="video"
          :src="src"
          controls
          playsinline
          preload="metadata"
          @timeupdate="currentTime = ($event.target as HTMLVideoElement).currentTime"
          @seeked="currentTime = ($event.target as HTMLVideoElement).currentTime"
          @error="onVideoError"
        ></video>
        <p v-else class="state">Loading recording…</p>
      </div>

      <section
        v-if="transcriptState === 'ready' && lines?.length"
        class="summary"
        :aria-labelledby="summaryId"
      >
        <h3 :id="summaryId">Summary</h3>
        <p v-if="summary?.kind === 'paragraph'" class="paragraph">{{ summary.text }}</p>
        <template v-else-if="summary?.kind === 'structured'">
          <div class="field">
            <h4>Problem</h4>
            <p>{{ summary.problem }}</p>
          </div>
          <div v-if="summary.stepsTaken.length" class="field">
            <h4>Steps taken</h4>
            <ol>
              <li v-for="(step, i) in summary.stepsTaken" :key="i">{{ step }}</li>
            </ol>
          </div>
          <div class="field">
            <h4>Resolution</h4>
            <p>{{ summary.resolution }}</p>
          </div>
          <div class="field">
            <h4>Follow-ups</h4>
            <ul v-if="summary.followUps.length">
              <li v-for="(item, i) in summary.followUps" :key="i">{{ item }}</li>
            </ul>
            <p v-else class="none">Nothing left to do.</p>
          </div>
        </template>
        <div v-else class="empty">
          <strong>Summary not available</strong>
          <span>We couldn’t make a summary for this call. The transcript is still here.</span>
        </div>
      </section>

      <section class="transcript" :aria-labelledby="headingId">
        <div class="transcript-head">
          <h3 :id="headingId">Transcript</h3>
          <span v-if="lines?.length" class="count">{{ lines.length }} lines</span>
        </div>

        <p v-if="transcriptState === 'loading'" class="empty">Loading transcript…</p>
        <div v-else-if="transcriptState === 'unavailable'" class="empty">
          <strong>Transcript not available</strong>
          <span>We couldn’t make a transcript for this call. The recording is still here.</span>
        </div>
        <p v-else-if="!lines?.length" class="empty">No speech was picked up in this recording.</p>

        <ol
          v-else
          ref="list"
          class="lines"
          :class="{ 'more-below': moreBelow }"
          @scroll.passive="updateMoreBelow"
          @wheel.passive="onUserScroll"
          @touchmove.passive="onUserScroll"
        >
          <li v-for="(line, i) in lines" :key="i" :data-line="i">
            <button
              type="button"
              class="line"
              :class="[line.speaker === 'CLIENT' ? 'client' : 'consultant', { active: i === active }]"
              :aria-current="i === active ? 'true' : undefined"
              :aria-label="`${clock(line.start)}, ${line.name}: ${line.text}. Play from here`"
              @click="jumpTo(line)"
            >
              <span class="meta">
                <span class="time">{{ clock(line.start) }}</span>
                <span class="name">{{ line.name }}</span>
              </span>
              <span class="text">{{ line.text }}</span>
            </button>
          </li>
        </ol>
      </section>
    </div>
  </BaseModal>
</template>

<style scoped>
.review {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(280px, 2fr);
  gap: 20px;
  align-items: start;
}
@media (max-width: 820px) {
  .review {
    grid-template-columns: minmax(0, 1fr);
  }
  .review > * {
    grid-column: 1 !important;
    grid-row: auto !important;
  }
  .transcript {
    contain: none;
  }
  .lines {
    flex: none;
    max-height: 360px;
  }
}

.player {
  grid-column: 1;
  aspect-ratio: 16 / 9;
  border-radius: var(--radius-md);
  background: #061a2f;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
.player video {
  width: 100%;
  height: 100%;
  background: #000;
}
.state {
  margin: 0;
  color: var(--on-dark-subtle);
  font-size: 14px;
}
.state.error {
  color: #fda29b;
}

.transcript {
  grid-column: 2;
  grid-row: 1 / span 2;
  align-self: stretch;
  contain: size; /* match the height of the video + summary instead of growing with the list */
  min-width: 0;
  min-height: 240px;
  padding: 16px 8px 8px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.transcript-head {
  padding-right: 8px;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.count {
  font-size: 12px;
  color: var(--text-muted);
}
.transcript h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
.empty {
  margin: 0;
  padding: 16px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-md);
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.empty strong {
  color: var(--text);
}

.lines {
  position: relative;
  flex: 1 1 0;
  min-height: 0;
  margin: 0;
  padding: 0 6px 0 0;
  list-style: none;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.lines.more-below {
  mask-image: linear-gradient(to bottom, #000 calc(100% - 56px), transparent);
}
.lines::-webkit-scrollbar {
  width: 8px;
}
.lines::-webkit-scrollbar-track {
  background: transparent;
}
.lines::-webkit-scrollbar-thumb {
  background: var(--border-strong);
  border-radius: 999px;
}
.lines::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted);
}
@supports not selector(::-webkit-scrollbar) {
  .lines {
    scrollbar-width: thin;
    scrollbar-color: var(--border-strong) transparent;
  }
}
.line {
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-left: 3px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  font: inherit;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 2px;
  cursor: pointer;
}
.line:hover {
  background: var(--bg);
}
.line:focus-visible {
  outline: 2px solid var(--nurture-blue);
  outline-offset: 1px;
}
.line.active {
  background: #e3f1ff;
  border-left-color: var(--nurture-blue);
}
.meta {
  display: flex;
  gap: 8px;
  font-size: 12px;
}
.time {
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.name {
  font-weight: 600;
}
.line.client .name {
  color: #0b5cad;
}
.line.consultant .name {
  color: #0b6b2a;
}
.text {
  font-size: 14px;
  line-height: 1.5;
}

.summary {
  grid-column: 1;
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.summary h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
.paragraph {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
}
.field h4 {
  margin: 0 0 4px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}
.field p,
.field li {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
}
.field ol,
.field ul {
  margin: 0;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.field .none {
  color: var(--text-secondary);
}

.hint {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted);
}
</style>
