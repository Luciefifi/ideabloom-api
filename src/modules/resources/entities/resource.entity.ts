import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Category } from '../../categories/entities/category.entity';
import { Idea } from '../../ideas/entities/idea.entity';
import { Project } from '../../projects/entities/project.entity';
import { Tag } from '../../tags/entities/tag.entity';
import { User } from '../../users/entities/user.entity';
import type { ResourceType } from '../resource.constants';

const SEARCH_VECTOR_SQL =
  "setweight(to_tsvector('simple', coalesce(title, '')), 'A') || " +
  "setweight(to_tsvector('simple', coalesce(description, '')), 'B') || " +
  "setweight(to_tsvector('simple', coalesce(notes, '')), 'C')";

/** A saved link (website, article, video, document) with your own notes. */
@Entity('resources')
@Index('IDX_resources_user_updated', ['userId', 'updatedAt'])
@Check('CHK_resources_one_parent', '"idea_id" IS NULL OR "project_id" IS NULL')
export class Resource {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  /** Always http:// or https:// (checked by the DTO). */
  @Column({ type: 'varchar', length: 2000 })
  url: string;

  @Column({ type: 'varchar', length: 20, default: 'website' })
  type: ResourceType;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Your personal notes about it (plain text). */
  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Index('IDX_resources_category_id')
  @Column({ name: 'category_id', type: 'uuid', nullable: true })
  categoryId: string | null;

  @ManyToOne(() => Category, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'category_id' })
  category?: Category | null;

  /** Attached to at most ONE idea or project (CHECK). Deleting it keeps the resource. */
  @Index('IDX_resources_idea_id')
  @Column({ name: 'idea_id', type: 'uuid', nullable: true })
  ideaId: string | null;

  @ManyToOne(() => Idea, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'idea_id' })
  idea?: Idea | null;

  @Index('IDX_resources_project_id')
  @Column({ name: 'project_id', type: 'uuid', nullable: true })
  projectId: string | null;

  @ManyToOne(() => Project, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'project_id' })
  project?: Project | null;

  @ManyToMany(() => Tag, { onDelete: 'CASCADE' })
  @JoinTable({
    name: 'resource_tags',
    joinColumn: { name: 'resource_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'tag_id', referencedColumnName: 'id' },
  })
  tags?: Tag[];

  @Index('IDX_resources_search_vector', { type: 'gin' })
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
