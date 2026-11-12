import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { appendFile, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, MoreThan, Repository } from 'typeorm'
import { CommunicationService } from '../communication/communication.service'
import { HelpRequest } from '../help-requests/help-request.entity'
import { HelpRequestsService } from '../help-requests/help-requests.service'
import { User } from '../users/user.entity'
import { Call, CallStatus, RecordingState } from './call.entity'
import { CallSummary, CallTranscript, TranscriptSegment } from './call-transcript.entity'
import { audioFileFor, mergeRecording } from './merge-recording'
import { summarize } from './summarize'
import { DEEPGRAM_SUMMARY_MODEL, TranscribeProvider, transcribe } from './transcribe'

export const RING_TIMEOUT_MS = 30_000

const RECORDINGS_DIR = process.env.RECORDINGS_DIR ?? 'recordings'
const CHUNK_GRACE_MS = 30_000
const PROCESS_AFTER_END_MS = 8_000
const PROCESS_AFTER_CHUNK_MS = 5_000
const LINK_TTL = '30m'
// Separate from the login secret, so a playback link can never be used as a login token.
const linkSecret = () => `${process.env.JWT_SECRET}:recording`

// 'deepgram': one paragraph from the transcript request. 'gemini' / 'claude': problem, steps, resolution, follow-ups.
const SUMMARY_BY: 'deepgram' | 'gemini' | 'claude' = 'gemini'
const TRANSCRIBE_BY: TranscribeProvider = 'sarvam'

export interface TranscriptResponse {
  callId: string
  provider: string
  model: string
  createdAt: Date
  segments: (TranscriptSegment & { name: string })[]
  summary: CallSummary | null
}

export interface CallResponse {
  callId: string
  status: CallStatus
  createdAt: Date
  recording: RecordingState
  consentAt: Date | null
  startedAt: Date | null
  endedAt: Date | null
  request: { requestId: string; title: string }
  client: { userId: string; name: string }
  consultant: { userId: string; name: string }
}

