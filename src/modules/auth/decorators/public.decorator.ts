import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as reachable without logging in (e.g. login, register, health).
 * Every other route requires a valid access token: secure by default.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
