import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AuthModule } from '../auth/auth.module'
import { CommunicationModule } from '../communication/communication.module'
import { HelpRequestsModule } from '../help-requests/help-requests.module'
import { Call } from './call.entity'
import { CallTranscript } from './call-transcript.entity'
import { CallsController, RecordingsController } from './calls.controller'
import { CallsGateway } from './calls.gateway'
import { CallsService } from './calls.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([Call, CallTranscript]),
    AuthModule,
    CommunicationModule,
    HelpRequestsModule,
  ],
  controllers: [CallsController, RecordingsController],
  providers: [CallsService, CallsGateway],
})
export class CallsModule {}
