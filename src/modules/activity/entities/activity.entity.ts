import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export const ACTIVITY_ENTITY_TYPES = ['idea', 'project', 'task'] as const;
export type ActivityEntityType = (typeof ACTIVITY_ENTITY_TYPES)[number];

export const ACTIVITY_ACTIONS = [
  'created',
  'updated',
  'status_changed',
  'favorited',
  'unfavorited',
  'archived',
  'restored',
  'deleted',
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

/** Small extra details, e.g. { from: 'inbox', to: 'exploring' }. Simple values only. */
export type ActivityMetadata = Record<string, string | number | boolean | null>;

/**
 * One line in "Recent activity", e.g. "Archived idea 'Plant watering app'".
 *
 * `entityType` + `entityId` point at what changed, without a foreign key, so
 * one table serves ideas, projects and tasks. `summary` keeps a copy of the
 * title, so the history still reads well after the item is renamed or deleted.
 */
@Entity('activities')
@Index('IDX_activities_user_created', ['userId', 'createdAt'])
export class Activity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ name: 'entity_type', type: 'varchar', length: 30 })
  entityType: ActivityEntityType;

  @Column({ name: 'entity_id', type: 'uuid' })
  entityId: string;

  @Column({ type: 'varchar', length: 30 })
  action: ActivityAction;

  @Column({ type: 'varchar', length: 255 })
  summary: string;

  /** Extra details, e.g. { from: 'inbox', to: 'exploring' } for a status change. */
  @Column({ type: 'jsonb', default: {} })
  metadata: ActivityMetadata;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
