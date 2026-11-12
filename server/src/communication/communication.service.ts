import { Injectable } from '@nestjs/common'
import { Server } from 'socket.io'

export const userRoom = (userId: string) => `user:${userId}`
export const CONSULTANTS_ROOM = 'consultants'
export const callRoom = (callId: string) => `call:${callId}`

@Injectable()
export class CommunicationService {
  private server: Server | null = null

  attach(server: Server) {
    this.server = server
  }

  emitToConsultants(event: string, data: unknown) {
    this.server?.to(CONSULTANTS_ROOM).emit(event, data)
  }

  emitToUser(userId: string, event: string, data: unknown) {
    this.server?.to(userRoom(userId)).emit(event, data)
  }
}
