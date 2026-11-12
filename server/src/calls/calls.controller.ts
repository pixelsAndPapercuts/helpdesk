import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common'
import type { Response } from 'express'
import { CurrentUser } from '../auth/current-user.decorator'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { Roles, RolesGuard } from '../auth/roles.guard'
import { User } from '../users/user.entity'
import { CallsService } from './calls.service'

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class CallsController {
  constructor(private readonly calls: CallsService) {}

  @Post('help-requests/:requestId/calls')
  @Roles('CONSULTANT')
  start(@CurrentUser() user: User, @Param('requestId', ParseUUIDPipe) requestId: string) {
    return this.calls.start(user, requestId)
  }

  @Get('calls/:callId')
  get(@CurrentUser() user: User, @Param('callId', ParseUUIDPipe) callId: string) {
    return this.calls.getForParticipant(user, callId)
  }

  @Post('calls/:callId/accept')
  @HttpCode(200)
  @Roles('CLIENT')
  accept(@CurrentUser() user: User, @Param('callId', ParseUUIDPipe) callId: string) {
    return this.calls.accept(user, callId)
  }

  @Post('calls/:callId/decline')
  @HttpCode(200)
  @Roles('CLIENT')
  decline(@CurrentUser() user: User, @Param('callId', ParseUUIDPipe) callId: string) {
    return this.calls.decline(user, callId)
  }

  @Post('calls/:callId/cancel')
  @HttpCode(200)
  @Roles('CONSULTANT')
  cancel(@CurrentUser() user: User, @Param('callId', ParseUUIDPipe) callId: string) {
    return this.calls.cancel(user, callId)
  }

  @Post('calls/:callId/recording/request')
  @HttpCode(200)
  @Roles('CONSULTANT')
  requestRecording(@CurrentUser() user: User, @Param('callId', ParseUUIDPipe) callId: string) {
    return this.calls.requestRecording(user, callId)
  }

  @Post('calls/:callId/recording/allow')
  @HttpCode(200)
  @Roles('CLIENT')
  allowRecording(@CurrentUser() user: User, @Param('callId', ParseUUIDPipe) callId: string) {
    return this.calls.allowRecording(user, callId)
  }

  @Post('calls/:callId/recording/decline')
  @HttpCode(200)
  @Roles('CLIENT')
  declineRecording(@CurrentUser() user: User, @Param('callId', ParseUUIDPipe) callId: string) {
    return this.calls.declineRecording(user, callId)
  }

  @Post('calls/:callId/recording/stop')
  @HttpCode(200)
  stopRecording(@CurrentUser() user: User, @Param('callId', ParseUUIDPipe) callId: string) {
    return this.calls.stopRecording(user, callId)
  }

  @Post('calls/:callId/recording/chunks')
  @HttpCode(204)
  @Roles('CLIENT')
  uploadChunk(
    @CurrentUser() user: User,
    @Param('callId', ParseUUIDPipe) callId: string,
    @Query('first') first: string | undefined,
    @Headers('content-type') contentType: string | undefined,
    @Body() body: unknown,
  ) {
    if (!Buffer.isBuffer(body) || body.length === 0) {
      throw new BadRequestException('Send the chunk as video/webm or video/mp4 bytes')
    }
    return this.calls.saveChunk(user, callId, body, first === '1', contentType ?? '')
  }

  @Post('calls/:callId/recording/link')
  @HttpCode(200)
  recordingLink(@CurrentUser() user: User, @Param('callId', ParseUUIDPipe) callId: string) {
    return this.calls.recordingLink(user, callId)
  }

  @Get('calls/:callId/transcript')
  transcript(@CurrentUser() user: User, @Param('callId', ParseUUIDPipe) callId: string) {
    return this.calls.getTranscript(user, callId)
  }

  @Post('calls/:callId/end')
  @HttpCode(200)
  end(@CurrentUser() user: User, @Param('callId', ParseUUIDPipe) callId: string) {
    return this.calls.end(user, callId)
  }
}

@Controller('recordings')
export class RecordingsController {
  constructor(private readonly calls: CallsService) {}

  @Get(':token')
  async stream(@Param('token') token: string, @Res() res: Response) {
    const file = await this.calls.fileForLink(token)
    res.sendFile(file, { headers: { 'Cache-Control': 'private, max-age=1800' } }, (err) => {
      if (err && !res.headersSent) res.status(404).json({ statusCode: 404, message: 'Recording not found' })
    })
  }
}
