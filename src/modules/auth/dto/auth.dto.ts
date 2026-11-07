import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserResponseDto } from '../../users/dto/user-response.dto';

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class RegisterDto {
  /** @example "lucie@example.com" */
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(254)
  email: string;

  /**
   * At least 12 characters. Long passphrases are encouraged; no symbol rules.
   * Never trimmed: spaces are allowed and count.
   * @example "correct horse battery staple"
   */
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, {
    message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
  })
  @MaxLength(PASSWORD_MAX_LENGTH, {
    message: `Password must be at most ${PASSWORD_MAX_LENGTH} characters`,
  })
  password: string;

  /** @example "Lucie" */
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Name is required' })
  @MaxLength(80)
  displayName: string;
}

export class LoginDto {
  /** @example "lucie@example.com" */
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(254)
  email: string;

  // No minimum here: login only checks the password, it doesn't set one.
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @MaxLength(PASSWORD_MAX_LENGTH)
  password: string;
}

/** Mobile apps send the refresh token in the body; browsers use the cookie. */
export class RefreshTokenDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  refreshToken?: string;
}

export class AuthResponseDto {
  user: UserResponseDto;
  /** Only for mobile clients (`X-Client: mobile`); browsers get cookies instead. */
  accessToken?: string;
  accessTokenExpiresIn?: number;
  refreshToken?: string;
}
