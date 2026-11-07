/** Short-lived access token (JWT), sent on every request by the browser. */
export const ACCESS_COOKIE = 'ib_access';

/** Long-lived refresh token, only sent to /api/v1/auth/* (see REFRESH_COOKIE_PATH). */
export const REFRESH_COOKIE = 'ib_refresh';

/**
 * Holds no secret, just "1". It lets the web app's routing know a session
 * probably exists (the refresh cookie isn't sent to page URLs). Real
 * protection is always the API checking the access token.
 */
export const SESSION_COOKIE = 'ib_session';

export const REFRESH_COOKIE_PATH = '/api/v1/auth';

/** Mobile apps send `X-Client: mobile` to receive tokens in the response body instead of cookies. */
export const CLIENT_HEADER = 'x-client';
export const MOBILE_CLIENT = 'mobile';

/**
 * Two browser tabs can refresh at the same moment; the slower one presents a
 * token the faster one just rotated. Within this window that's treated as a
 * harmless race (plain 401), not as theft (which would revoke the whole session).
 */
export const REFRESH_REUSE_GRACE_MS = 15_000;

export const JWT_ISSUER = 'ideabloom-api';
export const JWT_AUDIENCE = 'ideabloom';
