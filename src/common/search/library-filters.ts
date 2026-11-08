import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { buildPrefixTsQuery } from './search-query';

export interface LibraryFilters {
  search?: string;
  categoryId?: string; // an id, or 'none'
  tagId?: string;
  ideaId?: string;
  projectId?: string;
}

/**
 * The filters shared by notes and resources: full-text search, category
 * (or "none"), tag, and the idea/project they're attached to.
 * Returns the tsquery when searching (for relevance sorting), else null.
 */
export function applyLibraryFilters<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  alias: string,
  tags: { table: string; column: string },
  filters: LibraryFilters,
): string | null {
  if (filters.categoryId === 'none') {
    qb.andWhere(`${alias}.categoryId IS NULL`);
  } else if (filters.categoryId) {
    qb.andWhere(`${alias}.categoryId = :categoryId`, {
      categoryId: filters.categoryId,
    });
  }
  if (filters.tagId) {
    qb.andWhere(
      `EXISTS (SELECT 1 FROM ${tags.table} t WHERE t.${tags.column} = ${alias}.id AND t.tag_id = :tagId)`,
      { tagId: filters.tagId },
    );
  }
  if (filters.ideaId) {
    qb.andWhere(`${alias}.ideaId = :ideaId`, { ideaId: filters.ideaId });
  }
  if (filters.projectId) {
    qb.andWhere(`${alias}.projectId = :projectId`, {
      projectId: filters.projectId,
    });
  }

  const tsQuery = filters.search ? buildPrefixTsQuery(filters.search) : null;
  if (tsQuery) {
    qb.andWhere(
      `${alias}.search_vector @@ to_tsquery('simple', :tsQuery)`,
    ).setParameter('tsQuery', tsQuery);
  }
  return tsQuery;
}
