import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { CommunicationGateway } from './communication.gateway'
import { CommunicationService } from './communication.service'

@Module({
  imports: [AuthModule],
  providers: [CommunicationGateway, CommunicationService],
  exports: [CommunicationService],
})
export class CommunicationModule {}
