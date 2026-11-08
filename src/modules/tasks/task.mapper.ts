import type { Counts } from '../projects/progress';
import type {
  SubtaskDto,
  TaskResponseDto,
  TaskSummaryDto,
} from './dto/task.dto';
import type { Task } from './entities/task.entity';

/** Due date passed (in the user's time zone) and not done. */
export function isTaskOverdue(
  task: Pick<Task, 'status' | 'dueDate'>,
  today: string,
): boolean {
  return (
    task.status !== 'done' && task.dueDate !== null && task.dueDate < today
  );
}

export function toSubtaskDto(task: Task, today: string): SubtaskDto {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate,
    completedAt: task.completedAt,
    isOverdue: isTaskOverdue(task, today),
    position: task.position,
  };
}

export function toTaskSummary(
  task: Task,
  subtasks: Counts,
  today: string,
): TaskSummaryDto {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    startDate: task.startDate,
    dueDate: task.dueDate,
    completedAt: task.completedAt,
    isOverdue: isTaskOverdue(task, today),
    project: task.project
      ? { id: task.project.id, title: task.project.title }
      : null,
    parentTaskId: task.parentTaskId,
    subtasks,
    position: task.position,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

/** Full task: needs `project`, `parent` and `subtasks` loaded. */
export function toTaskResponse(task: Task, today: string): TaskResponseDto {
  const subtasks = [...(task.subtasks ?? [])].sort(
    (a, b) => a.position - b.position,
  );
  return {
    ...toTaskSummary(
      task,
      {
        completed: subtasks.filter((s) => s.status === 'done').length,
        total: subtasks.length,
      },
      today,
    ),
    description: task.description,
    parent: task.parent
      ? { id: task.parent.id, title: task.parent.title }
      : null,
    subtaskList: subtasks.map((s) => toSubtaskDto(s, today)),
  };
}
