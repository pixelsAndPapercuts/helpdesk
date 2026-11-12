import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { FindOptionsWhere, In, Repository } from 'typeorm'
import { Call, CallStatus } from '../calls/call.entity'
import { CommunicationService } from '../communication/communication.service'
import { User } from '../users/user.entity'
import { CreateHelpRequestDto } from './create-help-request.dto'
import { HelpRequest } from './help-request.entity'

export interface HelpRequestCall {
  callId: string
  status: CallStatus
  createdAt: Date
  startedAt: Date | null
  endedAt: Date | null
  hasRecording: boolean
  consultant: { userId: string; name: string }
}

export interface HelpRequestResponse {
  requestId: string
  title: string
  description: string
  status: HelpRequest['status']
  createdAt: Date
  client: { userId: string; name: string }
  calls: HelpRequestCall[]
}

@Injectable()
export class HelpRequestsService {
  constructor(
    @InjectRepository(HelpRequest) private readonly requests: Repository<HelpRequest>,
    @InjectRepository(Call) private readonly calls: Repository<Call>,
    private readonly communication: CommunicationService,
  ) {}

  async create(client: User, dto: CreateHelpRequestDto): Promise<HelpRequestResponse> {
    const saved = await this.requests.save(
      this.requests.create({
        clientId: client.userId,
        title: dto.title,
        description: dto.description,
        status: 'OPEN',
      }),
    )
    const response = toHelpRequestResponse(saved, client, [])

    this.communication.emitToConsultants('help-request.created', response)

    return response
  }

  async listFor(user: User): Promise<HelpRequestResponse[]> {
    const where: FindOptionsWhere<HelpRequest> =
      user.role === 'CLIENT' ? { clientId: user.userId } : {}

    const rows = await this.requests.find({
      where,
      relations: { client: true },
      order: { createdAt: 'DESC' },
    })
    const callsByRequest = await this.callsFor(rows.map((r) => r.requestId))
    return rows.map((r) => toHelpRequestResponse(r, r.client, callsByRequest.get(r.requestId) ?? []))
  }

  async resolve(requestId: string): Promise<HelpRequestResponse> {
    const request = await this.requests.findOne({ where: { requestId } })
    if (!request) throw new NotFoundException('Help request not found')
    if (request.status === 'IN_CALL') throw new ConflictException('End the call before resolving')
    if (request.status === 'RESOLVED') throw new ConflictException('This request is already resolved')

    request.status = 'RESOLVED'
    await this.requests.save(request)
    return this.emitUpdated(requestId)
  }

  async emitUpdated(requestId: string): Promise<HelpRequestResponse> {
    const request = await this.requests.findOneOrFail({
      where: { requestId },
      relations: { client: true },
    })
    const calls = (await this.callsFor([requestId])).get(requestId) ?? []
    const response = toHelpRequestResponse(request, request.client, calls)

    this.communication.emitToConsultants('help-request.updated', response)
    this.communication.emitToUser(request.clientId, 'help-request.updated', response)
    return response
  }

  private async callsFor(requestIds: string[]): Promise<Map<string, HelpRequestCall[]>> {
    const grouped = new Map<string, HelpRequestCall[]>()
    if (requestIds.length === 0) return grouped

    const calls = await this.calls.find({
      where: { requestId: In(requestIds) },
      relations: { consultant: true },
      order: { createdAt: 'DESC' },
    })
    for (const c of calls) {
      const list = grouped.get(c.requestId) ?? []
      list.push({
        callId: c.callId,
        status: c.status,
        createdAt: c.createdAt,
        startedAt: c.startedAt,
        endedAt: c.endedAt,
        hasRecording: c.recordingFile !== null,
        consultant: { userId: c.consultant.userId, name: c.consultant.name },
      })
      grouped.set(c.requestId, list)
    }
    return grouped
  }
}

export function toHelpRequestResponse(
  r: HelpRequest,
  client: User,
  calls: HelpRequestCall[],
): HelpRequestResponse {
  return {
    requestId: r.requestId,
    title: r.title,
    description: r.description,
    status: r.status,
    createdAt: r.createdAt,
    client: { userId: client.userId, name: client.name },
    calls,
  }
}
