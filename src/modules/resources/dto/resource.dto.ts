import { PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  CategoryRefDto,
  TagRefDto,
  TitleRefDto,
} from '../../../common/dto/refs.dto';
import { PaginationQueryDto } from '../../../common/pagination/pagination';
import { AttachmentFieldsDto } from '../../attachments/attachment.dto';
import { IsTagNames } from '../../tags/dto/is-tag-names.decorator';
import {
  RESOURCE_DESCRIPTION_MAX,
  RESOURCE_NOTES_MAX,
  RESOURCE_TITLE_MAX,
  RESOURCE_TYPES,
  RESOURCE_URL_MAX,
  type ResourceType,
} from '../resource.constants';

export const RESOURCE_MAX_TAGS = 20;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const trimToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

export class CreateResourceDto extends AttachmentFieldsDto {
  /** @example "Designing calm interfaces" */
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Title is required' })
  @MaxLength(RESOURCE_TITLE_MAX, {
    message: `Title must be at most ${RESOURCE_TITLE_MAX} characters`,
  })
  title: string;

  /** Must start with http:// or https://. @example "https://example.com/article" */
  @Transform(trim)
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    {
      message:
        'The link must be a full web address starting with http:// or https://',
    },
  )
  @MaxLength(RESOURCE_URL_MAX)
  url: string;

  @IsOptional()
  @IsIn(RESOURCE_TYPES, {
    message: `Type must be one of: ${RESOURCE_TYPES.join(', ')}`,
  })
  type?: ResourceType;

  /** What it is about. Send "" or null to clear. */
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(RESOURCE_DESCRIPTION_MAX, {
    message: `Description must be at most ${RESOURCE_DESCRIPTION_MAX} characters`,
  })
  description?: string | null;

  /** Your personal notes about it. */
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(RESOURCE_NOTES_MAX, {
    message: `Notes must be at most ${RESOURCE_NOTES_MAX} characters`,
  })
  notes?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID('4', { message: 'categoryId must be a valid id' })
  categoryId?: string | null;

  /** Tag NAMES; new ones are created. Replaces the resource's tags when sent. */
  @IsTagNames(RESOURCE_MAX_TAGS, 'A resource')
  tags?: string[];
}

export class UpdateResourceDto extends PartialType(CreateResourceDto) {}

export const RESOURCE_SORTS = [
  'updatedAt',
  'createdAt',
  'title',
  'relevance',
] as const;
export type ResourceSort = (typeof RESOURCE_SORTS)[number];

export class ListResourcesQueryDto extends PaginationQueryDto {
  /** Words in the title, description or your notes. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsIn(RESOURCE_TYPES)
  type?: ResourceType;

  /** A category id, or "none". */
  @IsOptional()
  @ValidateIf((_, value) => value !== 'none')
  @IsUUID('4')
  categoryId?: string;

  @IsOptional()
  @IsUUID('4')
  tagId?: string;

  @IsOptional()
  @IsUUID('4')
  ideaId?: string;

  @IsOptional()
  @IsUUID('4')
  projectId?: string;

  /** Default: "relevance" when searching, else "updatedAt". */
  @IsOptional()
  @IsIn(RESOURCE_SORTS)
  sort?: ResourceSort;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}

// ----- Responses -----------------------------------------------------------

export class ResourceResponseDto {
  id: string;
  title: string;
  url: string;
  /** The website, e.g. "youtube.com" (from the url, without "www."). */
  domain: string;
  type: ResourceType;
  description: string | null;
  notes: string | null;
  category: CategoryRefDto | null;
  tags: TagRefDto[];
  idea: TitleRefDto | null;
  project: TitleRefDto | null;
  createdAt: Date;
  updatedAt: Date;
}

export class ResourceListResponseDto {
  data: ResourceResponseDto[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}
