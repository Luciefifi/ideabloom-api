import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ACCESS_COOKIE } from '../auth.constants';
import type { AuthenticatedRequest } from '../auth.types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { TokenService } from '../token.service';

/**
 * Runs before EVERY route (registered globally in AuthModule).
 * Routes are protected unless marked @Public(), so forgetting to protect a
 * new endpoint is impossible.
 *
 * Accepts the access token from either:
 * - `Authorization: Bearer <token>` (mobile app, API tools), or
 * - the httpOnly `ib_access` cookie (web app)
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractAccessToken(request);
    if (!token) {
      throw new UnauthorizedException('Please log in to continue.');
    }

    try {
      const payload = await this.tokens.verifyAccessToken(token);
      request.user = { id: payload.sub, sessionId: payload.sid };
      return true;
    } catch {
      throw new UnauthorizedException(
        'Your session has expired. Please log in again.',
      );
    }
  }
}

export function extractAccessToken(request: Request): string | null {
  const header = request.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim() || null;
  }
  const cookie: unknown = request.cookies?.[ACCESS_COOKIE];
  return typeof cookie === 'string' && cookie ? cookie : null;
}
