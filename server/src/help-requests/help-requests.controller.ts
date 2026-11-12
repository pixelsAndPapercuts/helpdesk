import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'
import { CurrentUser } from '../auth/current-user.decorator'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { Roles, RolesGuard } from '../auth/roles.guard'
import { User } from '../users/user.entity'
import { CreateHelpRequestDto } from './create-help-request.dto'
import { HelpRequestsService } from './help-requests.service'

@Controller('help-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class HelpRequestsController {
  constructor(private readonly requests: HelpRequestsService) {}

  @Post()
  @Roles('CLIENT')
  create(@CurrentUser() user: User, @Body() dto: CreateHelpRequestDto) {
    return this.requests.create(user, dto)
  }

  @Get()
  list(@CurrentUser() user: User) {
    return this.requests.listFor(user)
  }

  @Post(':requestId/resolve')
  @HttpCode(200)
  @Roles('CONSULTANT')
  resolve(@Param('requestId', ParseUUIDPipe) requestId: string) {
    return this.requests.resolve(requestId)
  }
}
