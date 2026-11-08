import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsTimeZone,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  START_PAGES,
  THEMES,
  type StartPage,
  type Theme,
} from '../preferences';

/** Send only the preferences that change; the others are kept. */
export class PreferencesDto {
  @IsOptional()
  @IsIn(THEMES, { message: `Theme must be one of: ${THEMES.join(', ')}` })
  theme?: Theme;

  /** The page that opens after logging in. */
  @IsOptional()
  @IsIn(START_PAGES, {
    message: `Start page must be one of: ${START_PAGES.join(', ')}`,
  })
  startPage?: StartPage;
}

/**
 * Every field is optional: send only what changes (PATCH).
 * Email and password are deliberately NOT here: they have their own, safer flows.
 */
export class UpdateProfileDto {
  /** @example "Lucie" */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'Name is required' })
  @MaxLength(80)
  displayName?: string;

  /** Send an empty string or null to clear it. @example "Building things one idea at a time." */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || null : value,
  )
  @IsString()
  @MaxLength(500, { message: 'Bio must be at most 500 characters' })
  bio?: string | null;

  /** IANA time zone, used for due dates and "overdue". @example "Africa/Kigali" */
  @IsOptional()
  @IsTimeZone({ message: 'Choose a valid time zone' })
  timezone?: string;

  /** @example { "theme": "dark" } */
  @IsOptional()
  @ValidateNested()
  @Type(() => PreferencesDto)
  preferences?: PreferencesDto;
}
