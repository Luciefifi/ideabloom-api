import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsTimeZone,
  MaxLength,
} from 'class-validator';

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
}
