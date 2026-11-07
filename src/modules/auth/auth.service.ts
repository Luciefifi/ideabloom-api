import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AttemptLimiter } from '../../common/throttling/attempt-limiter';
import { Env } from '../../config/env.validation';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import {
  ACCOUNT_LIMITS,
  loginLimiterKey,
  type AccountLimits,
} from './account-limits';
import type { ClientContext, IssuedTokens } from './auth.types';
import { ChangePasswordDto, LoginDto, RegisterDto } from './dto/auth.dto';
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
    private readonly limiter: AttemptLimiter,
    @Inject(ACCOUNT_LIMITS) private readonly limits: AccountLimits,
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
    // Per-account limit: checked BEFORE the password, so once paused, even the
    // right password is refused (otherwise guessing could simply continue).
    // It applies to any email, existing or not, so it reveals nothing.
    const limiterKey = loginLimiterKey(dto.email);
    const { blocked } = this.limiter.check(
      limiterKey,
      this.limits.loginMaxFailures,
      this.limits.loginLockMs,
    );
    if (blocked) {
      const minutes = Math.round(this.limits.loginLockMs / 60_000);
      throw new HttpException(
        `Too many failed attempts for this account. Please wait ${minutes} minutes or reset your password.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.users.findByEmailWithPassword(dto.email);

    // Same work and same message whether the email exists or not, so the
    // response doesn't reveal which emails have accounts.
    const passwordIsValid = user
      ? await this.passwords.verify(user.passwordHash, dto.password)
      : await this.passwords.verifyAgainstDummy(dto.password);

    if (!user || !passwordIsValid) {
      this.limiter.record(limiterKey, this.limits.loginLockMs);
      throw new UnauthorizedException('Invalid email or password.');
    }

    this.limiter.reset(limiterKey);
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

  /**
   * Requires the current password (so someone using an unlocked, logged-in
   * device can't lock you out). Afterwards every other device is logged out,
   * and this device gets a fresh session.
   */
  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    client: ClientContext,
  ): Promise<AuthResult> {
    const user = await this.users.findByIdWithPassword(userId);
    if (!user) {
      throw new UnauthorizedException('Please log in to continue.');
    }

    // 400, not 401: a 401 would make the web app think the session expired.
    if (
      !(await this.passwords.verify(user.passwordHash, dto.currentPassword))
    ) {
      throw new BadRequestException('Your current password is incorrect.');
    }
    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException(
        'Choose a new password that is different from your current one.',
      );
    }

    await this.users.updatePassword(
      userId,
      await this.passwords.hash(dto.newPassword),
    );
    await this.tokens.revokeAllForUser(userId);

    return { user, tokens: await this.tokens.issueTokens(userId, client) };
  }
}
