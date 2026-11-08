import { OmitType, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination';
import {
  normalizeTagName,
  TAG_MAX_LENGTH,
  TAG_NAME_PATTERN,
} from '../../tags/dto/tag.dto';
import {
  EDITABLE_IDEA_STATUSES,
  IDEA_DESCRIPTION_MAX,
  IDEA_MAX_LINKS,
  IDEA_MAX_TAGS,
  IDEA_PRIORITIES,
  IDEA_STATUSES,
  IDEA_TITLE_MAX,
  type IdeaPriority,
  type IdeaStatus,
} from '../idea.constants';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
/** "" and whitespace become null, so a field can be cleared. */
const trimToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

export class IdeaLinkInputDto {
  /** Must start with http:// or https://. @example "https://example.com/article" */
  @Transform(trim)
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    {
      message:
        'Links must be full web addresses starting with http:// or https://',
    },
  )
  @MaxLength(2000)
  url: string;

  /** @example "Competitor analysis" */
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(200)
  label?: string | null;
}

export class CreateIdeaDto {
  /** The only required field: quick capture needs just this. @example "Plant watering reminder app" */
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Title is required' })
  @MaxLength(IDEA_TITLE_MAX, {
    message: `Title must be at most ${IDEA_TITLE_MAX} characters`,
  })
  title: string;

  /** Plain text, line breaks kept. Send "" or null to clear. */
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(IDEA_DESCRIPTION_MAX, {
    message: `Description must be at most ${IDEA_DESCRIPTION_MAX} characters`,
  })
  description?: string | null;

  /** "converted" can't be chosen here; it's set when an idea becomes a project. */
  @IsOptional()
  @IsIn(EDITABLE_IDEA_STATUSES, {
    message: `Status must be one of: ${EDITABLE_IDEA_STATUSES.join(', ')}`,
  })
  status?: IdeaStatus;

  /** null = no priority. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsIn(IDEA_PRIORITIES, {
    message: `Priority must be one of: ${IDEA_PRIORITIES.join(', ')}`,
  })
  priority?: IdeaPriority | null;

  /** One of YOUR categories, or null for none. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID('4', { message: 'categoryId must be a valid id' })
  categoryId?: string | null;

  /** Tag NAMES; new ones are created automatically. Replaces the idea's tags when sent. @example ["mobile", "health"] */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(IDEA_MAX_TAGS, {
    message: `An idea can have at most ${IDEA_MAX_TAGS} tags`,
  })
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value) ? value.map(normalizeTagName) : value,
  )
  @IsString({ each: true })
  @IsNotEmpty({ each: true, message: 'Tag names cannot be empty' })
  @MaxLength(TAG_MAX_LENGTH, {
    each: true,
    message: `Tag names must be at most ${TAG_MAX_LENGTH} characters`,
  })
  @Matches(TAG_NAME_PATTERN, {
    each: true,
    message: 'Tag names can use letters, numbers, spaces and - _ . # +',
  })
  tags?: string[];

  /** Replaces the idea's links when sent, in this order. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(IDEA_MAX_LINKS, {
    message: `An idea can have at most ${IDEA_MAX_LINKS} links`,
  })
  @ValidateNested({ each: true })
  @Type(() => IdeaLinkInputDto)
  links?: IdeaLinkInputDto[];

  @IsOptional()
  @IsBoolean()
  isFavorite?: boolean;
}

/** Send only what changes. Archive/restore have their own endpoints. */
export class UpdateIdeaDto extends PartialType(CreateIdeaDto) {}

export const IDEA_SORTS = [
  'updatedAt',
  'createdAt',
  'title',
  'priority',
  'relevance',
] as const;
export type IdeaSort = (typeof IDEA_SORTS)[number];

const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

export class ListIdeasQueryDto extends PaginationQueryDto {
  /** Words to find in the title or description (partial words match). @example "plant" */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsIn(IDEA_STATUSES)
  status?: IdeaStatus;

  /** A priority, or "none" for ideas without one. */
  @IsOptional()
  @IsIn([...IDEA_PRIORITIES, 'none'])
  priority?: IdeaPriority | 'none';

  /** A category id, or "none" for uncategorized ideas. */
  @IsOptional()
  @ValidateIf((_, value) => value !== 'none')
  @IsUUID('4')
  categoryId?: string;

  /** Only ideas with this tag. */
  @IsOptional()
  @IsUUID('4')
  tagId?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  favorite?: boolean;

  /** "false" (default): active ideas · "true": only archived · "all": both. */
  @IsOptional()
  @IsIn(['true', 'false', 'all'])
  archived: 'true' | 'false' | 'all' = 'false';

  /** Default: "relevance" when searching, otherwise "updatedAt". */
  @IsOptional()
  @IsIn(IDEA_SORTS)
  sort?: IdeaSort;

  /** Default: "asc" for title, otherwise "desc". */
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}

// ----- Responses -----------------------------------------------------------

export class IdeaCategoryDto {
  id: string;
  name: string;
  color: string;
}

export class IdeaTagDto {
  id: string;
  name: string;
}

export class IdeaLinkDto {
  id: string;
  url: string;
  label: string | null;
}

export class IdeaResponseDto {
  id: string;
  title: string;
  description: string | null;
  status: IdeaStatus;
  priority: IdeaPriority | null;
  isFavorite: boolean;
  archivedAt: Date | null;
  category: IdeaCategoryDto | null;
  tags: IdeaTagDto[];
  links: IdeaLinkDto[];
  createdAt: Date;
  updatedAt: Date;
}

/** In lists: no links, and the description shortened to a preview. */
export class IdeaSummaryDto extends OmitType(IdeaResponseDto, [
  'links',
  'description',
]) {
  /** First 200 characters of the description. */
  excerpt: string | null;
  linkCount: number;
}

export class IdeaListResponseDto {
  data: IdeaSummaryDto[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}
