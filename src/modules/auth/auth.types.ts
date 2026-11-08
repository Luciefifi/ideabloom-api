import type { Request } from 'express';

/** Who is making the request, attached by JwtAuthGuard. */
export interface AuthUser {
  id: string;
  /** The session (refresh-token family) this request comes from, if known. */
  sessionId?: string;
}

export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

/** Contents of a signed access token. `sub` (subject) is the user's id. */
export interface AccessTokenPayload {
  sub: string;
  /** Session id (refresh-token family), so "this device" can be recognised. */
  sid?: string;
}

export interface IssuedTokens {
  accessToken: string;
  /** Seconds until the access token expires. */
  accessTokenExpiresIn: number;
  refreshToken: string;
}

/** Information about the device making a login/refresh request. */
export interface ClientContext {
  /** e.g. "Chrome on Windows" (see deviceLabel). */
  deviceLabel: string;
}

/** One signed-in device (a refresh-token family that is still valid). */
export interface SessionInfo {
  id: string;
  device: string;
  signedInAt: Date;
  lastActiveAt: Date;
  current: boolean;
}
