/**
 * Turns what a person types into a safe PostgreSQL full-text query.
 *
 *   "plant  water"  → "plant:* & water:*"   (both words, each as a prefix)
 *   "garde"         → "garde:*"             (finds "garden", "gardening")
 *
 * Only letters and digits are kept from each word, so characters that mean
 * something special in tsquery syntax (& | ! : ( ) ') can never break the
 * query. Returns null when nothing searchable is left.
 */
export function buildPrefixTsQuery(input: string): string | null {
  const words = input
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean)
    .slice(0, 10);

  return words.length ? words.map((word) => `${word}:*`).join(' & ') : null;
}
