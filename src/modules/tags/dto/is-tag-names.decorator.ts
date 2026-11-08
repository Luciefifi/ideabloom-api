import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { normalizeTagName, TAG_MAX_LENGTH, TAG_NAME_PATTERN } from './tag.dto';

/**
 * An optional list of tag NAMES (new ones are created automatically).
 * Shared by ideas, notes and resources so the rules are identical everywhere.
 */
export function IsTagNames(max: number, item = 'An item'): PropertyDecorator {
  return applyDecorators(
    IsOptional(),
    IsArray(),
    ArrayMaxSize(max, { message: `${item} can have at most ${max} tags` }),
    Transform(({ value }: { value: unknown }) =>
      Array.isArray(value) ? value.map(normalizeTagName) : value,
    ),
    IsString({ each: true }),
    IsNotEmpty({ each: true, message: 'Tag names cannot be empty' }),
    MaxLength(TAG_MAX_LENGTH, {
      each: true,
      message: `Tag names must be at most ${TAG_MAX_LENGTH} characters`,
    }),
    Matches(TAG_NAME_PATTERN, {
      each: true,
      message: 'Tag names can use letters, numbers, spaces and - _ . # +',
    }),
  );
}
