import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * A person with an IdeaBloom account. Every piece of user data (ideas,
 * projects, tasks…) will point back to a user through a `user_id` column.
 */
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Always stored lowercase and trimmed (done in UsersService), so it's unique regardless of case. */
  @Index('UQ_users_email', { unique: true })
  @Column({ type: 'varchar', length: 254 })
  email: string;

  /**
   * The argon2 hash, never the password itself.
   * `select: false` means normal queries never load this column, so it can't
   * accidentally end up in an API response. Code that needs it must ask explicitly.
   */
  @Column({
    name: 'password_hash',
    type: 'varchar',
    length: 255,
    select: false,
  })
  passwordHash: string;

  @Column({ name: 'display_name', type: 'varchar', length: 80 })
  displayName: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  bio: string | null;

  /** IANA time zone, e.g. "Africa/Kigali". Used to decide when tasks are overdue. */
  @Column({ type: 'varchar', length: 64, default: 'UTC' })
  timezone: string;

  /** Small app preferences (theme etc.), added in later milestones. */
  @Column({ type: 'jsonb', default: {} })
  preferences: Record<string, unknown>;

  @Column({ name: 'password_changed_at', type: 'timestamptz', nullable: true })
  passwordChangedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
