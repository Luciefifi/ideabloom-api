import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ActivityService } from '../activity/activity.service';
import type { ProjectResponseDto } from './dto/project.dto';
import {
  CreateMilestoneDto,
  ReorderMilestonesDto,
  UpdateMilestoneDto,
} from './dto/milestone.dto';
import { Milestone } from './entities/milestone.entity';
import { Project } from './entities/project.entity';
import { PROJECT_MAX_MILESTONES } from './project.constants';
import { ProjectsService } from './projects.service';

/**
 * Milestones always belong to one of the user's projects. Every change
 * returns the whole updated project, so the app gets the new progress at once.
 */
@Injectable()
export class MilestonesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly projects: ProjectsService,
    private readonly activity: ActivityService,
  ) {}

  async create(
    userId: string,
    projectId: string,
    dto: CreateMilestoneDto,
  ): Promise<ProjectResponseDto> {
    await this.dataSource.transaction(async (manager) => {
      const project = await this.projects.findOwned(userId, projectId, manager);
      const count = await manager.countBy(Milestone, { projectId });
      if (count >= PROJECT_MAX_MILESTONES) {
        throw new BadRequestException(
          `A project can have at most ${PROJECT_MAX_MILESTONES} milestones.`,
        );
      }
      const last = await manager.findOne(Milestone, {
        where: { projectId },
        order: { position: 'DESC' },
      });

      const milestone = await manager.save(
        manager.create(Milestone, {
          projectId,
          userId,
          title: dto.title,
          description: dto.description ?? null,
          dueDate: dto.dueDate ?? null,
          position: (last?.position ?? -1) + 1, // new milestones go last
        }),
      );
      await this.log(manager, userId, project, 'milestone_added', milestone);
    });
    return this.projects.findOne(userId, projectId);
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateMilestoneDto,
  ): Promise<ProjectResponseDto> {
    const projectId = await this.dataSource.transaction(async (manager) => {
      const milestone = await this.findOwned(manager, userId, id);
      const project = await this.projects.findOwned(
        userId,
        milestone.projectId,
        manager,
      );

      if (dto.title !== undefined) milestone.title = dto.title;
      if (dto.description !== undefined)
        milestone.description = dto.description;
      if (dto.dueDate !== undefined) milestone.dueDate = dto.dueDate;

      const wasDone = milestone.completedAt !== null;
      if (dto.completed !== undefined && dto.completed !== wasDone) {
        milestone.completedAt = dto.completed ? new Date() : null;
      }
      await manager.save(milestone);

      if (dto.completed !== undefined && dto.completed !== wasDone) {
        await this.log(
          manager,
          userId,
          project,
          dto.completed ? 'milestone_completed' : 'milestone_reopened',
          milestone,
        );
      }
      return milestone.projectId;
    });
    return this.projects.findOne(userId, projectId);
  }

  async remove(userId: string, id: string): Promise<ProjectResponseDto> {
    const projectId = await this.dataSource.transaction(async (manager) => {
      const milestone = await this.findOwned(manager, userId, id);
      const project = await this.projects.findOwned(
        userId,
        milestone.projectId,
        manager,
      );
      await manager.remove(milestone);
      await this.log(manager, userId, project, 'milestone_deleted', milestone);
      return project.id;
    });
    return this.projects.findOne(userId, projectId);
  }

  /** Saves a new order. The list must contain every milestone of the project exactly once. */
  async reorder(
    userId: string,
    projectId: string,
    dto: ReorderMilestonesDto,
  ): Promise<ProjectResponseDto> {
    await this.dataSource.transaction(async (manager) => {
      await this.projects.findOwned(userId, projectId, manager);
      const current = await manager.find(Milestone, {
        where: { projectId, userId },
        select: { id: true },
      });
      const currentIds = new Set(current.map((m) => m.id));
      const sameSet =
        dto.milestoneIds.length === currentIds.size &&
        dto.milestoneIds.every((id) => currentIds.has(id));
      if (!sameSet) {
        throw new BadRequestException(
          "The new order must list each of this project's milestones exactly once.",
        );
      }

      for (const [position, id] of dto.milestoneIds.entries()) {
        await manager.update(Milestone, { id }, { position });
      }
    });
    return this.projects.findOne(userId, projectId);
  }

  private async findOwned(
    manager: EntityManager,
    userId: string,
    id: string,
  ): Promise<Milestone> {
    const milestone = await manager.findOneBy(Milestone, { id, userId });
    if (!milestone) throw new NotFoundException('Milestone not found');
    return milestone;
  }

  private log(
    manager: EntityManager,
    userId: string,
    project: Project,
    action:
      | 'milestone_added'
      | 'milestone_completed'
      | 'milestone_reopened'
      | 'milestone_deleted',
    milestone: Milestone,
  ): Promise<void> {
    return this.activity.log(
      userId,
      {
        entityType: 'project',
        entityId: project.id,
        action,
        summary: project.title,
        metadata: { milestone: milestone.title },
      },
      manager,
    );
  }
}
