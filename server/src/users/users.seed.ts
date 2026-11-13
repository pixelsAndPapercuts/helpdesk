import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import * as bcrypt from 'bcryptjs'
import { Repository } from 'typeorm'
import { Role, User } from './user.entity'

const DEMO_PASSWORD = 'password'

const DEMO_USERS: { name: string; email: string; role: Role }[] = [
  { name: 'Jordan Lee', email: 'jordan@consultant.test', role: 'CONSULTANT' },
  { name: 'Alex Morgan', email: 'alex@client.test', role: 'CLIENT' },
  { name: 'Sam Carter', email: 'sam@client.test', role: 'CLIENT' },
]

@Injectable()
export class UsersSeed implements OnApplicationBootstrap {
  private readonly logger = new Logger(UsersSeed.name)

  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  async onApplicationBootstrap() {
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10)

    for (const demo of DEMO_USERS) {
      const exists = await this.users.exists({ where: { email: demo.email }, withDeleted: true })
      if (!exists) {
        await this.users.insert({ ...demo, passwordHash })
        this.logger.log(`Seeded ${demo.role.toLowerCase()} ${demo.email}`)
      }
    }
  }
}
