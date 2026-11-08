import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import {
  toCategoryRef,
  toTagRefs,
  toTitleRef,
} from '../../common/dto/refs.dto';
import { paginate, Paginated } from '../../common/pagination/pagination';
import { applyLibraryFilters } from '../../common/search/library-filters';
import { ActivityService } from '../activity/activity.service';
import { projectTitle, resolveAttachment } from '../attachments/attachment';
import { CategoriesService } from '../categories/categories.service';
import { TagsService } from '../tags/tags.service';
import {
  CreateResourceDto,
  ListResourcesQueryDto,
  ResourceResponseDto,
  UpdateResourceDto,
} from './dto/resource.dto';
import { Resource } from './entities/resource.entity';

function resourceNotFound(): NotFoundException {
  return new NotFoundException('Resource not found');
}

/** "https://www.youtube.com/watch?v=1" → "youtube.com" */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function toResourceResponse(resource: Resource): ResourceResponseDto {
  return {
    id: resource.id,
    title: resource.title,
    url: resource.url,
    domain: domainOf(resource.url),
    type: resource.type,
    description: resource.description,
    notes: resource.notes,
    category: toCategoryRef(resource.category),
    tags: toTagRefs(resource.tags),
    idea: toTitleRef(resource.idea),
    project: toTitleRef(resource.project),
    createdAt: resource.createdAt,
    updatedAt: resource.updatedAt,
  };
}

const RELATIONS = {
  category: true,
  tags: true,
  idea: true,
  project: true,
} as const;

@Injectable()
export class ResourcesService {
  constructor(
    @InjectRepository(Resource)
    private readonly resources: Repository<Resource>,
    private readonly dataSource: DataSource,
    private readonly categories: CategoriesService,
    private readonly tags: TagsService,
    private readonly activity: ActivityService,
  ) {}

