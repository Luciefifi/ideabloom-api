import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest, AuthUser } from '../auth.types';

/**
 * Gives a controller method the logged-in user:
 *   getMe(@CurrentUser() user: AuthUser) { ... }
 *
 * The id comes from the verified access token, never from the request body,
 * so a client can't pretend to be someone else.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user,
);
