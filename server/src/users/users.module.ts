import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { User } from './user.entity'
import { UsersSeed } from './users.seed'

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [UsersSeed],
  exports: [TypeOrmModule],
})
export class UsersModule {}