  async findAll(
    userId: string,
    query: ListResourcesQueryDto,
  ): Promise<Paginated<ResourceResponseDto>> {
    const base = this.resources
      .createQueryBuilder('resource')
      .where('resource.userId = :userId', { userId });
    const tsQuery = applyLibraryFilters(
      base,
      'resource',
      { table: 'resource_tags', column: 'resource_id' },
      query,
    );
    if (query.type) {
      base.andWhere('resource.type = :type', { type: query.type });
    }

    const total = await base.clone().getCount();

    const sort =
      query.sort === 'relevance' && !tsQuery
        ? 'updatedAt'
        : (query.sort ?? (tsQuery ? 'relevance' : 'updatedAt'));
    const order = (
      query.order ?? (sort === 'title' ? 'asc' : 'desc')
    ).toUpperCase() as 'ASC' | 'DESC';

    const page = base.clone().select('resource.id', 'id');
    if (sort === 'relevance') {
      page
        .addSelect(
          "ts_rank(resource.search_vector, to_tsquery('simple', :tsQuery))",
          'sort_rank',
        )
        .orderBy('sort_rank', 'DESC')
        .addOrderBy('resource.updatedAt', 'DESC');
    } else if (sort === 'title') {
      page
        .addSelect('LOWER(resource.title)', 'sort_title')
        .orderBy('sort_title', order);
    } else {
      page.orderBy(`resource.${sort}`, order);
    }
    page.addOrderBy('resource.id', 'ASC');

    const ids = (
      await page
        .offset((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .getRawMany<{ id: string }>()
    ).map((row) => row.id);
    if (ids.length === 0) return paginate([], total, query);

    const found = await this.resources.find({
      where: { id: In(ids), userId },
      relations: RELATIONS,
    });
    const byId = new Map(found.map((r) => [r.id, r]));
    const data = ids
      .map((id) => byId.get(id))
      .filter((r): r is Resource => r !== undefined)
      .map(toResourceResponse);
    return paginate(data, total, query);
  }

  async findOne(userId: string, id: string): Promise<ResourceResponseDto> {
    const resource = await this.resources.findOne({
      where: { id, userId },
      relations: RELATIONS,
    });
    if (!resource) throw resourceNotFound();
    return toResourceResponse(resource);
  }

  async create(
    userId: string,
    dto: CreateResourceDto,
  ): Promise<ResourceResponseDto> {
    const id = await this.dataSource.transaction(async (manager) => {
      const attachment = await resolveAttachment(
        manager,
        userId,
        { ideaId: null, projectId: null },
        dto,
      );
      const resource = await manager.save(
        manager.create(Resource, {
          userId,
          title: dto.title,
          url: dto.url,
          type: dto.type ?? 'website',
          description: dto.description ?? null,
          notes: dto.notes ?? null,
          categoryId: await this.ownedCategoryId(userId, dto.categoryId),
          tags: dto.tags
            ? await this.tags.findOrCreateByNames(userId, dto.tags, manager)
            : [],
          ...attachment,
        }),
      );
      await this.log(manager, userId, resource, 'created');
      if (resource.projectId) {
        await this.logAddedToProject(manager, userId, resource);
      }
      return resource.id;
    });
    return this.findOne(userId, id);
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateResourceDto,
  ): Promise<ResourceResponseDto> {
    await this.dataSource.transaction(async (manager) => {
      const resource = await manager.findOne(Resource, {
        where: { id, userId },
        relations: { tags: true },
      });
      if (!resource) throw resourceNotFound();

      let changed = false;
      for (const key of [
        'title',
        'url',
        'type',
        'description',
        'notes',
      ] as const) {
        if (dto[key] !== undefined && dto[key] !== resource[key]) {
          (resource[key] as unknown) = dto[key];
          changed = true;
        }
      }
      if (
        dto.categoryId !== undefined &&
        dto.categoryId !== resource.categoryId
      ) {
        resource.categoryId = await this.ownedCategoryId(
          userId,
          dto.categoryId,
        );
        changed = true;
      }
      if (dto.tags !== undefined) {
        const tags = await this.tags.findOrCreateByNames(
          userId,
          dto.tags,
          manager,
        );
        const current = new Set((resource.tags ?? []).map((t) => t.id));
        if (
          tags.length !== current.size ||
          !tags.every((t) => current.has(t.id))
        ) {
          resource.tags = tags;
          changed = true;
        }
      }
      const previousProject = resource.projectId;
      const attachment = await resolveAttachment(
        manager,
        userId,
        resource,
        dto,
      );
      if (
        attachment.ideaId !== resource.ideaId ||
        attachment.projectId !== resource.projectId
      ) {
        Object.assign(resource, attachment);
        changed = true;
      }

      if (!changed) return;
      await manager.save(resource);
      await manager.update(
        Resource,
        { id: resource.id },
        { updatedAt: () => 'now()' },
      );
      await this.log(manager, userId, resource, 'updated');
      if (resource.projectId && resource.projectId !== previousProject) {
        await this.logAddedToProject(manager, userId, resource);
      }
    });
    return this.findOne(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const resource = await manager.findOneBy(Resource, { id, userId });
      if (!resource) throw resourceNotFound();
      await manager.remove(resource);
      await this.log(manager, userId, { id, title: resource.title }, 'deleted');
    });
  }

  private async ownedCategoryId(
    userId: string,
    categoryId: string | null | undefined,
  ): Promise<string | null> {
    if (!categoryId) return null;
    return (await this.categories.findOwned(userId, categoryId)).id;
  }

  private log(
    manager: EntityManager,
    userId: string,
    resource: Pick<Resource, 'id' | 'title'>,
    action: 'created' | 'updated' | 'deleted',
  ): Promise<void> {
    return this.activity.log(
      userId,
      {
        entityType: 'resource',
        entityId: resource.id,
        action,
        summary: resource.title,
      },
      manager,
    );
  }

  private async logAddedToProject(
    manager: EntityManager,
    userId: string,
    resource: Resource,
  ): Promise<void> {
    if (!resource.projectId) return;
    await this.activity.log(
      userId,
      {
        entityType: 'project',
        entityId: resource.projectId,
        action: 'resource_added',
        summary: await projectTitle(manager, resource.projectId),
        metadata: { resource: resource.title },
      },
      manager,
    );
  }
}
