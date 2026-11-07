import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { paginate, Paginated } from '../../common/pagination/pagination';
import { ActivityService } from '../activity/activity.service';
import { CategoriesService } from '../categories/categories.service';
import { TagsService } from '../tags/tags.service';
import {
  CreateIdeaDto,
  IdeaLinkInputDto,
  IdeaResponseDto,
  IdeaSummaryDto,
  ListIdeasQueryDto,
  UpdateIdeaDto,
} from './dto/idea.dto';
import { IdeaLink } from './entities/idea-link.entity';
import { Idea } from './entities/idea.entity';
import { toIdeaResponse, toIdeaSummary } from './idea.mapper';
import { buildPrefixTsQuery } from './search-query';

const PRIORITY_RANK_SQL = `CASE idea.priority WHEN 'urgent' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END`;

function ideaNotFound(): NotFoundException {
  return new NotFoundException('Idea not found');
}

/**
 * Ideas belong to one user. Every query filters by userId, so another user's
 * idea is indistinguishable from one that doesn't exist (404).
 */
@Injectable()
export class IdeasService {
  constructor(
    @InjectRepository(Idea) private readonly ideas: Repository<Idea>,
    private readonly dataSource: DataSource,
    private readonly categories: CategoriesService,
    private readonly tags: TagsService,
    private readonly activity: ActivityService,
  ) {}

  // ---------------------------------------------------------------- reading

  /**
   * Search, filter, sort and paginate. Done in two steps:
   *   1. find the ids of the right page (filters + order + limit), and count all matches;
   *   2. load those ideas with their category and tags.
   */
  async findAll(
    userId: string,
    query: ListIdeasQueryDto,
  ): Promise<Paginated<IdeaSummaryDto>> {
    const tsQuery = query.search ? buildPrefixTsQuery(query.search) : null;

    const base = this.ideas
      .createQueryBuilder('idea')
      .where('idea.userId = :userId', { userId });

    if (query.archived === 'false') base.andWhere('idea.archivedAt IS NULL');
    if (query.archived === 'true') base.andWhere('idea.archivedAt IS NOT NULL');
    if (query.status) base.andWhere('idea.status = :status', query);
    if (query.priority === 'none') base.andWhere('idea.priority IS NULL');
    else if (query.priority) base.andWhere('idea.priority = :priority', query);
    if (query.categoryId === 'none') base.andWhere('idea.categoryId IS NULL');
    else if (query.categoryId)
      base.andWhere('idea.categoryId = :categoryId', query);
    if (query.tagId) {
      base.andWhere(
        'EXISTS (SELECT 1 FROM idea_tags it WHERE it.idea_id = idea.id AND it.tag_id = :tagId)',
        query,
      );
    }
    if (query.favorite !== undefined) {
      base.andWhere('idea.isFavorite = :favorite', query);
    }
    if (tsQuery) {
      base
        .andWhere("idea.search_vector @@ to_tsquery('simple', :tsQuery)")
        .setParameter('tsQuery', tsQuery);
    }

    const total = await base.clone().getCount();

    // Step 1: the ids for this page, in the right order.
    const sort =
      query.sort === 'relevance' && !tsQuery
        ? 'updatedAt'
        : (query.sort ?? (tsQuery ? 'relevance' : 'updatedAt'));
    const order = (
      query.order ?? (sort === 'title' ? 'asc' : 'desc')
    ).toUpperCase() as 'ASC' | 'DESC';

    const page = base.clone().select('idea.id', 'id');
    switch (sort) {
      case 'title':
        page.addSelect('LOWER(idea.title)', 'sort_title');
        page.orderBy('sort_title', order);
        break;
      case 'priority':
        page.addSelect(PRIORITY_RANK_SQL, 'sort_priority');
        page.orderBy('sort_priority', order);
        page.addOrderBy('idea.updatedAt', 'DESC');
        break;
      case 'relevance':
        page.addSelect(
          "ts_rank(idea.search_vector, to_tsquery('simple', :tsQuery))",
          'sort_rank',
        );
        page.orderBy('sort_rank', 'DESC');
        page.addOrderBy('idea.updatedAt', 'DESC');
        break;
      case 'createdAt':
        page.orderBy('idea.createdAt', order);
        break;
      default:
        page.orderBy('idea.updatedAt', order);
    }
    page.addOrderBy('idea.id', 'ASC'); // stable order between pages

    const rows = await page
      .offset((query.page - 1) * query.pageSize)
      .limit(query.pageSize)
      .getRawMany<{ id: string }>();
    const ids = rows.map((row) => row.id);
    if (ids.length === 0) {
      return paginate([], total, query);
    }

    // Step 2: load the full ideas for this page, then restore the order.
    const [ideas, linkCounts] = await Promise.all([
      this.ideas.find({
        where: { id: In(ids), userId },
        relations: { category: true, tags: true },
      }),
      this.countLinks(ids),
    ]);
    const byId = new Map(ideas.map((idea) => [idea.id, idea]));
    const data = ids
      .map((id) => byId.get(id))
      .filter((idea): idea is Idea => idea !== undefined)
      .map((idea) => toIdeaSummary(idea, linkCounts.get(idea.id) ?? 0));

    return paginate(data, total, query);
  }

