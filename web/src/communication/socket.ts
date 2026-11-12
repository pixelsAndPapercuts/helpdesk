import { io, type Socket } from 'socket.io-client'
import { ref } from 'vue'
import { BASE_URL } from '../api/http'

let socket: Socket | null = null

export const connected = ref(false)

export function connectSocket(token: string) {
  if (socket) return
  socket = io(BASE_URL, { auth: { token } })
  socket.on('connect', () => (connected.value = true))
  socket.on('disconnect', () => (connected.value = false))
}

export function disconnectSocket() {
  socket?.disconnect()
  socket = null
  connected.value = false
}

export function onEvent<T>(event: string, handler: (data: T) => void): () => void {
  socket?.on(event, handler)
  return () => socket?.off(event, handler)
}

export function emitEvent(event: string, data?: unknown) {
  socket?.emit(event, data)
}

export async function emitWithAck<T>(event: string, data?: unknown): Promise<T> {
  if (!socket) throw new Error('Not connected')
  return socket.timeout(5000).emitWithAck(event, data) as Promise<T>
}
