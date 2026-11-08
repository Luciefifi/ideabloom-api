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
import { Project } from '../../projects/entities/project.entity';
import { User } from '../../users/entities/user.entity';
import type { TaskPriority, TaskStatus } from '../task.constants';

/**
 * A to-do. It can stand alone or belong to a project, and can have subtasks
 * (one level deep: a subtask's parent is a top-level task).
 */
@Entity('tasks')
@Index('IDX_tasks_user_status_due', ['userId', 'status', 'dueDate'])
@Check(
  'CHK_tasks_due_after_start',
  '"due_date" IS NULL OR "start_date" IS NULL OR "due_date" >= "start_date"',
)
export class Task {
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

  @Column({ type: 'varchar', length: 20, default: 'todo' })
  status: TaskStatus;

  @Column({ type: 'varchar', length: 10, nullable: true })
  priority: TaskPriority | null;

  @Column({ name: 'start_date', type: 'date', nullable: true })
  startDate: string | null;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: string | null;

  /** Set when the status becomes "done". */
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  /** Deleting a project deletes its tasks (decision 3 of Milestone 4). */
  @Index('IDX_tasks_project_id')
  @Column({ name: 'project_id', type: 'uuid', nullable: true })
  projectId: string | null;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project?: Project | null;

  /** Set for subtasks. Deleting a task deletes its subtasks. */
  @Index('IDX_tasks_parent_task_id')
  @Column({ name: 'parent_task_id', type: 'uuid', nullable: true })
  parentTaskId: string | null;

  @ManyToOne(() => Task, (task) => task.subtasks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'parent_task_id' })
  parent?: Task | null;

  @OneToMany(() => Task, (task) => task.parent)
  subtasks?: Task[];

  /** Order among siblings (inside a parent, or among top-level tasks). */
  @Column({ type: 'int', default: 0 })
  position: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
