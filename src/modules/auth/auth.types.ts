import type { Request } from 'express';

/** Who is making the request, attached by JwtAuthGuard. */
export interface AuthUser {
  id: string;
}

export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

/** Contents of a signed access token. `sub` (subject) is the user's id. */
export interface AccessTokenPayload {
  sub: string;
}

export interface IssuedTokens {
  accessToken: string;
  /** Seconds until the access token expires. */
  accessTokenExpiresIn: number;
  refreshToken: string;
}

/** Information about the device making a login/refresh request. */
export interface ClientContext {
  userAgent: string | null;
}
