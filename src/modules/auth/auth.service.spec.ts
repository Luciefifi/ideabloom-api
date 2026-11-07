import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AttemptLimiter } from '../../common/throttling/attempt-limiter';
import { Env } from '../../config/env.validation';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { AccountLimits } from './account-limits';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

const client = { userAgent: 'jest' };
const tokens = {
  accessToken: 'access',
  accessTokenExpiresIn: 900,
  refreshToken: 'refresh',
};
const user = {
  id: 'user-1',
  email: 'lucie@example.com',
  passwordHash: '$argon2id$hash',
} as User;

const limits: AccountLimits = {
  loginMaxFailures: 3,
  loginLockMs: 15 * 60_000,
  resetEmailsPerWindow: 3,
  resetEmailWindowMs: 60 * 60_000,
};

function setup({ registrationEnabled = true } = {}) {
  const limiter = new AttemptLimiter();
  const users = {
    create: jest.fn().mockResolvedValue(user),
    findByEmailWithPassword: jest.fn().mockResolvedValue(user),
    findById: jest.fn().mockResolvedValue(user),
    findByIdWithPassword: jest.fn().mockResolvedValue(user),
    updatePassword: jest.fn().mockResolvedValue(undefined),
  };
  const passwords = {
    hash: jest.fn().mockResolvedValue('$argon2id$new-hash'),
    verify: jest.fn().mockResolvedValue(true),
    verifyAgainstDummy: jest.fn().mockResolvedValue(false),
  };
  const tokenService = {
    issueTokens: jest.fn().mockResolvedValue(tokens),
    rotate: jest.fn().mockResolvedValue({ userId: 'user-1', tokens }),
    revokeAllForUser: jest.fn().mockResolvedValue(undefined),
  };
  const config = {
    get: jest.fn((key: string) =>
      key === 'REGISTRATION_ENABLED' ? registrationEnabled : undefined,
    ),
  };

  const service = new AuthService(
    users as unknown as UsersService,
    passwords as unknown as PasswordService,
    tokenService as unknown as TokenService,
    config as unknown as ConfigService<Env, true>,
    limiter,
    limits,
  );
  return { service, users, passwords, tokenService, limiter };
}

describe('AuthService', () => {
  describe('register', () => {
    const dto = {
      email: 'lucie@example.com',
      password: 'a long enough password',
      displayName: 'Lucie',
    };

    it('stores a hash of the password, never the password itself', async () => {
      const { service, users } = setup();

      const result = await service.register(dto, client);

      expect(users.create).toHaveBeenCalledWith({
        email: dto.email,
        passwordHash: '$argon2id$new-hash',
        displayName: 'Lucie',
      });
      expect(result.tokens).toBe(tokens);
    });

    it('is refused when registration is closed', async () => {
      const { service, users } = setup({ registrationEnabled: false });

      await expect(service.register(dto, client)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(users.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    const dto = { email: 'lucie@example.com', password: 'whatever password' };

    it('logs in with the right password', async () => {
      const { service } = setup();

      await expect(service.login(dto, client)).resolves.toEqual({
        user,
        tokens,
      });
    });

    it('gives the same generic error for a wrong password…', async () => {
      const { service, passwords } = setup();
      passwords.verify.mockResolvedValueOnce(false);

      await expect(service.login(dto, client)).rejects.toThrow(
        new UnauthorizedException('Invalid email or password.'),
      );
    });

    it('…and for an unknown email, after doing the same hashing work', async () => {
      const { service, users, passwords, tokenService } = setup();
      users.findByEmailWithPassword.mockResolvedValueOnce(null);

      await expect(service.login(dto, client)).rejects.toThrow(
        new UnauthorizedException('Invalid email or password.'),
      );
      expect(passwords.verifyAgainstDummy).toHaveBeenCalledWith(dto.password);
      expect(tokenService.issueTokens).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('requires a refresh token', async () => {
      const { service } = setup();

      await expect(service.refresh(undefined, client)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('fails if the user no longer exists', async () => {
      const { service, users } = setup();
      users.findById.mockResolvedValueOnce(null);

      await expect(service.refresh('refresh', client)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('changePassword', () => {
    const dto = {
      currentPassword: 'my current password',
      newPassword: 'my brand new password',
    };

    it('saves the new hash, logs out all sessions, then starts a fresh one', async () => {
      const { service, users, tokenService } = setup();

      const result = await service.changePassword('user-1', dto, client);

      expect(users.updatePassword).toHaveBeenCalledWith(
        'user-1',
        '$argon2id$new-hash',
      );
      expect(tokenService.revokeAllForUser).toHaveBeenCalledWith('user-1');
      expect(result.tokens).toBe(tokens);
    });

    it('refuses a wrong current password with 400 and changes nothing', async () => {
      const { service, users, passwords, tokenService } = setup();
      passwords.verify.mockResolvedValueOnce(false);

      await expect(
        service.changePassword('user-1', dto, client),
      ).rejects.toThrow(
        new BadRequestException('Your current password is incorrect.'),
      );
      expect(users.updatePassword).not.toHaveBeenCalled();
      expect(tokenService.revokeAllForUser).not.toHaveBeenCalled();
    });

    it('refuses a new password equal to the current one', async () => {
      const { service, users } = setup();

      await expect(
        service.changePassword(
          'user-1',
          {
            currentPassword: 'same password!!',
            newPassword: 'same password!!',
          },
          client,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(users.updatePassword).not.toHaveBeenCalled();
    });
  });

  describe('per-account login limit', () => {
    const dto = { email: 'lucie@example.com', password: 'wrong password!!' };

    it('pauses an account after too many failures, even for the right password', async () => {
      const { service, passwords } = setup();
      passwords.verify.mockResolvedValue(false);
      for (let i = 0; i < limits.loginMaxFailures; i++) {
        await expect(service.login(dto, client)).rejects.toBeInstanceOf(
          UnauthorizedException,
        );
      }

      passwords.verify.mockResolvedValue(true); // now the right password
      passwords.verify.mockClear();

      await expect(service.login(dto, client)).rejects.toMatchObject({
        status: HttpStatus.TOO_MANY_REQUESTS,
        message:
          'Too many failed attempts for this account. Please wait 15 minutes or reset your password.',
      });
      expect(passwords.verify).not.toHaveBeenCalled();
    });

    it('also counts failures for emails that have no account (reveals nothing)', async () => {
      const { service, users } = setup();
      users.findByEmailWithPassword.mockResolvedValue(null);
      for (let i = 0; i < limits.loginMaxFailures; i++) {
        await service.login(dto, client).catch(() => undefined);
      }

      await expect(service.login(dto, client)).rejects.toMatchObject({
        status: HttpStatus.TOO_MANY_REQUESTS,
      });
    });

    it('resets the count after a successful login', async () => {
      const { service, passwords } = setup();
      passwords.verify.mockResolvedValue(false);
      for (let i = 0; i < limits.loginMaxFailures - 1; i++) {
        await service.login(dto, client).catch(() => undefined);
      }
      passwords.verify.mockResolvedValueOnce(true);
      await service.login(dto, client);

      // A fresh allowance: these failures are 401s again, not 429.
      for (let i = 0; i < limits.loginMaxFailures; i++) {
        await expect(service.login(dto, client)).rejects.toBeInstanceOf(
          UnauthorizedException,
        );
      }
    });
  });
});
