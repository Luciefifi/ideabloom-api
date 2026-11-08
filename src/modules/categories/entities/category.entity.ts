import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { type CategoryColor, DEFAULT_CATEGORY_COLOR } from '../category-colors';

/** A user's own grouping for ideas (and, later, projects and resources). */
@Entity('categories')
@Index('UQ_categories_user_name_key', ['userId', 'nameKey'], { unique: true })
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_categories_user_id')
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ type: 'varchar', length: 50 })
  name: string;

  /**
   * lower(name), calculated by PostgreSQL itself (a "generated column").
   * The unique index on (user_id, name_key) makes "Design" and "design" count
   * as the same name for one user.
   */
  @Column({
    name: 'name_key',
    type: 'varchar',
    length: 50,
    generatedType: 'STORED',
    asExpression: 'lower(name)',
    select: false,
    insert: false,
    update: false,
  })
  nameKey?: string;

  @Column({ type: 'varchar', length: 20, default: DEFAULT_CATEGORY_COLOR })
  color: CategoryColor;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
