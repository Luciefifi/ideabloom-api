import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { Tag } from '../entities/tag.entity';

export const TAG_MAX_LENGTH = 30;

/** Letters (any language), numbers, spaces and - _ . # + (no commas: the web app uses them as separators). */
export const TAG_NAME_PATTERN = /^[\p{L}\p{N} _.#+-]+$/u;

/** Trims and collapses inner spaces: "  web   design " becomes "web design". */
export function normalizeTagName(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;
}

export class CreateTagDto {
  /** @example "design" */
  @Transform(({ value }: { value: unknown }) => normalizeTagName(value))
  @IsString()
  @IsNotEmpty({ message: 'Tag name is required' })
  @MaxLength(TAG_MAX_LENGTH, {
    message: `Tag name must be at most ${TAG_MAX_LENGTH} characters`,
  })
  @Matches(TAG_NAME_PATTERN, {
    message: 'Tag names can use letters, numbers, spaces and - _ . # +',
  })
  name: string;
}

export class UpdateTagDto extends CreateTagDto {}

export class TagResponseDto {
  id: string;
  /** @example "design" */
  name: string;
  /** Only in lists: how many ideas use this tag. */
  ideaCount?: number;
}

export function toTagResponse(tag: Tag): TagResponseDto {
  return { id: tag.id, name: tag.name };
}
