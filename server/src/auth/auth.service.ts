import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { InjectRepository } from '@nestjs/typeorm'
import * as bcrypt from 'bcryptjs'
import { Repository } from 'typeorm'
import { User } from '../users/user.entity'

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.users.findOne({
      where: { email: email.toLowerCase(), isActive: true },
      select: { userId: true, name: true, email: true, role: true, passwordHash: true },
    })

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password')
    }

    const token = await this.jwt.signAsync({ sub: user.userId, role: user.role })

    return {
      token,
      user: { userId: user.userId, name: user.name, email: user.email, role: user.role },
    }
  }
}
