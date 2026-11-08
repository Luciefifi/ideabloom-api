import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Idea } from './idea.entity';

/** A link or reference saved on an idea (an article, a video, a competitor…). */
@Entity('idea_links')
export class IdeaLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_idea_links_idea_id')
  @Column({ name: 'idea_id', type: 'uuid' })
  ideaId: string;

  @ManyToOne(() => Idea, (idea) => idea.links, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'idea_id' })
  idea?: Idea;

  @Column({ type: 'varchar', length: 2000 })
  url: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  label: string | null;

  /** Keeps links in the order the user entered them. */
  @Column({ type: 'int', default: 0 })
  position: number;
}
