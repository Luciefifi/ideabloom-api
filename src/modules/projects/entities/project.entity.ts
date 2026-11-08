import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Category } from '../../categories/entities/category.entity';
import { Idea } from '../../ideas/entities/idea.entity';
import { User } from '../../users/entities/user.entity';
import type { ProjectPriority, ProjectStatus } from '../project.constants';
import { Milestone } from './milestone.entity';

@Entity('projects')
@Index('IDX_projects_user_status', ['userId', 'status'])
@Index('IDX_projects_user_updated', ['userId', 'updatedAt'])
// The database itself refuses impossible dates, whatever the code does.
@Check(
  'CHK_projects_target_after_start',
  '"target_date" IS NULL OR "start_date" IS NULL OR "target_date" >= "start_date"',
)
export class Project {
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

  /** What success looks like (free text, line breaks kept). */
  @Column({ type: 'text', nullable: true })
  goals: string | null;

  @Column({ type: 'varchar', length: 20, default: 'not_started' })
  status: ProjectStatus;

  @Column({ type: 'varchar', length: 10, nullable: true })
  priority: ProjectPriority | null;

  @Index('IDX_projects_category_id')
  @Column({ name: 'category_id', type: 'uuid', nullable: true })
  categoryId: string | null;

  @ManyToOne(() => Category, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'category_id' })
  category?: Category | null;

  /** Plain calendar dates ("2026-12-31"): no time, no time-zone shifting. */
  @Column({ name: 'start_date', type: 'date', nullable: true })
  startDate: string | null;

  @Column({ name: 'target_date', type: 'date', nullable: true })
  targetDate: string | null;

  /** Set when the status becomes "completed". */
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  /** The idea this project was converted from, if any. */
  @Column({ name: 'source_idea_id', type: 'uuid', nullable: true })
  sourceIdeaId: string | null;

  @ManyToOne(() => Idea, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'source_idea_id' })
  sourceIdea?: Idea | null;

  @OneToMany(() => Milestone, (milestone) => milestone.project)
  milestones?: Milestone[];

  /** Ideas linked to this project (including the source idea). */
  @OneToMany(() => Idea, (idea) => idea.project)
  relatedIdeas?: Idea[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
