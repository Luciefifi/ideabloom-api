import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { isCheckViolation } from '../../common/database/postgres-errors';
import { paginate, Paginated } from '../../common/pagination/pagination';
import { ActivityService } from '../activity/activity.service';
import { CategoriesService } from '../categories/categories.service';
import { Idea } from '../ideas/entities/idea.entity';
import { UsersService } from '../users/users.service';
import {
  ConvertIdeaDto,
  CreateProjectDto,
  ListProjectsQueryDto,
  ProjectResponseDto,
  ProjectSummaryDto,
  UpdateProjectDto,
} from './dto/project.dto';
import { Milestone } from './entities/milestone.entity';
import { Project } from './entities/project.entity';
import { CLOSED_PROJECT_STATUSES } from './project.constants';
import { toProjectResponse, toProjectSummary } from './project.mapper';
import type { Counts } from './progress';
import { todayIn } from './progress';

/** SQL for counting a project's milestones (used for listing and sorting by progress). */
const MILESTONES_TOTAL_SQL =
  '(SELECT COUNT(*) FROM milestones m WHERE m.project_id = project.id)';
const MILESTONES_DONE_SQL =
  '(SELECT COUNT(*) FROM milestones m WHERE m.project_id = project.id AND m.completed_at IS NOT NULL)';
const PROGRESS_SQL = `CASE WHEN project.status = 'completed' THEN 100 WHEN ${MILESTONES_TOTAL_SQL} = 0 THEN 0 ELSE ${MILESTONES_DONE_SQL} * 100.0 / ${MILESTONES_TOTAL_SQL} END`;

function projectNotFound(): NotFoundException {
  return new NotFoundException('Project not found');
}

function datesInOrder(start: string | null, target: string | null): void {
  if (start && target && target < start) {
    throw new BadRequestException(
      "The target date can't be before the start date.",
    );
  }
}

