<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import { useToastStore } from '../stores/toast'

const toast = useToastStore()
</script>

<template>
  <div class="toast-region" role="status" aria-live="polite">
    <Transition name="toast">
      <div v-if="toast.message" class="toast">
        <span class="icon" :class="toast.kind">
          <AppIcon :name="toast.kind === 'error' ? 'close' : 'check'" :size="14" />
        </span>
        {{ toast.message }}
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.toast-region {
  position: fixed;
  top: 24px;
  right: 24px;
  left: 24px;
  display: flex;
  justify-content: flex-end;
  pointer-events: none;
  z-index: 100;
}

.toast {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: var(--radius-md);
  background: var(--space-blue);
  color: var(--on-dark);
  font-size: 14px;
  font-weight: 500;
  box-shadow: 0 8px 24px rgba(7, 34, 61, 0.25);
}

.icon {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--close-green);
  color: var(--space-blue);
  display: flex;
  align-items: center;
  justify-content: center;
}
.icon.error {
  background: #ff8a80;
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

@media (prefers-reduced-motion: reduce) {
  .toast-enter-active,
  .toast-leave-active {
    transition: none;
  }
}
</style>
