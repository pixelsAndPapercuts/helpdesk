export type Role = 'CLIENT' | 'CONSULTANT'

export interface User {
  userId: string
  name: string
  email: string
  role: Role
}

export type IconName =
  | 'record'
  | 'logo'
  | 'home'
  | 'support'
  | 'inbox'
  | 'video'
  | 'logout'
  | 'check'
  | 'file'
  | 'plus'
  | 'close'
  | 'chevron'
  | 'mic'
  | 'mic-off'
  | 'video-off'
  | 'screen'
  | 'expand'
  | 'shrink'
  | 'phone-off'
  | 'message'
  | 'minimise'

export type RequestStatus = 'OPEN' | 'IN_CALL' | 'RESOLVED'

export type CallStatus =
  | 'RINGING'
  | 'DECLINED'
  | 'MISSED'
  | 'ACTIVE'
  | 'ENDED'
  | 'PROCESSING'
  | 'READY'
  | 'FAILED'

export type RecordingState = 'OFF' | 'REQUESTED' | 'ON'

export interface Call {
  callId: string
  status: CallStatus
  createdAt: string
  recording: RecordingState
  consentAt: string | null
  startedAt: string | null
  endedAt: string | null
  request: { requestId: string; title: string }
  client: { userId: string; name: string }
  consultant: { userId: string; name: string }
}

export interface HelpRequestCall {
  callId: string
  status: CallStatus
  createdAt: string
  startedAt: string | null
  endedAt: string | null
  hasRecording: boolean
  consultant: { userId: string; name: string }
}

export interface HelpRequest {
  requestId: string
  title: string
  description: string
  status: RequestStatus
  createdAt: string
  client: { userId: string; name: string }
  calls: HelpRequestCall[]
}

export interface NavItem {
  label: string
  to: string
  icon: IconName
  badge?: number
}

export interface TranscriptLine {
  speaker: 'CLIENT' | 'CONSULTANT'
  name: string
  start: number
  end: number
  text: string
}
export interface Transcript {
  callId: string
  provider: string
  model: string
  createdAt: string
  segments: TranscriptLine[]
  summary: CallSummary | null
}
export type CallSummary =
  | { kind: 'paragraph'; text: string }
  | { kind: 'structured'; problem: string; stepsTaken: string[]; resolution: string; followUps: string[] }
