import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from '../../config/env.validation';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
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

function setup({ registrationEnabled = true } = {}) {
  const users = {
    create: jest.fn().mockResolvedValue(user),
    findByEmailWithPassword: jest.fn().mockResolvedValue(user),
    findById: jest.fn().mockResolvedValue(user),
  };
  const passwords = {
    hash: jest.fn().mockResolvedValue('$argon2id$new-hash'),
    verify: jest.fn().mockResolvedValue(true),
    verifyAgainstDummy: jest.fn().mockResolvedValue(false),
  };
  const tokenService = {
    issueTokens: jest.fn().mockResolvedValue(tokens),
    rotate: jest.fn().mockResolvedValue({ userId: 'user-1', tokens }),
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
  );
  return { service, users, passwords, tokenService };
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
});
