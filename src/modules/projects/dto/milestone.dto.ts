import { PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  MILESTONE_DESCRIPTION_MAX,
  MILESTONE_TITLE_MAX,
  PROJECT_MAX_MILESTONES,
} from '../project.constants';
import { IsOptionalDate } from '../../../common/validation/is-optional-date';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const trimToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

export class CreateMilestoneDto {
  /** @example "Beta with 20 gardeners" */
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Title is required' })
  @MaxLength(MILESTONE_TITLE_MAX, {
    message: `Title must be at most ${MILESTONE_TITLE_MAX} characters`,
  })
  title: string;

  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(MILESTONE_DESCRIPTION_MAX)
  description?: string | null;

  /** @example "2026-12-01" */
  @IsOptionalDate()
  dueDate?: string | null;
}

export class UpdateMilestoneDto extends PartialType(CreateMilestoneDto) {
  /** true = done, false = reopen. */
  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}

/** The project's milestone ids in the new order (all of them, each once). */
export class ReorderMilestonesDto {
  @IsArray()
  @ArrayMaxSize(PROJECT_MAX_MILESTONES)
  @ArrayUnique({ message: 'Each milestone may appear only once' })
  @IsUUID('4', { each: true })
  milestoneIds: string[];
}

export class ProjectActivityQueryDto {
  /** @example 30 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 30;
}
