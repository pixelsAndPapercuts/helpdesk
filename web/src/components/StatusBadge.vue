<script setup lang="ts">
import { computed } from 'vue'
import type { RequestStatus } from '../types'

const STYLES: Record<RequestStatus, { label: string; bg: string; fg: string }> = {
  OPEN: { label: 'Open', bg: '#fff4c2', fg: '#6b5000' },
  IN_CALL: { label: 'In call', bg: '#e3f1ff', fg: '#0b5cad' },
  RESOLVED: { label: 'Resolved', bg: '#e0f8e7', fg: '#0b6b2a' },
}

const props = defineProps<{ status: RequestStatus }>()

const style = computed(() => STYLES[props.status])
</script>

<template>
  <span class="badge" :style="{ background: style.bg, color: style.fg }">{{ style.label }}</span>
</template>

<style scoped>
.badge {
  display: inline-flex;
  align-items: center;
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
</style>