/** "50%_off" → "50\%\_off" so LIKE treats them as normal characters. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(Milestone)
    private readonly milestones: Repository<Milestone>,
    private readonly dataSource: DataSource,
    private readonly categories: CategoriesService,
    private readonly activity: ActivityService,
    private readonly users: UsersService,
  ) {}

  /** Today's date in the user's own time zone (for "overdue"). */
  async today(userId: string): Promise<string> {
    const user = await this.users.findById(userId);
    return todayIn(user?.timezone ?? 'UTC');
  }

  // ---------------------------------------------------------------- reading

  async findAll(
    userId: string,
    query: ListProjectsQueryDto,
  ): Promise<Paginated<ProjectSummaryDto>> {
    const base = this.projects
      .createQueryBuilder('project')
      .where('project.userId = :userId', { userId });

    if (query.status) {
      base.andWhere('project.status = :status', query);
    } else if (query.scope === 'active') {
      base.andWhere('project.status NOT IN (:...closed)', {
        closed: CLOSED_PROJECT_STATUSES,
      });
    }
    if (query.priority === 'none') base.andWhere('project.priority IS NULL');
    else if (query.priority)
      base.andWhere('project.priority = :priority', query);
    if (query.categoryId === 'none')
      base.andWhere('project.categoryId IS NULL');
    else if (query.categoryId)
      base.andWhere('project.categoryId = :categoryId', query);
    if (query.search) {
      base.andWhere("project.title ILIKE :search ESCAPE '\\'", {
        search: `%${escapeLike(query.search)}%`,
      });
    }

    const total = await base.clone().getCount();

    const order = (
      query.order ??
      (['title', 'targetDate'].includes(query.sort) ? 'asc' : 'desc')
    ).toUpperCase() as 'ASC' | 'DESC';
    const page = base.clone().select('project.id', 'id');
    switch (query.sort) {
      case 'title':
        page
          .addSelect('LOWER(project.title)', 'sort_title')
          .orderBy('sort_title', order);
        break;
      case 'targetDate':
        page.orderBy('project.targetDate', order, 'NULLS LAST');
        break;
      case 'progress':
        page
          .addSelect(PROGRESS_SQL, 'sort_progress')
          .orderBy('sort_progress', order);
        break;
      case 'createdAt':
        page.orderBy('project.createdAt', order);
        break;
      default:
        page.orderBy('project.updatedAt', order);
    }
    page.addOrderBy('project.id', 'ASC');

    const ids = (
      await page
        .offset((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .getRawMany<{ id: string }>()
    ).map((row) => row.id);
    if (ids.length === 0) return paginate([], total, query);

    const [projects, counts, today] = await Promise.all([
      this.projects.find({
        where: { id: In(ids), userId },
        relations: { category: true },
      }),
      this.milestoneCounts(ids),
      this.today(userId),
    ]);
    const byId = new Map(projects.map((p) => [p.id, p]));
    const data = ids
      .map((id) => byId.get(id))
      .filter((p): p is Project => p !== undefined)
      .map((p) =>
        toProjectSummary(
          p,
          counts.get(p.id) ?? { completed: 0, total: 0 },
          today,
        ),
      );
    return paginate(data, total, query);
  }

  async findOne(userId: string, id: string): Promise<ProjectResponseDto> {
    const [project, today] = await Promise.all([
      this.projects.findOne({
        where: { id, userId },
        relations: {
          category: true,
          milestones: true,
          relatedIdeas: true,
          sourceIdea: true,
        },
      }),
      this.today(userId),
    ]);
    if (!project) throw projectNotFound();
    return toProjectResponse(project, today);
  }

  /** Throws 404 unless the project exists AND belongs to the user. */
  async findOwned(
    userId: string,
    id: string,
    manager?: EntityManager,
  ): Promise<Project> {
    const project = await (manager ?? this.dataSource.manager).findOneBy(
      Project,
      {
        id,
        userId,
      },
    );
    if (!project) throw projectNotFound();
    return project;
  }

  // ---------------------------------------------------------------- writing

  async create(
    userId: string,
    dto: CreateProjectDto,
  ): Promise<ProjectResponseDto> {
    datesInOrder(dto.startDate ?? null, dto.targetDate ?? null);
    const id = await this.write(async (manager) => {
      const categoryId = await this.ownedCategoryId(userId, dto.categoryId);
      const status = dto.status ?? 'not_started';
      const project = await manager.save(
        manager.create(Project, {
          userId,
          title: dto.title,
          description: dto.description ?? null,
          goals: dto.goals ?? null,
          status,
          priority: dto.priority ?? null,
          categoryId,
          startDate: dto.startDate ?? null,
          targetDate: dto.targetDate ?? null,
          completedAt: status === 'completed' ? new Date() : null,
        }),
      );
      await this.log(manager, userId, project, 'created');
      return project.id;
    });
    return this.findOne(userId, id);
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateProjectDto,
  ): Promise<ProjectResponseDto> {
    await this.write(async (manager) => {
      const project = await this.findOwned(userId, id, manager);
      const previousStatus = project.status;
      let edited = false;

      for (const key of [
        'title',
        'description',
        'goals',
        'priority',
        'startDate',
        'targetDate',
      ] as const) {
        if (dto[key] !== undefined && dto[key] !== project[key]) {
          (project[key] as unknown) = dto[key];
          edited = true;
        }
      }
      if (
        dto.categoryId !== undefined &&
        dto.categoryId !== project.categoryId
      ) {
        project.categoryId = await this.ownedCategoryId(userId, dto.categoryId);
        edited = true;
      }
      if (dto.status !== undefined && dto.status !== project.status) {
        project.status = dto.status;
        project.completedAt = dto.status === 'completed' ? new Date() : null;
      }
      datesInOrder(project.startDate, project.targetDate);

      if (!edited && project.status === previousStatus) return; // nothing changed

      await manager.save(project);
      if (project.status !== previousStatus) {
        await this.log(manager, userId, project, 'status_changed', {
          from: previousStatus,
          to: project.status,
        });
      }
      if (edited) await this.log(manager, userId, project, 'updated');
    });
    return this.findOne(userId, id);
  }

  /**
   * Deletes the project and its milestones. Related ideas stay (unlinked by
   * the database), and the idea it came from goes back to "planned".
   */
  async remove(userId: string, id: string): Promise<void> {
    await this.write(async (manager) => {
      const project = await this.findOwned(userId, id, manager);

      if (project.sourceIdeaId) {
        const idea = await manager.findOneBy(Idea, {
          id: project.sourceIdeaId,
          userId,
        });
        if (idea?.status === 'converted') {
          await manager.update(Idea, { id: idea.id }, { status: 'planned' });
          await this.activity.log(
            userId,
            {
              entityType: 'idea',
              entityId: idea.id,
              action: 'status_changed',
              summary: idea.title,
              metadata: { from: 'converted', to: 'planned' },
            },
            manager,
          );
        }
      }

      await manager.remove(project);
      await this.log(manager, userId, { ...project, id }, 'deleted');
    });
  }

  /** Turns an idea into a project, in one transaction. */
  async convertIdea(
    userId: string,
    ideaId: string,
    dto: ConvertIdeaDto,
  ): Promise<ProjectResponseDto> {
    datesInOrder(dto.startDate ?? null, dto.targetDate ?? null);
    const projectId = await this.write(async (manager) => {
      const idea = await manager.findOneBy(Idea, { id: ideaId, userId });
      if (!idea) throw new NotFoundException('Idea not found');
      if (idea.status === 'converted') {
        throw new ConflictException(
          'This idea has already been turned into a project.',
        );
      }

      const project = await manager.save(
        manager.create(Project, {
          userId,
          title: dto.title ?? idea.title,
          description: idea.description,
          priority: idea.priority,
          categoryId: idea.categoryId,
          status: dto.status ?? 'planning',
          startDate: dto.startDate ?? null,
          targetDate: dto.targetDate ?? null,
          completedAt: dto.status === 'completed' ? new Date() : null,
          sourceIdeaId: idea.id,
        }),
      );
      await manager.update(
        Idea,
        { id: idea.id },
        { status: 'converted', projectId: project.id },
      );

      await this.activity.log(
        userId,
        {
          entityType: 'idea',
          entityId: idea.id,
          action: 'converted',
          summary: idea.title,
          metadata: { project: project.title },
        },
        manager,
      );
      await this.log(manager, userId, project, 'created', {
        fromIdea: idea.title,
      });
      return project.id;
    });
    return this.findOne(userId, projectId);
  }

  /** Links one of the user's ideas to one of their projects ("related ideas"). */
  async linkIdea(
    userId: string,
    projectId: string,
    ideaId: string,
  ): Promise<ProjectResponseDto> {
    await this.write(async (manager) => {
      const project = await this.findOwned(userId, projectId, manager);
      const idea = await manager.findOneBy(Idea, { id: ideaId, userId });
      if (!idea) throw new NotFoundException('Idea not found');
      if (idea.projectId === project.id) return;

      await manager.update(Idea, { id: idea.id }, { projectId: project.id });
      await this.log(manager, userId, project, 'idea_linked', {
        idea: idea.title,
      });
    });
    return this.findOne(userId, projectId);
  }

  async unlinkIdea(
    userId: string,
    projectId: string,
    ideaId: string,
  ): Promise<ProjectResponseDto> {
    await this.write(async (manager) => {
      const project = await this.findOwned(userId, projectId, manager);
      const idea = await manager.findOneBy(Idea, {
        id: ideaId,
        userId,
        projectId: project.id,
      });
      if (!idea) throw new NotFoundException('Idea not found in this project');
      if (project.sourceIdeaId === idea.id) {
        throw new BadRequestException(
          "This project was created from this idea, so it can't be unlinked.",
        );
      }
      await manager.update(Idea, { id: idea.id }, { projectId: null });
      await this.log(manager, userId, project, 'idea_unlinked', {
        idea: idea.title,
      });
    });
    return this.findOne(userId, projectId);
  }

  // ---------------------------------------------------------------- helpers

  /** Runs in a transaction and turns a broken date rule into a clear 400. */
  private async write<T>(
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.dataSource.transaction(work);
    } catch (error) {
      if (isCheckViolation(error)) {
        throw new BadRequestException(
          "The target date can't be before the start date.",
        );
      }
      throw error;
    }
  }

  private log(
    manager: EntityManager,
    userId: string,
    project: Pick<Project, 'id' | 'title'>,
    action: Parameters<ActivityService['log']>[1]['action'],
    metadata?: Record<string, string>,
  ): Promise<void> {
    return this.activity.log(
      userId,
      {
        entityType: 'project',
        entityId: project.id,
        action,
        summary: project.title,
        metadata,
      },
      manager,
    );
  }

  private async ownedCategoryId(
    userId: string,
    categoryId: string | null | undefined,
  ): Promise<string | null> {
    if (!categoryId) return null;
    return (await this.categories.findOwned(userId, categoryId)).id;
  }

  private async milestoneCounts(
    projectIds: string[],
  ): Promise<Map<string, Counts>> {
    const rows = await this.milestones
      .createQueryBuilder('m')
      .select('m.projectId', 'projectId')
      .addSelect('COUNT(*)::int', 'total')
      .addSelect('COUNT(m.completedAt)::int', 'completed')
      .where('m.projectId IN (:...projectIds)', { projectIds })
      .groupBy('m.projectId')
      .getRawMany<{ projectId: string; total: number; completed: number }>();
    return new Map(
      rows.map((r) => [
        r.projectId,
        { total: Number(r.total), completed: Number(r.completed) },
      ]),
    );
  }
}
