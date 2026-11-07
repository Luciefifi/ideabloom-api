import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import { Env } from '../../config/env.validation';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  REFRESH_COOKIE_PATH,
  SESSION_COOKIE,
} from './auth.constants';
import type { IssuedTokens } from './auth.types';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Puts tokens into cookies for browsers.
 *
 * - httpOnly: JavaScript in the page can't read them, so an injected script
 *   can't steal them.
 * - secure (production): only sent over HTTPS.
 * - sameSite "lax": not sent with requests that other websites trigger in the
 *   background, the main protection against cross-site request forgery (CSRF).
 */
@Injectable()
export class AuthCookieService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  private get baseOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get('NODE_ENV', { infer: true }) === 'production',
      sameSite: 'lax',
    };
  }

  set(res: Response, tokens: IssuedTokens): void {
    const sessionMaxAge =
      this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true }) * DAY_MS;

    res.cookie(ACCESS_COOKIE, tokens.accessToken, {
      ...this.baseOptions,
      path: '/',
      maxAge: tokens.accessTokenExpiresIn * 1000,
    });
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      ...this.baseOptions,
      path: REFRESH_COOKIE_PATH, // only sent to /api/v1/auth/*
      maxAge: sessionMaxAge,
    });
    res.cookie(SESSION_COOKIE, '1', {
      ...this.baseOptions,
      path: '/',
      maxAge: sessionMaxAge,
    });
  }

  clear(res: Response): void {
    // A cookie is only removed if path and options match how it was set.
    res.clearCookie(ACCESS_COOKIE, { ...this.baseOptions, path: '/' });
    res.clearCookie(REFRESH_COOKIE, {
      ...this.baseOptions,
      path: REFRESH_COOKIE_PATH,
    });
    res.clearCookie(SESSION_COOKIE, { ...this.baseOptions, path: '/' });
  }

  readRefreshToken(req: Request): string | undefined {
    const value: unknown = req.cookies?.[REFRESH_COOKIE];
    return typeof value === 'string' && value ? value : undefined;
  }
}