  async findOne(userId: string, id: string): Promise<IdeaResponseDto> {
    return toIdeaResponse(await this.loadOwned(userId, id));
  }

  // ---------------------------------------------------------------- writing

  /** Quick capture needs only a title; everything else is optional. */
  async create(userId: string, dto: CreateIdeaDto): Promise<IdeaResponseDto> {
    const id = await this.dataSource.transaction(async (manager) => {
      const categoryId = await this.ownedCategoryId(userId, dto.categoryId);
      const tags = dto.tags
        ? await this.tags.findOrCreateByNames(userId, dto.tags, manager)
        : [];

      const idea = await manager.save(
        manager.create(Idea, {
          userId,
          title: dto.title,
          description: dto.description ?? null,
          status: dto.status ?? 'inbox',
          priority: dto.priority ?? null,
          isFavorite: dto.isFavorite ?? false,
          categoryId,
          tags,
        }),
      );
      await this.replaceLinks(manager, idea.id, dto.links ?? []);
      await this.activity.log(
        userId,
        {
          entityType: 'idea',
          entityId: idea.id,
          action: 'created',
          summary: idea.title,
        },
        manager,
      );
      return idea.id;
    });
    return this.findOne(userId, id);
  }

  /**
   * Updates only the fields sent. Activity entries describe what happened:
   * a status change, a favourite toggle, and/or "updated" for other edits.
   */
  async update(
    userId: string,
    id: string,
    dto: UpdateIdeaDto,
  ): Promise<IdeaResponseDto> {
    await this.dataSource.transaction(async (manager) => {
      const idea = await manager.findOne(Idea, {
        where: { id, userId },
        relations: { tags: true, links: true },
      });
      if (!idea) throw ideaNotFound();

      const previousStatus = idea.status;
      const previousFavorite = idea.isFavorite;
      let edited = false;

      if (dto.title !== undefined && dto.title !== idea.title) {
        idea.title = dto.title;
        edited = true;
      }
      if (
        dto.description !== undefined &&
        dto.description !== idea.description
      ) {
        idea.description = dto.description;
        edited = true;
      }
      if (dto.priority !== undefined && dto.priority !== idea.priority) {
        idea.priority = dto.priority;
        edited = true;
      }
      if (dto.categoryId !== undefined && dto.categoryId !== idea.categoryId) {
        idea.categoryId = await this.ownedCategoryId(userId, dto.categoryId);
        idea.category = undefined; // let categoryId decide
        edited = true;
      }
      if (dto.status !== undefined && dto.status !== idea.status) {
        if (idea.status === 'converted') {
          throw new BadRequestException(
            "This idea was converted to a project, so its status can't change.",
          );
        }
        idea.status = dto.status;
      }
      if (dto.isFavorite !== undefined) {
        idea.isFavorite = dto.isFavorite;
      }
      if (dto.tags !== undefined) {
        const tags = await this.tags.findOrCreateByNames(
          userId,
          dto.tags,
          manager,
        );
        if (!sameIds(tags, idea.tags ?? [])) {
          idea.tags = tags;
          edited = true;
        }
      }
      if (dto.links !== undefined && !sameLinks(dto.links, idea.links ?? [])) {
        await this.replaceLinks(manager, idea.id, dto.links);
        edited = true;
      }

      const changed =
        edited ||
        idea.status !== previousStatus ||
        idea.isFavorite !== previousFavorite;
      if (!changed) {
        return; // nothing to save, and "last updated" stays as it was
      }

      delete idea.links; // links were saved separately
      await manager.save(idea);
      // Tag/link-only edits don't touch the ideas row, so bump updatedAt explicitly.
      await manager.update(Idea, { id: idea.id }, { updatedAt: () => 'now()' });

      const log = (
        action: 'updated' | 'status_changed' | 'favorited' | 'unfavorited',
        metadata?: Record<string, string>,
      ) =>
        this.activity.log(
          userId,
          {
            entityType: 'idea',
            entityId: idea.id,
            action,
            summary: idea.title,
            metadata,
          },
          manager,
        );
      if (idea.status !== previousStatus) {
        await log('status_changed', { from: previousStatus, to: idea.status });
      }
      if (idea.isFavorite !== previousFavorite) {
        await log(idea.isFavorite ? 'favorited' : 'unfavorited');
      }
      if (edited) {
        await log('updated');
      }
    });
    return this.findOne(userId, id);
  }

