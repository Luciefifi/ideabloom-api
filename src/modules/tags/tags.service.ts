import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { isUniqueViolation } from '../../common/database/postgres-errors';
import { CreateTagDto, UpdateTagDto } from './dto/tag.dto';
import { Tag } from './entities/tag.entity';

/** Every query is filtered by the current user's id; other users' tags are "not found". */
@Injectable()
export class TagsService {
  constructor(@InjectRepository(Tag) private readonly tags: Repository<Tag>) {}

  findAll(userId: string): Promise<Tag[]> {
    return this.tags.find({ where: { userId }, order: { name: 'ASC' } });
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
