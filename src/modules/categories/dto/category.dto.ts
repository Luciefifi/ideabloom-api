import { PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { CATEGORY_COLORS, type CategoryColor } from '../category-colors';
import { Category } from '../entities/category.entity';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateCategoryDto {
  /** @example "Business" */
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Name is required' })
  @MaxLength(50, { message: 'Name must be at most 50 characters' })
  name: string;

  /** One of the palette colours. @example "sky" */
  @IsOptional()
  @IsIn(CATEGORY_COLORS, {
    message: `Color must be one of: ${CATEGORY_COLORS.join(', ')}`,
  })
  color?: CategoryColor;
}

/** Same fields as create, all optional (send only what changes). */
export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}

export class CategoryResponseDto {
  id: string;
  name: string;
  color: CategoryColor;
  /** Only in lists: how many ideas are in this category. */
  ideaCount?: number;
  /** Only in lists. */
  noteCount?: number;
  /** Only in lists. */
  resourceCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

export function toCategoryResponse(category: Category): CategoryResponseDto {
  return {
    id: category.id,
    name: category.name,
    color: category.color,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  };
}
