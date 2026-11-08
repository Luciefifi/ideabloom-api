import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * "Download my data": everything a user has created, as plain JSON.
 *
 * Each list is built by PostgreSQL (`to_jsonb`), so new columns are included
 * automatically. Left out on purpose: the password hash, session and reset
 * tokens (security), search indexes (derived data) and the repeated user_id.
 * Table names are fixed here; the only parameter is the user's id.
 */
const OWN_ROWS = (table: string, order = 'created_at') =>
  `SELECT coalesce(jsonb_agg(to_jsonb(t) - 'search_vector' - 'user_id' ORDER BY t.${order}), '[]'::jsonb) AS rows
     FROM ${table} t WHERE t.user_id = $1`;

/** Link tables have no user_id: they're exported through the item they belong to. */
const LINKED_ROWS = (table: string, owner: string, column: string) =>
  `SELECT coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb) AS rows
     FROM ${table} l JOIN ${owner} o ON o.id = l.${column}
    WHERE o.user_id = $1`;

const QUERIES = {
  categories: OWN_ROWS('categories', 'name'),
  tags: OWN_ROWS('tags', 'name'),
  ideas: OWN_ROWS('ideas'),
  ideaLinks: LINKED_ROWS('idea_links', 'ideas', 'idea_id'),
  ideaTags: LINKED_ROWS('idea_tags', 'ideas', 'idea_id'),
  projects: OWN_ROWS('projects'),
  milestones: OWN_ROWS('milestones'),
  tasks: OWN_ROWS('tasks'),
  notes: OWN_ROWS('notes'),
  noteTags: LINKED_ROWS('note_tags', 'notes', 'note_id'),
  resources: OWN_ROWS('resources'),
  resourceTags: LINKED_ROWS('resource_tags', 'resources', 'resource_id'),
  activity: OWN_ROWS('activities'),
} as const;

export type DataExport = {
  format: 'ideabloom-export';
  version: 1;
  exportedAt: string;
  profile: Record<string, unknown>;
} & Record<keyof typeof QUERIES, unknown[]>;

@Injectable()
export class DataExportService {
  constructor(private readonly dataSource: DataSource) {}

  async export(userId: string): Promise<DataExport> {
    const [profile] = await this.dataSource.query<Record<string, unknown>[]>(
      `SELECT id, email, display_name, bio, timezone, preferences, created_at
         FROM users WHERE id = $1`,
      [userId],
    );
    const entries = await Promise.all(
      Object.entries(QUERIES).map(async ([key, sql]) => {
        const [row] = await this.dataSource.query<{ rows: unknown[] }[]>(sql, [
          userId,
        ]);
        return [key, row.rows] as const;
      }),
    );
    return {
      format: 'ideabloom-export',
      version: 1,
      exportedAt: new Date().toISOString(),
      profile,
      ...(Object.fromEntries(entries) as Record<
        keyof typeof QUERIES,
        unknown[]
      >),
    };
  }
}