  /** Reversible: archived ideas are hidden from the default list. */
  async archive(userId: string, id: string): Promise<IdeaResponseDto> {
    return this.setArchived(userId, id, true);
  }

  async restore(userId: string, id: string): Promise<IdeaResponseDto> {
    return this.setArchived(userId, id, false);
  }

  /** Permanent. Its links and tag connections are removed with it (CASCADE). */
  async remove(userId: string, id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const idea = await manager.findOneBy(Idea, { id, userId });
      if (!idea) throw ideaNotFound();
      await manager.remove(idea);
      await this.activity.log(
        userId,
        {
          entityType: 'idea',
          entityId: id,
          action: 'deleted',
          summary: idea.title,
        },
        manager,
      );
    });
  }

  // ---------------------------------------------------------------- helpers

  private async loadOwned(userId: string, id: string): Promise<Idea> {
    const idea = await this.ideas.findOne({
      where: { id, userId },
      relations: { category: true, tags: true, links: true },
    });
    if (!idea) throw ideaNotFound();
    return idea;
  }

  private async setArchived(
    userId: string,
    id: string,
    archived: boolean,
  ): Promise<IdeaResponseDto> {
    await this.dataSource.transaction(async (manager) => {
      const idea = await manager.findOneBy(Idea, { id, userId });
      if (!idea) throw ideaNotFound();
      if (Boolean(idea.archivedAt) === archived) return; // already in that state

      idea.archivedAt = archived ? new Date() : null;
      await manager.save(idea);
      await this.activity.log(
        userId,
        {
          entityType: 'idea',
          entityId: id,
          action: archived ? 'archived' : 'restored',
          summary: idea.title,
        },
        manager,
      );
    });
    return this.findOne(userId, id);
  }

  /** null/undefined → no category; otherwise it must be one of the user's own (404 if not). */
  private async ownedCategoryId(
    userId: string,
    categoryId: string | null | undefined,
  ): Promise<string | null> {
    if (!categoryId) return null;
    return (await this.categories.findOwned(userId, categoryId)).id;
  }

  private async replaceLinks(
    manager: EntityManager,
    ideaId: string,
    links: IdeaLinkInputDto[],
  ): Promise<void> {
    await manager.delete(IdeaLink, { ideaId });
    if (links.length) {
      await manager.insert(
        IdeaLink,
        links.map((link, position) => ({
          ideaId,
          url: link.url,
          label: link.label ?? null,
          position,
        })),
      );
    }
  }

  private async countLinks(ideaIds: string[]): Promise<Map<string, number>> {
    const rows = await this.dataSource
      .getRepository(IdeaLink)
      .createQueryBuilder('link')
      .select('link.ideaId', 'ideaId')
      .addSelect('COUNT(*)::int', 'count')
      .where('link.ideaId IN (:...ideaIds)', { ideaIds })
      .groupBy('link.ideaId')
      .getRawMany<{ ideaId: string; count: number }>();
    return new Map(rows.map((row) => [row.ideaId, Number(row.count)]));
  }
}

function sameIds(a: { id: string }[], b: { id: string }[]): boolean {
  const ids = new Set(a.map((x) => x.id));
  return a.length === b.length && b.every((x) => ids.has(x.id));
}

function sameLinks(next: IdeaLinkInputDto[], current: IdeaLink[]): boolean {
  const sorted = [...current].sort((a, b) => a.position - b.position);
  return (
    next.length === sorted.length &&
    next.every(
      (link, i) =>
        link.url === sorted[i].url && (link.label ?? null) === sorted[i].label,
    )
  );
}
