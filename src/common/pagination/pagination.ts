import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** ?page=1&pageSize=20 on list endpoints. */
export class PaginationQueryDto {
  /** @example 1 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  /** @example 20 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}

export class PageMetaDto {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** The shape of every paginated list: { data: [...], meta: { page, pageSize, total, totalPages } } */
export interface Paginated<T> {
  data: T[];
  meta: PageMetaDto;
}

export function paginate<T>(
  data: T[],
  total: number,
  { page, pageSize }: PaginationQueryDto,
): Paginated<T> {
  return {
    data,
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}
