import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { isDeepStrictEqual } from 'node:util';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { paginate, Paginated } from '../../common/pagination/pagination';
import { applyLibraryFilters } from '../../common/search/library-filters';
import { ActivityService } from '../activity/activity.service';
import { projectTitle, resolveAttachment } from '../attachments/attachment';
import { CategoriesService } from '../categories/categories.service';
import { TagsService } from '../tags/tags.service';
import {
  CreateNoteDto,
  DEFAULT_NOTE_TITLE,
  ListNotesQueryDto,
  NoteResponseDto,
  NoteSummaryDto,
  UpdateNoteDto,
} from './dto/note.dto';
import { Note } from './entities/note.entity';
import {
  EMPTY_NOTE,
  NoteContentError,
  NoteDoc,
  sanitizeNoteContent,
} from './note-content';
import { toNoteResponse, toNoteSummary } from './note.mapper';

function noteNotFound(): NotFoundException {
  return new NotFoundException('Note not found');
}

/** Validates and cleans editor JSON; problems become a 400 with a clear message. */
function cleanContent(raw: unknown): { doc: NoteDoc; text: string } {
  try {
    return sanitizeNoteContent(raw);
  } catch (error) {
    if (error instanceof NoteContentError) {
      throw new BadRequestException(error.message);
    }
    throw error;
  }
}

@Injectable()
export class NotesService {
  constructor(
    @InjectRepository(Note) private readonly notes: Repository<Note>,
    private readonly dataSource: DataSource,
    private readonly categories: CategoriesService,
    private readonly tags: TagsService,
    private readonly activity: ActivityService,
  ) {}

  // ---------------------------------------------------------------- reading