@Injectable()
export class CallsService implements OnModuleInit {
  private readonly logger = new Logger(CallsService.name)
  private readonly processTimers = new Map<string, NodeJS.Timeout>()

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Call) private readonly calls: Repository<Call>,
    @InjectRepository(CallTranscript) private readonly transcripts: Repository<CallTranscript>,
    private readonly communication: CommunicationService,
    private readonly helpRequests: HelpRequestsService,
    private readonly jwt: JwtService,
  ) {}

  async start(consultant: User, requestId: string): Promise<CallResponse> {
    const { call, request } = await this.dataSource.transaction(async (manager) => {
      const request = await manager.findOne(HelpRequest, {
        where: { requestId },
        relations: { client: true },
      })
      if (!request) throw new NotFoundException('Help request not found')
      if (request.status === 'RESOLVED') throw new ConflictException('This request is already resolved')
      if (request.status === 'IN_CALL') {
        throw new ConflictException('This request already has a call in progress')
      }
      const ringing = await manager.exists(Call, { where: { requestId, status: 'RINGING' } })
      if (ringing) throw new ConflictException('A call for this request is already ringing')

      const call = await manager.save(
        manager.create(Call, {
          requestId,
          clientId: request.clientId,
          consultantId: consultant.userId,
          status: 'RINGING',
        }),
      )
      return { call, request }
    })

    const response = toCallResponse(call, request, request.client, consultant)
    this.communication.emitToUser(request.clientId, 'call.incoming', response)
    this.pushRequest(requestId)

    setTimeout(() => void this.markMissed(call.callId), RING_TIMEOUT_MS).unref()

    return response
  }

  async getForParticipant(user: User, callId: string): Promise<CallResponse> {
    const call = await this.findForParticipant(user, callId)
    return toCallResponse(call, call.request, call.client, call.consultant)
  }

  async accept(client: User, callId: string): Promise<CallResponse> {
    const call = await this.transition({ callId, clientId: client.userId }, 'RINGING', 'ACTIVE', 'IN_CALL')
    const response = this.toResponse(call)
    this.communication.emitToUser(call.consultantId, 'call.accepted', response)
    this.pushRequest(call.requestId)
    return response
  }

  async decline(client: User, callId: string): Promise<CallResponse> {
    const call = await this.transition({ callId, clientId: client.userId }, 'RINGING', 'DECLINED')
    const response = this.toResponse(call)
    this.communication.emitToUser(call.consultantId, 'call.declined', response)
    this.pushRequest(call.requestId)
    return response
  }

  async cancel(consultant: User, callId: string): Promise<CallResponse> {
    const call = await this.transition({ callId, consultantId: consultant.userId }, 'RINGING', 'MISSED')
    return this.emitMissed(call)
  }

  async markMissed(callId: string): Promise<void> {
    try {
      this.emitMissed(await this.transition({ callId }, 'RINGING', 'MISSED'))
    } catch {
      // already answered, declined or cancelled
    }
  }

  async end(user: User, callId: string): Promise<CallResponse> {
    const where =
      user.role === 'CLIENT' ? { callId, clientId: user.userId } : { callId, consultantId: user.userId }
    const call = await this.transition(where, 'ACTIVE', 'ENDED', 'OPEN')
    const response = this.toResponse(call)
    this.communication.emitToUser(call.clientId, 'call.ended', response)
    this.communication.emitToUser(call.consultantId, 'call.ended', response)
    this.pushRequest(call.requestId)
    if (call.consentAt) this.scheduleProcessing(call.callId, PROCESS_AFTER_END_MS)
    return response
  }

  requestRecording(consultant: User, callId: string): Promise<CallResponse> {
    return this.setRecording({ callId, consultantId: consultant.userId }, 'OFF', 'REQUESTED')
  }

  allowRecording(client: User, callId: string): Promise<CallResponse> {
    return this.setRecording({ callId, clientId: client.userId }, 'REQUESTED', 'ON')
  }

  declineRecording(client: User, callId: string): Promise<CallResponse> {
    return this.setRecording({ callId, clientId: client.userId }, 'REQUESTED', 'OFF')
  }

  stopRecording(user: User, callId: string): Promise<CallResponse> {
    const where =
      user.role === 'CLIENT' ? { callId, clientId: user.userId } : { callId, consultantId: user.userId }
    return this.setRecording(where, 'ON', 'OFF')
  }

  async saveChunk(client: User, callId: string, chunk: Buffer, first: boolean, contentType: string) {
    const call = await this.calls.findOne({ where: { callId, clientId: client.userId } })
    if (!call) throw new NotFoundException('Call not found')

    const recording = call.status === 'ACTIVE' && call.recording === 'ON' && call.consentAt !== null
    const justStopped =
      call.recordingStoppedAt !== null &&
      Date.now() - call.recordingStoppedAt.getTime() < CHUNK_GRACE_MS
    if (!recording && !justStopped) throw new ConflictException('Recording is off — this call has no consent to record')
    if (call.status !== 'ACTIVE' && call.status !== 'ENDED') {
      throw new ConflictException('This recording is already being processed')
    }
    if (!first && call.recordingParts === 0) throw new ConflictException('Recording hasn’t started yet')
    if (call.status === 'ENDED') this.scheduleProcessing(callId, PROCESS_AFTER_CHUNK_MS)

    if (first) call.recordingParts += 1
    call.recordingPath = path.join(RECORDINGS_DIR, callId)
    const ext = contentType.includes('mp4') ? 'mp4' : 'webm'
    await mkdir(call.recordingPath, { recursive: true })
    await appendFile(path.join(call.recordingPath, `part-${call.recordingParts}.${ext}`), chunk)
    if (first) {
      await this.calls.save(call)
      this.pushRequest(call.requestId)
    }
  }

  async recordingLink(user: User, callId: string): Promise<{ url: string; expiresAt: Date }> {
    const call = await this.findForParticipant(user, callId)
    if (!call.recordingFile) throw new NotFoundException('Recording not found')
    if (call.status !== 'READY' && call.status !== 'FAILED') {
      throw new ConflictException('The recording is still being prepared')
    }
    const token = await this.jwt.signAsync(
      { callId, purpose: 'recording' },
      { secret: linkSecret(), expiresIn: LINK_TTL },
    )
    const { exp } = this.jwt.decode<{ exp: number }>(token)
    return { url: `/recordings/${token}`, expiresAt: new Date(exp * 1000) }
  }

  async fileForLink(token: string): Promise<string> {
    let callId: string
    try {
      const payload = await this.jwt.verifyAsync<{ callId: string; purpose: string }>(token, { secret: linkSecret() })
      if (payload.purpose !== 'recording') throw new Error('wrong purpose')
      callId = payload.callId
    } catch {
      throw new ForbiddenException('This recording link has expired — open the recording again')
    }
    const call = await this.calls.findOne({ where: { callId } })
    if (!call?.recordingPath || !call.recordingFile) throw new NotFoundException('Recording not found')
    return path.resolve(call.recordingPath, call.recordingFile)
  }

  // After a restart, pick up calls whose processing was interrupted or never started.
  async onModuleInit() {
    await this.calls.update({ status: 'PROCESSING' }, { status: 'ENDED' })
    const waiting = await this.calls.find({
      where: { status: 'ENDED', recordingParts: MoreThan(0) },
      select: { callId: true },
    })
    waiting.forEach((c) => this.scheduleProcessing(c.callId, PROCESS_AFTER_END_MS))
  }

  private scheduleProcessing(callId: string, delayMs: number) {
    clearTimeout(this.processTimers.get(callId))
    const timer = setTimeout(() => {
      this.processTimers.delete(callId)
      this.processRecording(callId).catch((e) => this.logger.error(`processing ${callId} failed`, e))
    }, delayMs)
    timer.unref()
    this.processTimers.set(callId, timer)
  }

  private async processRecording(callId: string) {
    const call = await this.calls.findOne({ where: { callId } })
    if (!call || call.status !== 'ENDED' || !call.recordingParts || !call.recordingPath) return
// Only one run per call: the update matches only while the call is still ENDED.
    const claimed = await this.calls.update({ callId, status: 'ENDED' }, { status: 'PROCESSING', error: null })
    if (!claimed.affected) return
    this.pushRequest(call.requestId)
    const dir = call.recordingPath

    let step = 'Couldn’t prepare the recording'
    try {
      if (!call.recordingFile) {
        const merged = await mergeRecording(dir, call.recordingParts)
        call.recordingFile = merged.file
        await this.calls.update({ callId }, { recordingFile: merged.file })
        this.logger.log(`call ${callId}: ${call.recordingParts} part(s) merged into ${merged.file}`)
        await this.deleteParts(dir, call.recordingParts)
        this.pushRequest(call.requestId)
      }

      step = 'Couldn’t transcribe the call'
      if (!(await this.transcripts.exists({ where: { callId } }))) {
        const audio = audioFileFor(call.recordingFile)
        const { segments, summary, model } = await transcribe(
          TRANSCRIBE_BY,
          path.join(dir, audio.file),
          audio.type,
          SUMMARY_BY === 'deepgram',
        )
        await this.transcripts.save({
          callId,
          provider: TRANSCRIBE_BY,
          model,
          segments,
          ...(summary && { summary: { kind: 'paragraph', text: summary }, summaryProvider: 'deepgram', summaryModel: DEEPGRAM_SUMMARY_MODEL }),
        })
        this.logger.log(`call ${callId}: transcript with ${segments.length} line(s)${summary ? ' + summary' : ''}`)
      }

      if (SUMMARY_BY !== 'deepgram') await this.summarizeCall(callId)

      await this.calls.update({ callId }, { status: 'READY' })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      this.logger.error(`call ${callId}: ${step} — ${message}`)
      await this.calls.update({ callId }, { status: 'FAILED', error: step })
    }
    this.pushRequest(call.requestId)
  }

  async getTranscript(user: User, callId: string): Promise<TranscriptResponse> {
    const call = await this.findForParticipant(user, callId)
    const transcript = await this.transcripts.findOne({ where: { callId } })
    if (!transcript) throw new NotFoundException('There’s no transcript for this call yet')
    const names = { CLIENT: call.client.name, CONSULTANT: call.consultant.name }
    return {
      callId,
      provider: transcript.provider,
      model: transcript.model,
      createdAt: transcript.createdAt,
      segments: transcript.segments.map((s) => ({ ...s, name: names[s.speaker] })),
      summary: transcript.summary,
    }
  }

  private async summarizeCall(callId: string) {
    if (SUMMARY_BY === 'deepgram') return
    const transcript = await this.transcripts.findOneOrFail({ where: { callId } })
    if (transcript.summary || !transcript.segments.length) return
    const people = await this.calls.findOneOrFail({ where: { callId }, relations: { client: true, consultant: true } })
    const names = { CLIENT: people.client.name, CONSULTANT: people.consultant.name }
    try {
      const lines = transcript.segments.map((s) => ({ ...s, name: names[s.speaker] }))
      const { parts, model } = await summarize(SUMMARY_BY, lines)
      await this.transcripts.update(
        { callId },
        { summary: { kind: 'structured', ...parts }, summaryProvider: SUMMARY_BY, summaryModel: model },
      )
      this.logger.log(`call ${callId}: summary ready`)
    } catch (e) {
      this.logger.error(`call ${callId}: couldn’t summarise — ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  private async deleteParts(dir: string, parts: number) {
    const names = ['parts.txt']
    for (let n = 1; n <= parts; n++) names.push(`part-${n}.webm`, `part-${n}.mp4`)
    await Promise.all(names.map((name) => rm(path.join(dir, name), { force: true })))
  }

  private async setRecording(
    where: { callId: string; clientId?: string; consultantId?: string },
    from: RecordingState,
    to: RecordingState,
  ): Promise<CallResponse> {
    const call = await this.dataSource.transaction(async (manager) => {
      const call = await manager.findOne(Call, {
        where,
        relations: { request: true, client: true, consultant: true },
      })
      if (!call) throw new NotFoundException('Call not found')
      if (call.status !== 'ACTIVE') throw new ConflictException(conflictMessage(call.status))
      if (call.recording !== from) throw new ConflictException(recordingConflict(call.recording))

      if (from === 'ON') call.recordingStoppedAt = new Date()
      call.recording = to
      if (to === 'ON') call.consentAt = new Date()
      return manager.save(call)
    })
    const response = this.toResponse(call)
    this.communication.emitToUser(call.clientId, 'call.recording', response)
    this.communication.emitToUser(call.consultantId, 'call.recording', response)
    return response
  }

  private async transition(
    where: { callId: string; clientId?: string; consultantId?: string },
    from: CallStatus,
    to: CallStatus,
    requestStatus?: HelpRequest['status'],
  ): Promise<Call> {
    return this.dataSource.transaction(async (manager) => {
      const call = await manager.findOne(Call, {
        where,
        relations: { request: { client: true }, client: true, consultant: true },
      })
      if (!call) throw new NotFoundException('Call not found')
      if (call.status !== from) throw new ConflictException(conflictMessage(call.status))

      call.status = to
      if (to === 'ACTIVE') call.startedAt = new Date()
      else call.endedAt = new Date()
      if (call.recording === 'ON') call.recordingStoppedAt = new Date()
      call.recording = 'OFF'
      await manager.save(call)

      if (requestStatus) {
        call.request.status = requestStatus
        await manager.save(call.request)
      }
      return call
    })
  }

  private emitMissed(call: Call): CallResponse {
    const response = this.toResponse(call)
    this.communication.emitToUser(call.clientId, 'call.missed', response)
    this.communication.emitToUser(call.consultantId, 'call.missed', response)
    this.pushRequest(call.requestId)
    return response
  }

  private pushRequest(requestId: string) {
    this.helpRequests
      .emitUpdated(requestId)
      .catch((e) => this.logger.error(`help-request.updated failed for ${requestId}`, e))
  }

  private toResponse(call: Call): CallResponse {
    return toCallResponse(call, call.request, call.client, call.consultant)
  }

// Access control: only the call's client or consultant. Anyone else gets 404, not 403.
  private async findForParticipant(user: User, callId: string): Promise<Call> {
    const call = await this.calls.findOne({
      where: [
        { callId, clientId: user.userId },
        { callId, consultantId: user.userId },
      ],
      relations: { request: true, client: true, consultant: true },
    })
    if (!call) throw new NotFoundException('Call not found')
    return call
  }

}

function conflictMessage(current: CallStatus) {
  switch (current) {
    case 'RINGING':
      return 'This call hasn’t been answered yet'
    case 'ACTIVE':
      return 'This call is already in progress'
    case 'MISSED':
      return 'This call was missed'
    case 'DECLINED':
      return 'This call was declined'
    default:
      return 'This call has ended'
  }
}

function recordingConflict(current: RecordingState) {
  switch (current) {
    case 'REQUESTED':
      return 'Already waiting for consent to record'
    case 'ON':
      return 'This call is already being recorded'
    default:
      return 'This call isn’t being recorded'
  }
}

function toCallResponse(
  call: Call,
  request: HelpRequest,
  client: User,
  consultant: User,
): CallResponse {
  return {
    callId: call.callId,
    status: call.status,
    createdAt: call.createdAt,
    recording: call.recording,
    consentAt: call.consentAt,
    startedAt: call.startedAt,
    endedAt: call.endedAt,
    request: { requestId: request.requestId, title: request.title },
    client: { userId: client.userId, name: client.name },
    consultant: { userId: consultant.userId, name: consultant.name },
  }
}
