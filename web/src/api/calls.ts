import type { Call, Transcript } from '../types'
import { BASE_URL, http } from './http'

export const callsApi = {
  start: (requestId: string) =>
    http<Call>(`/help-requests/${requestId}/calls`, { method: 'POST' }),

  get: (callId: string) => http<Call>(`/calls/${callId}`),

  accept: (callId: string) => http<Call>(`/calls/${callId}/accept`, { method: 'POST' }),

  decline: (callId: string) => http<Call>(`/calls/${callId}/decline`, { method: 'POST' }),

  cancel: (callId: string) => http<Call>(`/calls/${callId}/cancel`, { method: 'POST' }),

  requestRecording: (callId: string) =>
    http<Call>(`/calls/${callId}/recording/request`, { method: 'POST' }),

  allowRecording: (callId: string) =>
    http<Call>(`/calls/${callId}/recording/allow`, { method: 'POST' }),

  declineRecording: (callId: string) =>
    http<Call>(`/calls/${callId}/recording/decline`, { method: 'POST' }),

  uploadChunk: (callId: string, chunk: Blob, first: boolean) =>
    http<null>(`/calls/${callId}/recording/chunks${first ? '?first=1' : ''}`, {
      method: 'POST',
      body: chunk,
    }),

  recordingLink: async (callId: string) => {
    const link = await http<{ url: string; expiresAt: string }>(`/calls/${callId}/recording/link`, { method: 'POST' })
    return BASE_URL + link.url
  },

  transcript: (callId: string) => http<Transcript>(`/calls/${callId}/transcript`),

  stopRecording: (callId: string) =>
    http<Call>(`/calls/${callId}/recording/stop`, { method: 'POST' }),

  end: (callId: string) => http<Call>(`/calls/${callId}/end`, { method: 'POST' }),
}
