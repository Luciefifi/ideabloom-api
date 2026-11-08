/** Small shapes used inside other responses ("which category / tag / idea / project"). */

export class CategoryRefDto {
  id: string;
  name: string;
  color: string;
}

export class TagRefDto {
  id: string;
  name: string;
}

/** An idea or project, by title. */
export class TitleRefDto {
  id: string;
  title: string;
}

export function toCategoryRef(
  category: CategoryRefDto | null | undefined,
): CategoryRefDto | null {
  return category
    ? { id: category.id, name: category.name, color: category.color }
    : null;
}

export function toTagRefs(tags: TagRefDto[] | undefined): TagRefDto[] {
  return (tags ?? [])
    .map((tag) => ({ id: tag.id, name: tag.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function toTitleRef(
  item: TitleRefDto | null | undefined,
): TitleRefDto | null {
  return item ? { id: item.id, title: item.title } : null;
}
