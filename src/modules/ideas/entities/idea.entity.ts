import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Category } from '../../categories/entities/category.entity';
import { Project } from '../../projects/entities/project.entity';
import { Tag } from '../../tags/entities/tag.entity';
import { User } from '../../users/entities/user.entity';
import type { IdeaPriority, IdeaStatus } from '../idea.constants';
import { IdeaLink } from './idea-link.entity';

/**
 * Words from the title (weight A, most important) and description (weight B)
 * in a form PostgreSQL can search quickly. 'simple' = no language-specific
 * word stemming, so it works the same for English, Kinyarwanda and others.
 */
const SEARCH_VECTOR_SQL =
  "setweight(to_tsvector('simple', coalesce(title, '')), 'A') || " +
  "setweight(to_tsvector('simple', coalesce(description, '')), 'B')";

@Entity('ideas')
@Index('IDX_ideas_user_archived_updated', ['userId', 'archivedAt', 'updatedAt'])
@Index('IDX_ideas_user_status', ['userId', 'status'])
export class Idea {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 20, default: 'inbox' })
  status: IdeaStatus;

  /** null = no priority chosen (keeps quick capture quick). */
  @Column({ type: 'varchar', length: 10, nullable: true })
  priority: IdeaPriority | null;

  @Column({ name: 'is_favorite', type: 'boolean', default: false })
  isFavorite: boolean;

  /** Set when archived; null when active. Archiving is reversible. */
  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt: Date | null;

  @Index('IDX_ideas_category_id')
  @Column({ name: 'category_id', type: 'uuid', nullable: true })
  categoryId: string | null;

  /** Deleting a category keeps its ideas: they just become uncategorized. */
  @ManyToOne(() => Category, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'category_id' })
  category?: Category | null;

  /** The project this idea belongs to (converted into, or linked to). */
  @Index('IDX_ideas_project_id')
  @Column({ name: 'project_id', type: 'uuid', nullable: true })
  projectId: string | null;

  @ManyToOne(() => Project, (project) => project.relatedIdeas, {
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'project_id' })
  project?: Project | null;

  @ManyToMany(() => Tag, { onDelete: 'CASCADE' })
  @JoinTable({
    name: 'idea_tags',
    joinColumn: { name: 'idea_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'tag_id', referencedColumnName: 'id' },
  })
  tags?: Tag[];

  @OneToMany(() => IdeaLink, (link) => link.idea)
  links?: IdeaLink[];

  /** Maintained by PostgreSQL itself from title + description (generated column). */
  @Index('IDX_ideas_search_vector', { type: 'gin' })
  @Column({
    name: 'search_vector',
    type: 'tsvector',
    generatedType: 'STORED',
    asExpression: SEARCH_VECTOR_SQL,
    select: false,
    insert: false,
    update: false,
  })
  searchVector?: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
