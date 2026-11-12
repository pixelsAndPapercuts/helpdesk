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
import { User } from '../users/user.entity'

export type RequestStatus = 'OPEN' | 'IN_CALL' | 'RESOLVED'

@Entity('help_requests')
export class HelpRequest {
  @PrimaryGeneratedColumn('uuid', { name: 'request_id' })
  requestId: string

  @Index()
  @Column({ name: 'client_id' })
  clientId: string

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client: User

  @Column()
  title: string

  @Column({ type: 'text' })
  description: string

  @Column({ type: 'simple-enum', enum: ['OPEN', 'IN_CALL', 'RESOLVED'], default: 'OPEN' })
  status: RequestStatus

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null
}
