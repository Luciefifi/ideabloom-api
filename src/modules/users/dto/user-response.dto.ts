import { User } from '../entities/user.entity';
import { toPreferences, type StartPage, type Theme } from '../preferences';

export class PreferencesResponseDto {
  /** @example "system" */
  theme: Theme;
  /** @example "dashboard" */
  startPage: StartPage;
}

/**
 * What the API is allowed to reveal about a user. Building the response
 * explicitly (instead of returning the entity) guarantees that fields like
 * passwordHash can never leak, even if someone adds them to a query later.
 */
export class UserResponseDto {
  /** @example "3f1c2a9e-8b7d-4c6e-9a1b-2d3e4f5a6b7c" */
  id: string;
  /** @example "lucie@example.com" */
  email: string;
  /** @example "Lucie" */
  displayName: string;
  bio: string | null;
  /** @example "Africa/Kigali" */
  timezone: string;
  preferences: PreferencesResponseDto;
  createdAt: Date;
}

export function toUserResponse(user: User): UserResponseDto {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    bio: user.bio,
    timezone: user.timezone,
    preferences: toPreferences(user.preferences),
    createdAt: user.createdAt,
  };
}
