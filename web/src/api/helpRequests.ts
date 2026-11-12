import type { HelpRequest } from '../types'
import { http } from './http'

export interface CreateHelpRequestInput {
  title: string
  description: string
}

export const helpRequestsApi = {
  list: () => http<HelpRequest[]>('/help-requests'),
  create: (input: CreateHelpRequestInput) =>
    http<HelpRequest>('/help-requests', { method: 'POST', body: input }),
  resolve: (requestId: string) =>
    http<HelpRequest>(`/help-requests/${requestId}/resolve`, { method: 'POST' }),
}
