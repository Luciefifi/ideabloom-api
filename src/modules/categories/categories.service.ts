import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { isUniqueViolation } from '../../common/database/postgres-errors';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { Category } from './entities/category.entity';

/**
 * Every method takes the current user's id and filters by it. A category that
 * belongs to someone else behaves exactly like one that doesn't exist (404).
 */
@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
  ) {}

  /** Your categories A to Z, each with the number of ideas in it (archived included). */
  async findAllWithCounts(
    userId: string,
  ): Promise<Array<{ category: Category; ideaCount: number }>> {
    const { entities, raw } = await this.categories
      .createQueryBuilder('category')
      .addSelect(
        // A subquery on the ideas table keeps this module independent of the
        // ideas module (which depends on this one).
        (sub) =>
          sub
            .select('COUNT(*)::int')
            .from('ideas', 'idea')
            .where('idea.category_id = category.id'),
        'idea_count',
      )
      .where('category.userId = :userId', { userId })
      .orderBy('category.name', 'ASC')
      .getRawAndEntities<{ idea_count: number }>();

    return entities.map((category, i) => ({
      category,
      ideaCount: Number(raw[i].idea_count),
    }));
  }

  /** Also used by other features (e.g. ideas) to check a category id is the user's own. */
  async findOwned(userId: string, id: string): Promise<Category> {
    const category = await this.categories.findOneBy({ id, userId });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    return category;
  }

  create(userId: string, dto: CreateCategoryDto): Promise<Category> {
    return this.saveUnique(this.categories.create({ ...dto, userId }));
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateCategoryDto,
  ): Promise<Category> {
    const category = await this.findOwned(userId, id);
    Object.assign(category, dto);
    return this.saveUnique(category);
  }

  /**
   * Ideas in this category are NOT deleted: the database empties their
   * category instead (ON DELETE SET NULL, added with the ideas table).
   */
  async remove(userId: string, id: string): Promise<void> {
    const category = await this.findOwned(userId, id);
    await this.categories.remove(category);
  }

  private async saveUnique(category: Category): Promise<Category> {
    try {
      return await this.categories.save(category);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          `You already have a category named "${category.name}"`,
        );
      }
      throw error;
    }
  }
}
