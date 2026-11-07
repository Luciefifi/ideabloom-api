import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { IsNull, Repository } from 'typeorm';
import { AttemptLimiter } from '../../common/throttling/attempt-limiter';
import { Env } from '../../config/env.validation';
import { MailService } from '../mail/mail.service';
import { passwordResetEmail } from '../mail/templates/password-reset.email';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import {
  ACCOUNT_LIMITS,
  resetEmailLimiterKey,
  type AccountLimits,
} from './account-limits';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { PasswordService } from './password.service';
import { hashToken, TokenService } from './token.service';

const MINUTE_MS = 60_000;

function invalidLink(): BadRequestException {
  return new BadRequestException(
    'This reset link is invalid or has expired. Please request a new one.',
  );
}

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    @InjectRepository(PasswordResetToken)
    private readonly resetTokens: Repository<PasswordResetToken>,
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
    private readonly limiter: AttemptLimiter,
    @Inject(ACCOUNT_LIMITS) private readonly limits: AccountLimits,
  ) {}

  /**
   * Behaves identically whether or not the account exists: same response, and
   * the slow part (creating the token, sending the email) happens in the
   * background so the response time doesn't give the answer away either.
   */
  async requestReset(email: string): Promise<void> {
    // At most N emails per address per hour, so nobody can flood an inbox.
    // Counted for every address (existing or not) and never mentioned in the
    // response, which stays identical.
    const key = resetEmailLimiterKey(email.trim().toLowerCase());
    const { blocked } = this.limiter.check(
      key,
      this.limits.resetEmailsPerWindow,
      this.limits.resetEmailWindowMs,
    );
    if (blocked) {
      return;
    }
    this.limiter.record(key, this.limits.resetEmailWindowMs);

    const user = await this.users.findByEmail(email);
    if (!user) {
      return;
    }

    void this.sendResetLink(user).catch((error: unknown) =>
      this.logger.error('Could not send password reset email', error),
    );
  }

  /** Sets a new password with a valid link, then logs out every device. */
  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const stored = await this.resetTokens.findOneBy({
      tokenHash: hashToken(rawToken),
    });
    if (!stored || stored.usedAt || stored.expiresAt.getTime() <= Date.now()) {
      throw invalidLink();
    }

    // Claim the link atomically so it can only ever be used once.
    const claim = await this.resetTokens.update(
      { id: stored.id, usedAt: IsNull() },
      { usedAt: new Date() },
    );
    if (!claim.affected) {
      throw invalidLink();
    }

    await this.users.updatePassword(
      stored.userId,
      await this.passwords.hash(newPassword),
    );
    // Whoever might have had access (that's often why people reset) is logged out.
    await this.tokens.revokeAllForUser(stored.userId);
  }

  private async sendResetLink(user: User): Promise<void> {
    // Only the newest link should work: retire any earlier unused ones.
    await this.resetTokens.update(
      { userId: user.id, usedAt: IsNull() },
      { usedAt: new Date() },
    );

    const token = randomBytes(32).toString('base64url');
    const ttlMinutes = this.config.get('PASSWORD_RESET_TTL_MINUTES', {
      infer: true,
    });
    await this.resetTokens.insert({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + ttlMinutes * MINUTE_MS),
    });

    const resetUrl = new URL(
      '/reset-password',
      this.config.get('WEB_APP_URL', { infer: true }),
    );
    resetUrl.searchParams.set('token', token);

    await this.mail.send(
      passwordResetEmail({
        to: user.email,
        displayName: user.displayName,
        resetUrl: resetUrl.toString(),
        expiresInMinutes: ttlMinutes,
      }),
    );
  }
}
