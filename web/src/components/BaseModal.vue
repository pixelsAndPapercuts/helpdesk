<script setup lang="ts">
import { onMounted, ref, useId, watch } from 'vue'
import AppIcon from './AppIcon.vue'

const props = defineProps<{ open: boolean; title: string; subtitle?: string; wide?: boolean }>()
const emit = defineEmits<{ close: [] }>()

const dialog = ref<HTMLDialogElement | null>(null)
const titleId = useId()

function sync(open: boolean) {
  const el = dialog.value
  if (!el) return
  if (open && !el.open) el.showModal()
  if (!open && el.open) el.close()
}

watch(() => props.open, sync)
onMounted(() => sync(props.open))

function onCancel(event: Event) {
  event.preventDefault()
  emit('close')
}

let pressedOnBackdrop = false
function onMouseDown(event: MouseEvent) {
  pressedOnBackdrop = event.target === dialog.value
}
function onClick(event: MouseEvent) {
  if (pressedOnBackdrop && event.target === dialog.value) emit('close')
}
</script>

<template>
  <dialog
    ref="dialog"
    class="modal"
    :class="{ wide }"
    :aria-labelledby="titleId"
    @cancel="onCancel"
    @mousedown="onMouseDown"
    @click="onClick"
  >
    <div class="panel">
      <header class="head">
        <div class="titles">
          <h2 :id="titleId">{{ title }}</h2>
          <p v-if="subtitle">{{ subtitle }}</p>
        </div>
        <button type="button" class="close" aria-label="Close" @click="emit('close')">
          <AppIcon name="close" :size="16" />
        </button>
      </header>
      <slot />
    </div>
  </dialog>
</template>

<style scoped>
.modal {
  width: calc(100% - 48px);
  max-width: 520px;
  margin: 120px auto auto;
  padding: 0;
  border: none;
  background: transparent;
  overflow: visible;
}
.modal.wide {
  max-width: 1080px;
  margin-top: 48px;
}
.modal::backdrop {
  background: rgba(7, 34, 61, 0.55);
}

.panel {
  padding: 28px;
  border-radius: var(--radius-xl);
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 24px 60px rgba(7, 34, 61, 0.35);
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.titles {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.titles h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}
.titles p {
  margin: 0;
  font-size: 14px;
  color: var(--text-muted);
}
.close {
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  border: none;
  border-radius: var(--radius-md);
  background: var(--bg);
  color: var(--text);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.close:hover {
  background: var(--divider);
}
</style>
