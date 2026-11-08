import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { IsNull, Repository } from 'typeorm';
import { Env } from '../../config/env.validation';
import { REFRESH_REUSE_GRACE_MS } from './auth.constants';
import { RefreshToken } from './entities/refresh-token.entity';
import { hashToken, TokenService } from './token.service';

const client = { deviceLabel: 'Unknown device' };
const settings = { JWT_ACCESS_TTL_SECONDS: 900, REFRESH_TOKEN_TTL_DAYS: 30 };

function setup(stored: Partial<RefreshToken> | null = null) {
  const repo = {
    findOneBy: jest.fn().mockResolvedValue(stored),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    insert: jest.fn().mockResolvedValue({}),
  };
  const config = {
    get: jest.fn((key: keyof typeof settings) => settings[key]),
  };
  const jwt = new JwtService({
    secret: 'unit-test-secret-unit-test-secret',
    signOptions: { expiresIn: 900 },
  });

  const service = new TokenService(
    jwt,
    config as unknown as ConfigService<Env, true>,
    repo as unknown as Repository<RefreshToken>,
  );
  return { service, repo };
}

function activeToken(overrides: Partial<RefreshToken> = {}): RefreshToken {
  return {
    id: 'token-1',
    userId: 'user-1',
    familyId: 'family-1',
    tokenHash: hashToken('raw-token'),
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    deviceLabel: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('TokenService', () => {
  describe('issueTokens', () => {
    it('returns a verifiable access token and stores only the refresh token hash', async () => {
      const { service, repo } = setup();

      const tokens = await service.issueTokens('user-1', client);

      await expect(
        service.verifyAccessToken(tokens.accessToken),
      ).resolves.toMatchObject({ sub: 'user-1' });
      expect(tokens.accessTokenExpiresIn).toBe(900);

      const saved = repo.insert.mock.calls[0][0] as Partial<RefreshToken>;
      expect(saved.tokenHash).toBe(hashToken(tokens.refreshToken));
      expect(saved.tokenHash).not.toBe(tokens.refreshToken);
      expect(saved.userId).toBe('user-1');
    });
  });

  describe('rotate', () => {
    it('revokes the used token and issues a new one in the same session family', async () => {
      const { service, repo } = setup(activeToken());

      const result = await service.rotate('raw-token', client);

      expect(result.userId).toBe('user-1');
      expect(repo.update).toHaveBeenCalledWith(
        { id: 'token-1', revokedAt: IsNull() },
        { revokedAt: expect.any(Date) as Date },
      );
      const saved = repo.insert.mock.calls[0][0] as Partial<RefreshToken>;
      expect(saved.familyId).toBe('family-1');
      expect(result.tokens.refreshToken).not.toBe('raw-token');
    });

    it('rejects an unknown token', async () => {
      const { service, repo } = setup(null);

      await expect(service.rotate('nope', client)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('rejects an expired token', async () => {
      const { service } = setup(
        activeToken({ expiresAt: new Date(Date.now() - 1000) }),
      );

      await expect(service.rotate('raw-token', client)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('treats reuse of an old revoked token as theft and revokes the whole session', async () => {
      const { service, repo } = setup(
        activeToken({
          revokedAt: new Date(Date.now() - REFRESH_REUSE_GRACE_MS - 1000),
        }),
      );

      await expect(service.rotate('raw-token', client)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(repo.update).toHaveBeenCalledWith(
        { familyId: 'family-1', revokedAt: IsNull() },
        { revokedAt: expect.any(Date) as Date },
      );
    });

    it('treats a just-rotated token as a harmless race (two tabs) and keeps the session', async () => {
      const { service, repo } = setup(
        activeToken({ revokedAt: new Date(Date.now() - 1000) }),
      );

      await expect(service.rotate('raw-token', client)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('fails if another request claimed the token first', async () => {
      const { service, repo } = setup(activeToken());
      repo.update.mockResolvedValueOnce({ affected: 0 });

      await expect(service.rotate('raw-token', client)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(repo.insert).not.toHaveBeenCalled();
    });
  });

  it('rejects an access token signed with a different secret', async () => {
    const { service } = setup();
    const forged = await new JwtService({
      secret: 'attacker-secret-attacker-secret!!',
    }).signAsync({ sub: 'user-1' });

    await expect(service.verifyAccessToken(forged)).rejects.toThrow();
  });
});
