import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { IsNull, Repository } from 'typeorm';
import { Env } from '../../config/env.validation';
import { REFRESH_REUSE_GRACE_MS } from './auth.constants';
import type {
  AccessTokenPayload,
  ClientContext,
  IssuedTokens,
  SessionInfo,
} from './auth.types';
import { RefreshToken } from './entities/refresh-token.entity';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Refresh tokens are random (not guessable), so a fast SHA-256 hash is enough to store them safely. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function sessionExpired(): UnauthorizedException {
  return new UnauthorizedException(
    'Your session has expired. Please log in again.',
  );
}

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokens: Repository<RefreshToken>,
  ) {}

  /** A new access + refresh token pair. A new login starts a new session family. */
  async issueTokens(
    userId: string,
    client: ClientContext,
    familyId: string = randomUUID(),
  ): Promise<IssuedTokens> {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync({
        sub: userId,
        sid: familyId,
      } satisfies AccessTokenPayload),
      this.createRefreshToken(userId, familyId, client),
    ]);

    return {
      accessToken,
      accessTokenExpiresIn: this.config.get('JWT_ACCESS_TTL_SECONDS', {
        infer: true,
      }),
      refreshToken,
    };
  }

  /** Checks the signature, expiry, issuer and audience. Throws if anything is wrong. */
  verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    return this.jwt.verifyAsync<AccessTokenPayload>(token);
  }

  /**
   * Exchanges a valid refresh token for a new pair and revokes the old one
   * (rotation). Presenting an already-revoked token outside the grace window
   * means it was probably stolen: the whole session family is revoked.
   */
  async rotate(
    rawToken: string,
    client: ClientContext,
  ): Promise<{ userId: string; tokens: IssuedTokens }> {
    const stored = await this.refreshTokens.findOneBy({
      tokenHash: hashToken(rawToken),
    });
    if (!stored) {
      throw sessionExpired();
    }

    if (stored.revokedAt) {
      const msSinceRevoked = Date.now() - stored.revokedAt.getTime();
      if (msSinceRevoked > REFRESH_REUSE_GRACE_MS) {
        await this.revokeFamily(stored.familyId);
        this.logger.warn(
          `Refresh token reuse detected for user ${stored.userId}; session revoked`,
        );
      }
      throw sessionExpired();
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      throw sessionExpired();
    }

    // Claim the token atomically: "revoke it only if nobody else has yet".
    // If two requests race, exactly one of them gets affected = 1.
    const claim = await this.refreshTokens.update(
      { id: stored.id, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    if (!claim.affected) {
      throw sessionExpired();
    }

    const tokens = await this.issueTokens(
      stored.userId,
      client,
      stored.familyId,
    );
    return { userId: stored.userId, tokens };
  }

  /** Logout: ends the session (family) this refresh token belongs to. */
  async revokeSession(rawToken: string): Promise<void> {
    const stored = await this.refreshTokens.findOneBy({
      tokenHash: hashToken(rawToken),
    });
    if (stored) {
      await this.revokeFamily(stored.familyId);
    }
  }

  /** "Log out of all devices". */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.refreshTokens.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  /**
   * Signed-in devices: one per session family that still has a valid token.
   * "Signed in" = the family's first token; "last active" = its newest one
   * (a new token is created every time the app refreshes its session).
   */
  async listSessions(
    userId: string,
    currentSessionId?: string,
  ): Promise<SessionInfo[]> {
    const rows: {
      id: string;
      device: string | null;
      signed_in_at: Date;
      last_active_at: Date;
    }[] = await this.refreshTokens.query(
      `SELECT family_id AS id,
              (array_agg(device_label ORDER BY created_at DESC))[1] AS device,
              MIN(created_at) AS signed_in_at,
              MAX(created_at) AS last_active_at
         FROM refresh_tokens
        WHERE user_id = $1
        GROUP BY family_id
       HAVING bool_or(revoked_at IS NULL AND expires_at > now())
        ORDER BY last_active_at DESC`,
      [userId],
    );
    return rows.map((row) => ({
      id: row.id,
      device: row.device ?? 'Unknown device',
      signedInAt: row.signed_in_at,
      lastActiveAt: row.last_active_at,
      current: row.id === currentSessionId,
    }));
  }

  /** Signs one of the user's devices out. False if it isn't theirs or already ended. */
  async revokeUserSession(userId: string, familyId: string): Promise<boolean> {
    const result = await this.refreshTokens.update(
      { userId, familyId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    return Boolean(result.affected);
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.refreshTokens.update(
      { familyId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  private async createRefreshToken(
    userId: string,
    familyId: string,
    client: ClientContext,
  ): Promise<string> {
    const token = randomBytes(32).toString('base64url'); // 256 bits of randomness
    const ttlDays = this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true });

    await this.refreshTokens.insert({
      userId,
      familyId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + ttlDays * DAY_MS),
      deviceLabel: client.deviceLabel,
    });

    return token;
  }
}
