import { Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import {
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { Repository } from "typeorm";
import { JwtPayload } from "../auth/jwt-auth.guard";
import { User } from "../users/user.entity";
import {
  CONSULTANTS_ROOM,
  CommunicationService,
  userRoom,
} from "./communication.service";

@WebSocketGateway({ cors: { origin: "http://localhost:5173" } })
export class CommunicationGateway
  implements OnGatewayInit, OnGatewayConnection
{
  private readonly logger = new Logger(CommunicationGateway.name);

  constructor(
    private readonly jwt: JwtService,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly communication: CommunicationService,
  ) {}

  afterInit(server: Server) {
    this.communication.attach(server);
  }

  async handleConnection(socket: Socket) {
    try {
      const token: unknown = socket.handshake.auth?.token;
      if (typeof token !== "string") throw new Error("missing token");

      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      const user = await this.users.findOne({
        where: { userId: payload.sub, isActive: true },
      });
      if (!user) throw new Error("unknown or inactive user");

      socket.data.user = user;
      await socket.join(userRoom(user.userId));
      if (user.role === "CONSULTANT") await socket.join(CONSULTANTS_ROOM);

      this.logger.log(`${user.email} connected`);
    } catch {
      socket.disconnect(true);
    }
  }
}