  /** Pinned first, then most recently edited (two-step pagination like ideas). */
  async findAll(
    userId: string,
    query: ListNotesQueryDto,
  ): Promise<Paginated<NoteSummaryDto>> {
    const base = this.notes
      .createQueryBuilder('note')
      .where('note.userId = :userId', { userId });
    const tsQuery = applyLibraryFilters(
      base,
      'note',
      { table: 'note_tags', column: 'note_id' },
      query,
    );
    if (query.pinned !== undefined) {
      base.andWhere('note.isPinned = :pinned', { pinned: query.pinned });
    }

    const total = await base.clone().getCount();

    const sort =
      query.sort === 'relevance' && !tsQuery
        ? 'updatedAt'
        : (query.sort ?? (tsQuery ? 'relevance' : 'updatedAt'));
    const order = (
      query.order ?? (sort === 'title' ? 'asc' : 'desc')
    ).toUpperCase() as 'ASC' | 'DESC';

    const page = base.clone().select('note.id', 'id');
    if (sort === 'relevance') {
      page
        .addSelect(
          "ts_rank(note.search_vector, to_tsquery('simple', :tsQuery))",
          'sort_rank',
        )
        .orderBy('sort_rank', 'DESC')
        .addOrderBy('note.updatedAt', 'DESC');
    } else {
      page.orderBy('note.isPinned', 'DESC');
      if (sort === 'title') {
        page
          .addSelect('LOWER(note.title)', 'sort_title')
          .addOrderBy('sort_title', order);
      } else {
        page.addOrderBy(`note.${sort}`, order);
      }
    }
    page.addOrderBy('note.id', 'ASC');

    const ids = (
      await page
        .offset((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .getRawMany<{ id: string }>()
    ).map((row) => row.id);
    if (ids.length === 0) return paginate([], total, query);

    const notes = await this.notes.find({
      where: { id: In(ids), userId },
      relations: { category: true, tags: true, idea: true, project: true },
    });
    const byId = new Map(notes.map((n) => [n.id, n]));
    const data = ids
      .map((id) => byId.get(id))
      .filter((n): n is Note => n !== undefined)
      .map(toNoteSummary);
    return paginate(data, total, query);
  }

  async findOne(userId: string, id: string): Promise<NoteResponseDto> {
    const note = await this.notes
      .createQueryBuilder('note')
      .addSelect('note.content')
      .leftJoinAndSelect('note.category', 'category')
      .leftJoinAndSelect('note.tags', 'tag')
      .leftJoinAndSelect('note.idea', 'idea')
      .leftJoinAndSelect('note.project', 'project')
      .where('note.id = :id AND note.userId = :userId', { id, userId })
      .getOne();
    if (!note) throw noteNotFound();
    return toNoteResponse(note);
  }

  // ---------------------------------------------------------------- writing

  async create(userId: string, dto: CreateNoteDto): Promise<NoteResponseDto> {
    const { doc, text } = cleanContent(dto.content ?? EMPTY_NOTE);
    const id = await this.dataSource.transaction(async (manager) => {
      const attachment = await resolveAttachment(
        manager,
        userId,
        { ideaId: null, projectId: null },
        dto,
      );
      const note = await manager.save(
        manager.create(Note, {
          userId,
          title: dto.title ?? DEFAULT_NOTE_TITLE,
          content: doc,
          contentText: text,
          isPinned: dto.isPinned ?? false,
          categoryId: await this.ownedCategoryId(userId, dto.categoryId),
          tags: dto.tags
            ? await this.tags.findOrCreateByNames(userId, dto.tags, manager)
            : [],
          ...attachment,
        }),
      );
      await this.log(manager, userId, note, 'created');
      if (note.projectId) await this.logAddedToProject(manager, userId, note);
      return note.id;
    });
    return this.findOne(userId, id);
  }

  /**
   * Updates only what's sent. Autosave calls this often, so unchanged content
   * isn't saved again and edits aren't logged one by one in the activity feed.
   */
  async update(
    userId: string,
    id: string,
    dto: UpdateNoteDto,
  ): Promise<NoteResponseDto> {
    await this.dataSource.transaction(async (manager) => {
      const note = await manager
        .createQueryBuilder(Note, 'note')
        .addSelect('note.content')
        .leftJoinAndSelect('note.tags', 'tag')
        .where('note.id = :id AND note.userId = :userId', { id, userId })
        .getOne();
      if (!note) throw noteNotFound();

      let changed = false;
      if (dto.title !== undefined && dto.title !== note.title) {
        note.title = dto.title;
        changed = true;
      }
      if (dto.content !== undefined) {
        const { doc, text } = cleanContent(dto.content);
        // Compare structures, not JSON text: PostgreSQL's jsonb re-orders keys.
        if (!isDeepStrictEqual(doc, note.content)) {
          note.content = doc;
          note.contentText = text;
          changed = true;
        }
      }
      if (dto.isPinned !== undefined && dto.isPinned !== note.isPinned) {
        note.isPinned = dto.isPinned;
        changed = true;
      }
      if (dto.categoryId !== undefined && dto.categoryId !== note.categoryId) {
        note.categoryId = await this.ownedCategoryId(userId, dto.categoryId);
        changed = true;
      }
      if (dto.tags !== undefined) {
        const tags = await this.tags.findOrCreateByNames(
          userId,
          dto.tags,
          manager,
        );
        if (!sameIds(tags, note.tags ?? [])) {
          note.tags = tags;
          changed = true;
        }
      }
      const previousProject = note.projectId;
      const attachment = await resolveAttachment(manager, userId, note, dto);
      if (
        attachment.ideaId !== note.ideaId ||
        attachment.projectId !== note.projectId
      ) {
        Object.assign(note, attachment);
        changed = true;
      }

      if (!changed) return;
      await manager.save(note);
      // Tag-only edits don't touch the notes row, so bump updatedAt explicitly.
      await manager.update(Note, { id: note.id }, { updatedAt: () => 'now()' });
      if (note.projectId && note.projectId !== previousProject) {
        await this.logAddedToProject(manager, userId, note);
      }
    });
    return this.findOne(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const note = await manager.findOneBy(Note, { id, userId });
      if (!note) throw noteNotFound();
      await manager.remove(note);
      await this.log(manager, userId, { id, title: note.title }, 'deleted');
    });
  }

  // ---------------------------------------------------------------- helpers

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
    note: Pick<Note, 'id' | 'title'>,
    action: 'created' | 'deleted',
  ): Promise<void> {
    return this.activity.log(
      userId,
      { entityType: 'note', entityId: note.id, action, summary: note.title },
      manager,
    );
  }

  /** "Added note …" on the project's timeline. */
  private async logAddedToProject(
    manager: EntityManager,
    userId: string,
    note: Note,
  ): Promise<void> {
    if (!note.projectId) return;
    await this.activity.log(
      userId,
      {
        entityType: 'project',
        entityId: note.projectId,
        action: 'note_added',
        summary: await projectTitle(manager, note.projectId),
        metadata: { note: note.title },
      },
      manager,
    );
  }
}

function sameIds(a: { id: string }[], b: { id: string }[]): boolean {
  const ids = new Set(a.map((x) => x.id));
  return a.length === b.length && b.every((x) => ids.has(x.id));
}
