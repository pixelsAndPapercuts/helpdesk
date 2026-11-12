import { useAuthStore } from '../stores/auth'

export const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function http<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const auth = useAuthStore()

  const isBlob = options.body instanceof Blob
  const headers: Record<string, string> = {}
  if (options.body !== undefined) {
    headers['Content-Type'] = isBlob ? (options.body as Blob).type : 'application/json'
  }
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`

  let res: Response
  try {
    res = await fetch(BASE_URL + path, {
      method: options.method ?? 'GET',
      headers,
      body: isBlob ? (options.body as Blob) : options.body !== undefined ? JSON.stringify(options.body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Is it running?')
  }

  const data = await res.json().catch(() => null)

  if (!res.ok) {
    if (res.status === 401 && auth.token) {
      auth.logout()
      window.location.assign('/login')
    }
    const message = Array.isArray(data?.message) ? data.message.join(', ') : (data?.message ?? res.statusText)
    throw new ApiError(res.status, message)
  }

  return data as T
}
