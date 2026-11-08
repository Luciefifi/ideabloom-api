import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  In,
  IsNull,
  Not,
  Repository,
} from 'typeorm';
import { isCheckViolation } from '../../common/database/postgres-errors';
import { paginate, Paginated } from '../../common/pagination/pagination';
import { ActivityService } from '../activity/activity.service';
import type { ActivityAction } from '../activity/entities/activity.entity';
import type { Counts } from '../projects/progress';
import { ProjectsService } from '../projects/projects.service';
import {
  CreateTaskDto,
  ListTasksQueryDto,
  TaskResponseDto,
  TaskSummaryDto,
  UpdateTaskDto,
} from './dto/task.dto';
import { Task } from './entities/task.entity';
import { MAX_SUBTASKS, PENDING_TASK_STATUSES } from './task.constants';
import { toTaskResponse, toTaskSummary } from './task.mapper';

const PRIORITY_RANK_SQL = `CASE task.priority WHEN 'urgent' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END`;

function taskNotFound(): NotFoundException {
  return new NotFoundException('Task not found');
}

function datesInOrder(start: string | null, due: string | null): void {
  if (start && due && due < start) {
    throw new BadRequestException(
      "The due date can't be before the start date.",
    );
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task) private readonly tasks: Repository<Task>,
    private readonly dataSource: DataSource,
    private readonly projects: ProjectsService,
    private readonly activity: ActivityService,
  ) {}

  // ---------------------------------------------------------------- reading

  /** Top-level tasks (subtasks are shown inside their parent), in one of the four views. */
  async findAll(
    userId: string,
    query: ListTasksQueryDto,
  ): Promise<Paginated<TaskSummaryDto>> {
    const today = await this.projects.today(userId);
    const base = this.tasks
      .createQueryBuilder('task')
      .where('task.userId = :userId', { userId })
      .andWhere('task.parentTaskId IS NULL');

    switch (query.view) {
      case 'pending':
        base.andWhere('task.status IN (:...pending)', {
          pending: PENDING_TASK_STATUSES,
        });
        break;
      case 'completed':
        base.andWhere("task.status = 'done'");
        break;
      case 'overdue':
        base
          .andWhere("task.status <> 'done'")
          .andWhere('task.dueDate < :today', { today });
        break;
    }
    if (query.projectId === 'none') base.andWhere('task.projectId IS NULL');
    else if (query.projectId)
      base.andWhere('task.projectId = :projectId', query);
    if (query.priority === 'none') base.andWhere('task.priority IS NULL');
    else if (query.priority) base.andWhere('task.priority = :priority', query);
    if (query.search) {
      base.andWhere("task.title ILIKE :search ESCAPE '\\'", {
        search: `%${escapeLike(query.search)}%`,
      });
    }

    const total = await base.clone().getCount();

    const sort =
      query.sort ?? (query.view === 'completed' ? 'completedAt' : 'dueDate');
    const order = (
      query.order ?? (['dueDate', 'title'].includes(sort) ? 'asc' : 'desc')
    ).toUpperCase() as 'ASC' | 'DESC';
    const page = base.clone().select('task.id', 'id');
    switch (sort) {
      case 'dueDate':
        page
          .orderBy('task.dueDate', order, 'NULLS LAST')
          .addSelect(PRIORITY_RANK_SQL, 'sort_priority')
          .addOrderBy('sort_priority', 'DESC');
        break;
      case 'priority':
        page
          .addSelect(PRIORITY_RANK_SQL, 'sort_priority')
          .orderBy('sort_priority', order)
          .addOrderBy('task.dueDate', 'ASC', 'NULLS LAST');
        break;
      case 'title':
        page
          .addSelect('LOWER(task.title)', 'sort_title')
          .orderBy('sort_title', order);
        break;
      case 'completedAt':
        page.orderBy('task.completedAt', order, 'NULLS LAST');
        break;
      case 'createdAt':
        page.orderBy('task.createdAt', order);
        break;
      default:
        page.orderBy('task.updatedAt', order);
    }
    page.addOrderBy('task.id', 'ASC');

    const ids = (
      await page
        .offset((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .getRawMany<{ id: string }>()
    ).map((row) => row.id);
    if (ids.length === 0) return paginate([], total, query);

    const [tasks, subtaskCounts] = await Promise.all([
      this.tasks.find({
        where: { id: In(ids), userId },
        relations: { project: true },
      }),
      this.subtaskCounts(ids),
    ]);
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const data = ids
      .map((id) => byId.get(id))
      .filter((t): t is Task => t !== undefined)
      .map((t) =>
        toTaskSummary(
          t,
          subtaskCounts.get(t.id) ?? { completed: 0, total: 0 },
          today,
        ),
      );
    return paginate(data, total, query);
  }

  async findOne(userId: string, id: string): Promise<TaskResponseDto> {
    const [task, today] = await Promise.all([
      this.tasks.findOne({
        where: { id, userId },
        relations: { project: true, parent: true, subtasks: true },
      }),
      this.projects.today(userId),
    ]);
    if (!task) throw taskNotFound();
    return toTaskResponse(task, today);
  }

  // ---------------------------------------------------------------- writing

  async create(userId: string, dto: CreateTaskDto): Promise<TaskResponseDto> {
    datesInOrder(dto.startDate ?? null, dto.dueDate ?? null);
    const id = await this.write(async (manager) => {
      let projectId = dto.projectId ?? null;

      if (dto.parentTaskId) {
        const parent = await this.findOwned(manager, userId, dto.parentTaskId);
        if (parent.parentTaskId) {
          throw new BadRequestException(
            "Subtasks can't have their own subtasks.",
          );
        }
        if (dto.projectId !== undefined && dto.projectId !== parent.projectId) {
          throw new BadRequestException(
            "A subtask always belongs to its parent task's project.",
          );
        }
        const count = await manager.countBy(Task, { parentTaskId: parent.id });
        if (count >= MAX_SUBTASKS) {
          throw new BadRequestException(
            `A task can have at most ${MAX_SUBTASKS} subtasks.`,
          );
        }
        projectId = parent.projectId;
      } else if (projectId) {
        await this.projects.findOwned(userId, projectId, manager); // 404 if not yours
      }

      // New tasks go last among their siblings. IsNull() matters: in TypeORM
      // an undefined condition is IGNORED, it doesn't mean "is empty".
      const last = await manager.findOne(Task, {
        where: dto.parentTaskId
          ? { userId, parentTaskId: dto.parentTaskId }
          : {
              userId,
              parentTaskId: IsNull(),
              projectId: projectId ?? IsNull(),
            },
        order: { position: 'DESC' },
      });
      const status = dto.status ?? 'todo';
      const task = await manager.save(
        manager.create(Task, {
          userId,
          title: dto.title,
          description: dto.description ?? null,
          status,
          priority: dto.priority ?? null,
          startDate: dto.startDate ?? null,
          dueDate: dto.dueDate ?? null,
          completedAt: status === 'done' ? new Date() : null,
          projectId,
          parentTaskId: dto.parentTaskId ?? null,
          position: (last?.position ?? -1) + 1,
        }),
      );
      await this.log(manager, userId, task, 'created');
      return task.id;
    });
    return this.findOne(userId, id);
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateTaskDto,
  ): Promise<TaskResponseDto> {
    await this.write(async (manager) => {
      const task = await this.findOwned(manager, userId, id);
      const previousStatus = task.status;
      let edited = false;

      for (const key of [
        'title',
        'description',
        'priority',
        'startDate',
        'dueDate',
      ] as const) {
        if (dto[key] !== undefined && dto[key] !== task[key]) {
          (task[key] as unknown) = dto[key];
          edited = true;
        }
      }
      datesInOrder(task.startDate, task.dueDate);

      if (dto.projectId !== undefined && dto.projectId !== task.projectId) {
        if (task.parentTaskId) {
          throw new BadRequestException(
            'Move the parent task instead: its subtasks always follow it.',
          );
        }
        if (dto.projectId)
          await this.projects.findOwned(userId, dto.projectId, manager);
        task.projectId = dto.projectId;
        // Subtasks move with their parent.
        await manager.update(
          Task,
          { parentTaskId: task.id },
          { projectId: dto.projectId },
        );
        edited = true;
      }

      if (dto.status !== undefined && dto.status !== task.status) {
        task.status = dto.status;
        if (dto.status === 'done') {
          task.completedAt = new Date();
          // Completing a task completes its open subtasks too.
          await manager.update(
            Task,
            { parentTaskId: task.id, status: Not('done') },
            { status: 'done', completedAt: new Date() },
          );
        } else if (previousStatus === 'done') {
          task.completedAt = null; // reopening does NOT reopen subtasks
        }
      }

      if (!edited && task.status === previousStatus) return;
      await manager.save(task);

      if (task.status !== previousStatus) {
        if (task.status === 'done') {
          await this.log(manager, userId, task, 'completed');
          await this.logOnProject(manager, userId, task, 'task_completed');
        } else if (previousStatus === 'done') {
          await this.log(manager, userId, task, 'reopened');
          await this.logOnProject(manager, userId, task, 'task_reopened');
        } else {
          await this.log(manager, userId, task, 'status_changed', {
            from: previousStatus,
            to: task.status,
          });
        }
      }
      if (edited) await this.log(manager, userId, task, 'updated');
    });
    return this.findOne(userId, id);
  }

  /** Deletes the task and its subtasks. */
  async remove(userId: string, id: string): Promise<void> {
    await this.write(async (manager) => {
      const task = await this.findOwned(manager, userId, id);
      await manager.remove(task);
      await this.log(manager, userId, { ...task, id }, 'deleted');
    });
  }

  // ---------------------------------------------------------------- helpers

  private async findOwned(
    manager: EntityManager,
    userId: string,
    id: string,
  ): Promise<Task> {
    const task = await manager.findOneBy(Task, { id, userId });
    if (!task) throw taskNotFound();
    return task;
  }

  private async write<T>(
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.dataSource.transaction(work);
    } catch (error) {
      if (isCheckViolation(error)) {
        throw new BadRequestException(
          "The due date can't be before the start date.",
        );
      }
      throw error;
    }
  }

  private log(
    manager: EntityManager,
    userId: string,
    task: Pick<Task, 'id' | 'title'>,
    action: ActivityAction,
    metadata?: Record<string, string>,
  ): Promise<void> {
    return this.activity.log(
      userId,
      {
        entityType: 'task',
        entityId: task.id,
        action,
        summary: task.title,
        metadata,
      },
      manager,
    );
  }

  /** Also show completions on the project's own timeline. */
  private async logOnProject(
    manager: EntityManager,
    userId: string,
    task: Task,
    action: 'task_completed' | 'task_reopened',
  ): Promise<void> {
    if (!task.projectId) return;
    const project = await this.projects.findOwned(
      userId,
      task.projectId,
      manager,
    );
    await this.activity.log(
      userId,
      {
        entityType: 'project',
        entityId: project.id,
        action,
        summary: project.title,
        metadata: { task: task.title },
      },
      manager,
    );
  }

  private async subtaskCounts(
    parentIds: string[],
  ): Promise<Map<string, Counts>> {
    const rows = await this.tasks
      .createQueryBuilder('t')
      .select('t.parentTaskId', 'parentId')
      .addSelect('COUNT(*)::int', 'total')
      .addSelect("COUNT(*) FILTER (WHERE t.status = 'done')::int", 'completed')
      .where('t.parentTaskId IN (:...parentIds)', { parentIds })
      .groupBy('t.parentTaskId')
      .getRawMany<{ parentId: string; total: number; completed: number }>();
    return new Map(
      rows.map((r) => [
        r.parentId,
        { total: Number(r.total), completed: Number(r.completed) },
      ]),
    );
  }
}
