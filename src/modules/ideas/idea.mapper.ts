import type {
  IdeaCategoryDto,
  IdeaResponseDto,
  IdeaSummaryDto,
  IdeaTagDto,
} from './dto/idea.dto';
import type { Idea } from './entities/idea.entity';

const EXCERPT_LENGTH = 200;

function category(idea: Idea): IdeaCategoryDto | null {
  return idea.category
    ? {
        id: idea.category.id,
        name: idea.category.name,
        color: idea.category.color,
      }
    : null;
}

function tags(idea: Idea): IdeaTagDto[] {
  return (idea.tags ?? [])
    .map((tag) => ({ id: tag.id, name: tag.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Full idea, for the detail page. */
export function toIdeaResponse(idea: Idea): IdeaResponseDto {
  return {
    id: idea.id,
    title: idea.title,
    description: idea.description,
    status: idea.status,
    priority: idea.priority,
    isFavorite: idea.isFavorite,
    archivedAt: idea.archivedAt,
    category: category(idea),
    tags: tags(idea),
    links: [...(idea.links ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((link) => ({ id: link.id, url: link.url, label: link.label })),
    project: idea.project
      ? { id: idea.project.id, title: idea.project.title }
      : null,
    createdAt: idea.createdAt,
    updatedAt: idea.updatedAt,
  };
}

/** Compact idea, for lists. */
export function toIdeaSummary(idea: Idea, linkCount: number): IdeaSummaryDto {
  const description = idea.description ?? '';
  return {
    id: idea.id,
    title: idea.title,
    excerpt: description
      ? description.length > EXCERPT_LENGTH
        ? `${description.slice(0, EXCERPT_LENGTH).trimEnd()}…`
        : description
      : null,
    status: idea.status,
    priority: idea.priority,
    isFavorite: idea.isFavorite,
    archivedAt: idea.archivedAt,
    category: category(idea),
    tags: tags(idea),
    linkCount,
    createdAt: idea.createdAt,
    updatedAt: idea.updatedAt,
  };
}
