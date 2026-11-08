import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { isUniqueViolation } from '../../common/database/postgres-errors';
import { CreateTagDto, UpdateTagDto } from './dto/tag.dto';
import { Tag } from './entities/tag.entity';

/** Every query is filtered by the current user's id; other users' tags are "not found". */
@Injectable()
export class TagsService {
  constructor(@InjectRepository(Tag) private readonly tags: Repository<Tag>) {}

  /** Your tags A to Z, each with the number of ideas using it. */
  async findAllWithCounts(userId: string): Promise<
    Array<{
      tag: Tag;
      ideaCount: number;
      noteCount: number;
      resourceCount: number;
    }>
  > {
    const { entities, raw } = await this.tags
      .createQueryBuilder('tag')
      .addSelect(
        // Counted with a subquery on the join table, so this module doesn't
        // depend on the ideas module (which depends on this one).
        (sub) =>
          sub
            .select('COUNT(*)::int')
            .from('idea_tags', 'link')
            .where('link.tag_id = tag.id'),
        'idea_count',
      )
      .where('tag.userId = :userId', { userId })
      .orderBy('tag.name', 'ASC')
      .addSelect(
        '(SELECT COUNT(*)::int FROM note_tags nt WHERE nt.tag_id = tag.id)',
        'note_count',
      )
      .addSelect(
        '(SELECT COUNT(*)::int FROM resource_tags rt WHERE rt.tag_id = tag.id)',
        'resource_count',
      )
      .getRawAndEntities<{
        idea_count: number;
        note_count: number;
        resource_count: number;
      }>();

    return entities.map((tag, i) => ({
      tag,
      ideaCount: Number(raw[i].idea_count),
      noteCount: Number(raw[i].note_count),
      resourceCount: Number(raw[i].resource_count),
    }));
  }

  /**
   * Turns tag names into the user's tags, creating any that don't exist yet.
   * "Design" and "design" are the same tag (the first spelling is kept).
   * Pass `manager` to run inside the caller's transaction.
   */
  async findOrCreateByNames(
    userId: string,
    names: string[],
    manager?: EntityManager,
  ): Promise<Tag[]> {
    const byKey = new Map<string, string>();
    for (const name of names) {
      const key = name.toLowerCase();
      if (!byKey.has(key)) byKey.set(key, name);
    }
    if (byKey.size === 0) {
      return [];
    }

    const repository = manager ? manager.getRepository(Tag) : this.tags;

    // ON CONFLICT DO NOTHING: existing tags are simply kept (also safe if two
    // requests create the same tag at the same moment).
    await repository
      .createQueryBuilder()
      .insert()
      .into(Tag)
      .values([...byKey.values()].map((name) => ({ userId, name })))
      .orIgnore()
      .execute();

    return repository
      .createQueryBuilder('tag')
      .where('tag.userId = :userId', { userId })
      .andWhere('tag.nameKey IN (:...keys)', { keys: [...byKey.keys()] })
      .orderBy('tag.name', 'ASC')
      .getMany();
  }

  async findOwned(userId: string, id: string): Promise<Tag> {
    const tag = await this.tags.findOneBy({ id, userId });
    if (!tag) {
      throw new NotFoundException('Tag not found');
    }
    return tag;
  }

  create(userId: string, dto: CreateTagDto): Promise<Tag> {
    return this.saveUnique(this.tags.create({ ...dto, userId }));
  }

  async update(userId: string, id: string, dto: UpdateTagDto): Promise<Tag> {
    const tag = await this.findOwned(userId, id);
    tag.name = dto.name;
    return this.saveUnique(tag);
  }

  /** Also removes the tag from every idea that had it (the links cascade). */
  async remove(userId: string, id: string): Promise<void> {
    const tag = await this.findOwned(userId, id);
    await this.tags.remove(tag);
  }

  private async saveUnique(tag: Tag): Promise<Tag> {
    try {
      return await this.tags.save(tag);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          `You already have a tag named "${tag.name}"`,
        );
      }
      throw error;
    }
  }
}
