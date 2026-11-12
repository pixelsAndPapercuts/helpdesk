import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'

export type Role = 'CLIENT' | 'CONSULTANT'

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid', { name: 'user_id' })
  userId: string

  @Column()
  name: string

  @Column({ unique: true })
  email: string

  @Column({ name: 'password_hash', select: false })
  passwordHash: string

  @Column({ type: 'simple-enum', enum: ['CLIENT', 'CONSULTANT'] })
  role: Role

  @Column({ name: 'is_active', default: true })
  isActive: boolean

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date
}
