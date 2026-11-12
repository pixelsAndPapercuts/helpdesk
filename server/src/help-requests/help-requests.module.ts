import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AuthModule } from '../auth/auth.module'
import { CommunicationModule } from '../communication/communication.module'
import { Call } from '../calls/call.entity'
import { HelpRequest } from './help-request.entity'
import { HelpRequestsController } from './help-requests.controller'
import { HelpRequestsService } from './help-requests.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([HelpRequest, Call]),
    AuthModule,
    CommunicationModule,
  ],
  controllers: [HelpRequestsController],
  providers: [HelpRequestsService],
  exports: [HelpRequestsService],
})
export class HelpRequestsModule {}
