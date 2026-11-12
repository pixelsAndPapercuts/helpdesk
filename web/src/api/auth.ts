import type { User } from '../types'
import { http } from './http'

export interface LoginResponse {
  token: string
  user: User
}

export const authApi = {
  login: (email: string, password: string) =>
    http<LoginResponse>('/auth/login', { method: 'POST', body: { email, password } }),
}
