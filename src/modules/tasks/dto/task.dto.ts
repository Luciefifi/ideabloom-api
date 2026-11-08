import { OmitType, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination';
import { IsOptionalDate } from '../../../common/validation/is-optional-date';
import {
  TASK_DESCRIPTION_MAX,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_TITLE_MAX,
  TASK_VIEWS,
  type TaskPriority,
  type TaskStatus,
  type TaskView,
} from '../task.constants';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const trimToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

export class CreateTaskDto {
  /** @example "Buy seed trays" */
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Title is required' })
  @MaxLength(TASK_TITLE_MAX, {
    message: `Title must be at most ${TASK_TITLE_MAX} characters`,
  })
  title: string;

  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(TASK_DESCRIPTION_MAX)
  description?: string | null;

  @IsOptional()
  @IsIn(TASK_STATUSES, {
    message: `Status must be one of: ${TASK_STATUSES.join(', ')}`,
  })
  status?: TaskStatus;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsIn(TASK_PRIORITIES, {
    message: `Priority must be one of: ${TASK_PRIORITIES.join(', ')}`,
  })
  priority?: TaskPriority | null;

  @IsOptionalDate()
  startDate?: string | null;

  /** Must not be before startDate. @example "2026-11-20" */
  @IsOptionalDate()
  dueDate?: string | null;

  /** One of YOUR projects, or null for a standalone task. Subtasks use their parent's project. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID('4', { message: 'projectId must be a valid id' })
  projectId?: string | null;

  /** Makes this a subtask of one of your top-level tasks. */
  @IsOptional()
  @IsUUID('4', { message: 'parentTaskId must be a valid id' })
  parentTaskId?: string;
}

/** Send only what changes. A task can't become a subtask (or stop being one) afterwards. */
export class UpdateTaskDto extends PartialType(
  OmitType(CreateTaskDto, ['parentTaskId'] as const),
) {}

export const TASK_SORTS = [
  'dueDate',
  'priority',
  'createdAt',
  'updatedAt',
  'completedAt',
  'title',
] as const;
export type TaskSort = (typeof TASK_SORTS)[number];

export class ListTasksQueryDto extends PaginationQueryDto {
  /** pending (default) · overdue · completed · all */
  @IsOptional()
  @IsIn(TASK_VIEWS)
  view: TaskView = 'pending';

  /** A project id, or "none" for standalone tasks. */
  @IsOptional()
  @ValidateIf((_, value) => value !== 'none')
  @IsUUID('4')
  projectId?: string;

  @IsOptional()
  @IsIn([...TASK_PRIORITIES, 'none'])
  priority?: TaskPriority | 'none';

  /** Words in the title. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  search?: string;

  /** Default: "completedAt" in the completed view, otherwise "dueDate" (soonest first, no date last). */
  @IsOptional()
  @IsIn(TASK_SORTS)
  sort?: TaskSort;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}

// ----- Responses -----------------------------------------------------------

export class SubtaskDto {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority | null;
  dueDate: string | null;
  completedAt: Date | null;
  isOverdue: boolean;
  position: number;
}

export class TaskSummaryDto {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority | null;
  startDate: string | null;
  dueDate: string | null;
  completedAt: Date | null;
  /** Due date passed (in your time zone) and not done. */
  isOverdue: boolean;
  project: { id: string; title: string } | null;
  parentTaskId: string | null;
  subtasks: { completed: number; total: number };
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

export class TaskResponseDto extends TaskSummaryDto {
  description: string | null;
  parent: { id: string; title: string } | null;
  subtaskList: SubtaskDto[];
}

export class TaskListResponseDto {
  data: TaskSummaryDto[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}
