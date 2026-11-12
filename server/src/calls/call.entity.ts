import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import { HelpRequest } from '../help-requests/help-request.entity'
import { User } from '../users/user.entity'

export type CallStatus =
  | 'RINGING'
  | 'DECLINED'
  | 'MISSED'
  | 'ACTIVE'
  | 'ENDED'
  | 'PROCESSING'
  | 'READY'
  | 'FAILED'

export const CALL_STATUSES: CallStatus[] = [
  'RINGING',
  'DECLINED',
  'MISSED',
  'ACTIVE',
  'ENDED',
  'PROCESSING',
  'READY',
  'FAILED',
]

export type RecordingState = 'OFF' | 'REQUESTED' | 'ON'
export const RECORDING_STATES: RecordingState[] = ['OFF', 'REQUESTED', 'ON']

@Entity('calls')
export class Call {
  @PrimaryGeneratedColumn('uuid', { name: 'call_id' })
  callId: string

  @Index()
  @Column({ name: 'request_id' })
  requestId: string

  @ManyToOne(() => HelpRequest, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'request_id' })
  request: HelpRequest

  @Index()
  @Column({ name: 'client_id' })
  clientId: string

  @ManyToOne(() => User)
  @JoinColumn({ name: 'client_id' })
  client: User

  @Index()
  @Column({ name: 'consultant_id' })
  consultantId: string

  @ManyToOne(() => User)
  @JoinColumn({ name: 'consultant_id' })
  consultant: User

  @Column({ type: 'simple-enum', enum: CALL_STATUSES, default: 'RINGING' })
  status: CallStatus

  @Column({ type: 'simple-enum', enum: RECORDING_STATES, default: 'OFF' })
  recording: RecordingState

  @Column({ name: 'consent_at', type: 'datetime', nullable: true })
  consentAt: Date | null

  @Column({ name: 'started_at', type: 'datetime', nullable: true })
  startedAt: Date | null

  @Column({ name: 'ended_at', type: 'datetime', nullable: true })
  endedAt: Date | null

  @Column({ name: 'recording_path', type: 'text', nullable: true })
  recordingPath: string | null

  @Column({ name: 'recording_parts', type: 'integer', default: 0 })
  recordingParts: number

  @Column({ name: 'recording_stopped_at', type: 'datetime', nullable: true })
  recordingStoppedAt: Date | null

  @Column({ name: 'recording_file', type: 'text', nullable: true })
  recordingFile: string | null

  @Column({ type: 'text', nullable: true })
  error: string | null

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null
}
