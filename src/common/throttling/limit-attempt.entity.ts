import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * One counted attempt (a failed login, a reset email sent) for
 * DatabaseAttemptLimiter. Only a SHA-256 hash of the key is stored, so this
 * table is not a list of the email addresses people tried.
 */
@Entity('limit_attempts')
@Index('IDX_limit_attempts_key_hash_attempted_at', ['keyHash', 'attemptedAt'])
export class LimitAttempt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'key_hash', type: 'char', length: 64 })
  keyHash: string;

  /** Set by the API's clock (not the database's), like every limit calculation. */
  @Index('IDX_limit_attempts_attempted_at')
  @Column({ name: 'attempted_at', type: 'timestamptz' })
  attemptedAt: Date;
}
