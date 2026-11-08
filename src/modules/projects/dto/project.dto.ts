import { PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination';
import {
  PROJECT_PRIORITIES,
  PROJECT_STATUSES,
  PROJECT_TEXT_MAX,
  PROJECT_TITLE_MAX,
  type ProjectPriority,
  type ProjectStatus,
} from '../project.constants';
import type { Progress } from '../progress';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const trimToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

/** A calendar date "YYYY-MM-DD", or null to clear it. */
function IsOptionalDate(): PropertyDecorator {
  return (target, key) => {
    IsOptional()(target, key);
    ValidateIf((_, value) => value !== null)(target, key);
    Matches(/^\d{4}-\d{2}-\d{2}$/, {
      message: `${String(key)} must be a date like 2026-12-31`,
    })(target, key);
    IsISO8601(
      { strict: true },
      { message: `${String(key)} must be a real calendar date` },
    )(target, key);
  };
}

export class CreateProjectDto {
  /** @example "Plant watering app" */
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Title is required' })
  @MaxLength(PROJECT_TITLE_MAX, {
    message: `Title must be at most ${PROJECT_TITLE_MAX} characters`,
  })
  title: string;

  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(PROJECT_TEXT_MAX)
  description?: string | null;

  /** What success looks like. @example "Launch a beta to 20 gardeners" */
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(PROJECT_TEXT_MAX)
  goals?: string | null;

  @IsOptional()
  @IsIn(PROJECT_STATUSES, {
    message: `Status must be one of: ${PROJECT_STATUSES.join(', ')}`,
  })
  status?: ProjectStatus;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsIn(PROJECT_PRIORITIES, {
    message: `Priority must be one of: ${PROJECT_PRIORITIES.join(', ')}`,
  })
  priority?: ProjectPriority | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID('4', { message: 'categoryId must be a valid id' })
  categoryId?: string | null;

  /** @example "2026-11-10" */
  @IsOptionalDate()
  startDate?: string | null;

  /** Must not be before startDate. @example "2026-12-31" */
  @IsOptionalDate()
  targetDate?: string | null;
}

export class UpdateProjectDto extends PartialType(CreateProjectDto) {}

/** Optional details when turning an idea into a project (the rest is copied from the idea). */
export class ConvertIdeaDto {
  /** Defaults to the idea's title. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Title is required' })
  @MaxLength(PROJECT_TITLE_MAX)
  title?: string;

  /** Defaults to "planning". */
  @IsOptional()
  @IsIn(PROJECT_STATUSES)
  status?: ProjectStatus;

  @IsOptionalDate()
  startDate?: string | null;

  @IsOptionalDate()
  targetDate?: string | null;
}

export class LinkIdeaDto {
  @IsUUID('4', { message: 'ideaId must be a valid id' })
  ideaId: string;
}

export const PROJECT_SORTS = [
  'updatedAt',
  'createdAt',
  'title',
  'targetDate',
  'progress',
] as const;
export type ProjectSort = (typeof PROJECT_SORTS)[number];

export class ListProjectsQueryDto extends PaginationQueryDto {
  /** Words in the title. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  search?: string;

  /** A specific status (overrides `scope`). */
  @IsOptional()
  @IsIn(PROJECT_STATUSES)
  status?: ProjectStatus;

  /** "active" (default) hides completed and cancelled projects; "all" shows everything. */
  @IsOptional()
  @IsIn(['active', 'all'])
  scope: 'active' | 'all' = 'active';

  @IsOptional()
  @IsIn([...PROJECT_PRIORITIES, 'none'])
  priority?: ProjectPriority | 'none';

  @IsOptional()
  @ValidateIf((_, value) => value !== 'none')
  @IsUUID('4')
  categoryId?: string;

  /** Default "updatedAt". "targetDate" puts projects without a date last. */
  @IsOptional()
  @IsIn(PROJECT_SORTS)
  sort: ProjectSort = 'updatedAt';

  /** Default "asc" for title and targetDate, otherwise "desc". */
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}

// ----- Responses -----------------------------------------------------------

export class ProjectCategoryDto {
  id: string;
  name: string;
  color: string;
}

export class ProgressDto implements Progress {
  /** @example 60 */
  percent: number;
  /** @example "milestones" */
  basis: 'tasks' | 'milestones' | 'none';
  completed: number;
  total: number;
}

export class MilestoneDto {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  completedAt: Date | null;
  /** Due date passed (in your time zone) and not completed. */
  isOverdue: boolean;
  position: number;
}

export class RelatedIdeaDto {
  id: string;
  title: string;
  status: string;
  isArchived: boolean;
}

export class ProjectSummaryDto {
  id: string;
  title: string;
  status: ProjectStatus;
  priority: ProjectPriority | null;
  category: ProjectCategoryDto | null;
  startDate: string | null;
  targetDate: string | null;
  completedAt: Date | null;
  /** Target date passed (in your time zone) and the project isn't completed or cancelled. */
  isOverdue: boolean;
  progress: ProgressDto;
  milestones: { completed: number; total: number };
  createdAt: Date;
  updatedAt: Date;
}

export class ProjectResponseDto extends ProjectSummaryDto {
  description: string | null;
  goals: string | null;
  /** The idea this project was converted from. */
  sourceIdea: { id: string; title: string } | null;
  relatedIdeas: RelatedIdeaDto[];
  milestoneList: MilestoneDto[];
}

export class ProjectListResponseDto {
  data: ProjectSummaryDto[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}
