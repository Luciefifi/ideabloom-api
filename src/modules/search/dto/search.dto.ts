import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { TitleRefDto } from '../../../common/dto/refs.dto';
import { SEARCH_TYPES, type SearchType } from '../search.constants';

export class SearchQueryDto {
  /** Words to find (partial words match: "gard" finds "garden"). @example "garden" */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'Type something to search for' })
  @MaxLength(200)
  q: string;

  /** Comma-separated, e.g. "idea,note". Default: all five. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean)
      : value,
  )
  @IsIn(SEARCH_TYPES, {
    each: true,
    message: `types can include: ${SEARCH_TYPES.join(', ')}`,
  })
  types?: SearchType[];

  /** Results per type (1–20). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit: number = 5;

  /** Include archived ideas (default false). */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  includeArchived: boolean = false;
}

export class SearchResultDto {
  type: SearchType;
  id: string;
  /** With highlight markers (see HIGHLIGHT_START/END in search.constants.ts). */
  title: string;
  /** A short extract around the matching words, with markers; null when there's no text. */
  snippet: string | null;
  /** Idea, project or task status. */
  status?: string;
  /** Ideas: archived. */
  archived?: boolean;
  /** Notes: pinned. */
  pinned?: boolean;
  /** Tasks and notes: their project. */
  project?: TitleRefDto | null;
  /** Resources: the link and its kind. */
  url?: string;
  resourceType?: string;
  updatedAt: Date;
}

export class SearchGroupDto {
  type: SearchType;
  /** All matches of this type (the list shows the best `limit`). */
  total: number;
  items: SearchResultDto[];
}

export class SearchResponseDto {
  query: string;
  /** One group per requested type, in a fixed order (ideas, projects, tasks, notes, resources). */
  groups: SearchGroupDto[];
}
