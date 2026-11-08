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
import type { NoteDoc } from '../note-content';

/** Title (weight A) + the note's plain text (weight B), 'simple' config like ideas. */
const SEARCH_VECTOR_SQL =
  "setweight(to_tsvector('simple', coalesce(title, '')), 'A') || " +
  "setweight(to_tsvector('simple', coalesce(content_text, '')), 'B')";

@Entity('notes')
@Index('IDX_notes_user_pinned_updated', ['userId', 'isPinned', 'updatedAt'])
@Check('CHK_notes_one_parent', '"idea_id" IS NULL OR "project_id" IS NULL')
export class Note {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  /** The editor document (validated and rebuilt by sanitizeNoteContent). Not loaded in lists. */
  @Column({
    type: 'jsonb',
    default: { type: 'doc', content: [] },
    select: false,
  })
  content?: NoteDoc;

  /** Plain text extracted by the API from `content`, for search and previews. */
  @Column({ name: 'content_text', type: 'text', default: '' })
  contentText: string;

  @Column({ name: 'is_pinned', type: 'boolean', default: false })
  isPinned: boolean;

  @Index('IDX_notes_category_id')
  @Column({ name: 'category_id', type: 'uuid', nullable: true })
  categoryId: string | null;

  @ManyToOne(() => Category, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'category_id' })
  category?: Category | null;

  /** Attached to at most ONE idea or project (CHECK). Deleting it keeps the note. */
  @Index('IDX_notes_idea_id')
  @Column({ name: 'idea_id', type: 'uuid', nullable: true })
  ideaId: string | null;

  @ManyToOne(() => Idea, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'idea_id' })
  idea?: Idea | null;

  @Index('IDX_notes_project_id')
  @Column({ name: 'project_id', type: 'uuid', nullable: true })
  projectId: string | null;

  @ManyToOne(() => Project, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'project_id' })
  project?: Project | null;

  @ManyToMany(() => Tag, { onDelete: 'CASCADE' })
  @JoinTable({
    name: 'note_tags',
    joinColumn: { name: 'note_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'tag_id', referencedColumnName: 'id' },
  })
  tags?: Tag[];

  @Index('IDX_notes_search_vector', { type: 'gin' })
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
