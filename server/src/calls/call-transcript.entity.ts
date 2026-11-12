import { Column, CreateDateColumn, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm'
import { Call } from './call.entity'

export type Speaker = 'CLIENT' | 'CONSULTANT'

export interface TranscriptSegment {
  speaker: Speaker
  start: number
  end: number
  text: string
}

export interface StructuredSummary {
  problem: string
  stepsTaken: string[]
  resolution: string
  followUps: string[]
}

export type CallSummary = { kind: 'paragraph'; text: string } | ({ kind: 'structured' } & StructuredSummary)

@Entity('call_transcripts')
export class CallTranscript {
  @PrimaryColumn({ name: 'call_id' })
  callId: string

  @OneToOne(() => Call, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'call_id' })
  call: Call

  @Column()
  provider: string

  @Column()
  model: string

  @Column({ type: 'simple-json' })
  segments: TranscriptSegment[]

  @Column({ type: 'simple-json', nullable: true })
  summary: CallSummary | null

  @Column({ name: 'summary_provider', type: 'text', nullable: true })
  summaryProvider: string | null

  @Column({ name: 'summary_model', type: 'text', nullable: true })
  summaryModel: string | null

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date
}
