import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ToastKind = 'success' | 'error'

export const useToastStore = defineStore('toast', () => {
  const message = ref<string | null>(null)
  const kind = ref<ToastKind>('success')
  let timer: ReturnType<typeof setTimeout> | undefined

  function show(text: string, toastKind: ToastKind = 'success', durationMs = 3000) {
    message.value = text
    kind.value = toastKind
    clearTimeout(timer)
    timer = setTimeout(() => (message.value = null), durationMs)
  }

  function hide() {
    clearTimeout(timer)
    message.value = null
  }

  return { message, kind, show, hide }
})
