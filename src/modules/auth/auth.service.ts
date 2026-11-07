import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from '../../config/env.validation';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import type { ClientContext, IssuedTokens } from './auth.types';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

export interface AuthResult {
  user: User;
  tokens: IssuedTokens;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async register(dto: RegisterDto, client: ClientContext): Promise<AuthResult> {
    if (!this.config.get('REGISTRATION_ENABLED', { infer: true })) {
      throw new ForbiddenException('Registration is currently closed.');
    }

    const user = await this.users.create({
      email: dto.email,
      passwordHash: await this.passwords.hash(dto.password),
      displayName: dto.displayName,
    });

    return { user, tokens: await this.tokens.issueTokens(user.id, client) };
  }

  async login(dto: LoginDto, client: ClientContext): Promise<AuthResult> {
    const user = await this.users.findByEmailWithPassword(dto.email);

    // Same work and same message whether the email exists or not, so the
    // response doesn't reveal which emails have accounts.
    const passwordIsValid = user
      ? await this.passwords.verify(user.passwordHash, dto.password)
      : await this.passwords.verifyAgainstDummy(dto.password);

    if (!user || !passwordIsValid) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    return { user, tokens: await this.tokens.issueTokens(user.id, client) };
  }

  async refresh(
    refreshToken: string | undefined,
    client: ClientContext,
  ): Promise<AuthResult> {
    if (!refreshToken) {
      throw new UnauthorizedException('Please log in to continue.');
    }

    const { userId, tokens } = await this.tokens.rotate(refreshToken, client);
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Please log in to continue.');
    }
    return { user, tokens };
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (refreshToken) {
      await this.tokens.revokeSession(refreshToken);
    }
  }

  logoutAll(userId: string): Promise<void> {
    return this.tokens.revokeAllForUser(userId);
  }
}
