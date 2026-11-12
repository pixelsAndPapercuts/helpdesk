import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { connectSocket, disconnectSocket } from '../communication/socket'
import type { User } from '../types'

const STORAGE_KEY = 'helpdesk.session'

interface Session {
  token: string
  user: User
}

// sessionStorage is per tab, so two windows can be signed in as different users.
function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

export const useAuthStore = defineStore('auth', () => {
  const session = ref<Session | null>(loadSession())

  const token = computed(() => session.value?.token ?? null)
  const user = computed(() => session.value?.user ?? null)
  const isLoggedIn = computed(() => session.value !== null)

  watch(token, (t) => (t ? connectSocket(t) : disconnectSocket()), { immediate: true })

  function setSession(next: Session) {
    session.value = next
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }

  function logout() {
    session.value = null
    sessionStorage.removeItem(STORAGE_KEY)
  }

  return { token, user, isLoggedIn, setSession, logout }
})
