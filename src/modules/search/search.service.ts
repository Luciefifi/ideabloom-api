import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { buildPrefixTsQuery } from '../../common/search/search-query';
import {
  SearchGroupDto,
  SearchQueryDto,
  SearchResponseDto,
  SearchResultDto,
} from './dto/search.dto';
import {
  HIGHLIGHT_END,
  HIGHLIGHT_START,
  SEARCH_TYPES,
  type SearchType,
} from './search.constants';

/** How each kind of item is searched. Table and column names are fixed here, never from the request. */
interface Source {
  table: string;
  /** Ideas only: hide archived ones unless asked ($6 = includeArchived). */
  archivable?: boolean;
  /** Text the snippet is taken from. */
  snippet: string;
  /** Extra columns for the result (x = the item, p = its project). */
  columns: string;
  joins?: string;
  toResult: (row: Row) => Partial<SearchResultDto>;
}

type Row = Record<string, unknown> & {
  total: number;
  project_id?: string | null;
  project_title?: string | null;
  id: string;
  title: string;
  snippet: string | null;
  updated_at: Date;
};

const projectRef = (row: Row) =>
  row.project_id
    ? { id: row.project_id, title: row.project_title ?? '' }
    : null;

const SOURCES: Record<SearchType, Source> = {
  idea: {
    table: 'ideas',
    archivable: true,
    snippet: 'x.description',
    columns: 'x.status, x.archived_at IS NOT NULL AS archived',
    toResult: (row) => ({
      status: String(row.status),
      archived: Boolean(row.archived),
    }),
  },
  project: {
    table: 'projects',
    snippet: "coalesce(nullif(x.goals, ''), x.description)",
    columns: 'x.status',
    toResult: (row) => ({ status: String(row.status) }),
  },
  task: {
    table: 'tasks',
    snippet: 'x.description',
    columns: 'x.status, p.id AS project_id, p.title AS project_title',
    joins: 'LEFT JOIN projects p ON p.id = x.project_id',
    toResult: (row) => ({
      status: String(row.status),
      project: projectRef(row),
    }),
  },
  note: {
    table: 'notes',
    snippet: 'x.content_text',
    columns:
      'x.is_pinned AS pinned, p.id AS project_id, p.title AS project_title',
    joins: 'LEFT JOIN projects p ON p.id = x.project_id',
    toResult: (row) => ({
      pinned: Boolean(row.pinned),
      project: projectRef(row),
    }),
  },
  resource: {
    table: 'resources',
    snippet: "coalesce(nullif(x.description, ''), x.notes)",
    columns: 'x.url, x.type AS resource_type',
    toResult: (row) => ({
      url: String(row.url),
      resourceType: String(row.resource_type),
    }),
  },
};

const MARKERS = `StartSel="${HIGHLIGHT_START}", StopSel="${HIGHLIGHT_END}"`;
const TITLE_OPTIONS = `${MARKERS}, HighlightAll=true`;
const SNIPPET_OPTIONS = `${MARKERS}, MaxWords=24, MinWords=10, MaxFragments=1, ShortWord=2`;

/**
 * Two steps per type: rank the matches (cheap, uses the GIN index) and keep the
 * best `limit`, then build highlighted title/snippet for just those rows.
 * $1 user, $2 tsquery, $3 limit, $4/$5 headline options, $6 includeArchived (ideas only:
 * PostgreSQL rejects a parameter that the query doesn't use).
 */
function sql(source: Source): string {
  return `
    WITH q AS (SELECT to_tsquery('simple', $2) AS query),
    ranked AS (
      SELECT x.id, ts_rank(x.search_vector, q.query) AS rank, x.updated_at,
             COUNT(*) OVER () AS total
        FROM ${source.table} x, q
       WHERE x.user_id = $1 AND x.search_vector @@ q.query
         ${source.archivable ? 'AND ($6 OR x.archived_at IS NULL)' : ''}
       ORDER BY rank DESC, x.updated_at DESC, x.id
       LIMIT $3
    )
    SELECT r.total::int AS total, x.id, x.updated_at,
           ts_headline('simple', x.title, q.query, $4) AS title,
           CASE WHEN coalesce(${source.snippet}, '') = '' THEN NULL
                ELSE ts_headline('simple', ${source.snippet}, q.query, $5) END AS snippet,
           ${source.columns}
      FROM ranked r
      JOIN ${source.table} x ON x.id = r.id
      CROSS JOIN q
      ${source.joins ?? ''}
     ORDER BY r.rank DESC, r.updated_at DESC, r.id`;
}

@Injectable()
export class SearchService {
  constructor(private readonly dataSource: DataSource) {}

  async search(
    userId: string,
    query: SearchQueryDto,
  ): Promise<SearchResponseDto> {
    const wanted = SEARCH_TYPES.filter(
      (type) => !query.types?.length || query.types.includes(type),
    );
    const tsQuery = buildPrefixTsQuery(query.q);
    if (!tsQuery) {
      // Nothing searchable left (e.g. only punctuation).
      return {
        query: query.q,
        groups: wanted.map((type) => ({ type, total: 0, items: [] })),
      };
    }

    const groups = await Promise.all(
      wanted.map(async (type): Promise<SearchGroupDto> => {
        const source = SOURCES[type];
        const params: unknown[] = [
          userId,
          tsQuery,
          query.limit,
          TITLE_OPTIONS,
          SNIPPET_OPTIONS,
        ];
        if (source.archivable) params.push(query.includeArchived);
        const rows: Row[] = await this.dataSource.query(sql(source), params);
        return {
          type,
          total: rows[0]?.total ?? 0,
          items: rows.map((row) => ({
            type,
            id: row.id,
            title: row.title,
            snippet: row.snippet,
            updatedAt: row.updated_at,
            ...source.toResult(row),
          })),
        };
      }),
    );
    return { query: query.q, groups };
  }
}
