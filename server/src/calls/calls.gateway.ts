import { Logger } from '@nestjs/common'
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets'
import { InjectRepository } from '@nestjs/typeorm'
import { Socket } from 'socket.io'
import { Repository } from 'typeorm'
import { callRoom } from '../communication/communication.service'
import { User } from '../users/user.entity'
import { Call } from './call.entity'

type Ack = { ok: true; peerPresent: boolean } | { ok: false; error: string }

@WebSocketGateway({ cors: { origin: 'http://localhost:5173' } })
export class CallsGateway implements OnGatewayDisconnect {
  private readonly logger = new Logger(CallsGateway.name)

  constructor(@InjectRepository(Call) private readonly calls: Repository<Call>) {}

  @SubscribeMessage('call.join')
  async join(@ConnectedSocket() socket: Socket, @MessageBody() body: { callId?: unknown }): Promise<Ack> {
    const user = socket.data.user as User | undefined
    const callId = typeof body?.callId === 'string' ? body.callId : null
    if (!user || !callId) return { ok: false, error: 'Bad request' }

    const call = await this.calls.findOne({
      where: [
        { callId, clientId: user.userId },
        { callId, consultantId: user.userId },
      ],
    })
    if (!call) return { ok: false, error: 'Call not found' }
    if (call.status !== 'ACTIVE') return { ok: false, error: 'This call is not active' }

    const room = callRoom(callId)
    const others = (await socket.in(room).fetchSockets()).filter(
      (s) => (s.data.user as User).userId !== user.userId,
    )

    await socket.join(room)
    socket.data.callId = callId
    socket.to(room).emit('call.peer-joined', { callId, userId: user.userId, role: user.role })

    this.logger.log(`${user.email} joined call ${callId}`)
    return { ok: true, peerPresent: others.length > 0 }
  }

  @SubscribeMessage('call.signal')
  signal(@ConnectedSocket() socket: Socket, @MessageBody() body: { callId?: unknown; data?: unknown }) {
    const callId = typeof body?.callId === 'string' ? body.callId : null
    if (!callId || !socket.rooms.has(callRoom(callId))) return
    socket.to(callRoom(callId)).emit('call.signal', { callId, data: body.data })
  }

  @SubscribeMessage('call.leave')
  async leave(@ConnectedSocket() socket: Socket) {
    await this.leaveCurrentCall(socket)
  }

  async handleDisconnect(socket: Socket) {
    await this.leaveCurrentCall(socket)
  }

  private async leaveCurrentCall(socket: Socket) {
    const callId = socket.data.callId as string | undefined
    if (!callId) return
    socket.data.callId = undefined
    const user = socket.data.user as User
    socket.to(callRoom(callId)).emit('call.peer-left', { callId, userId: user.userId })
    await socket.leave(callRoom(callId))
  }
}
