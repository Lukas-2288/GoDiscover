import type { ContentCategory, ResultItem } from "../../types/content";

/**
 * Stops one name taking over a deck.
 *
 * A recorded science-fiction search returned ten books and spent four of the
 * slots on two authors — Douglas Adams twice, Andy Weir twice. TMDB's own
 * suggestions for Dune: Part Two included both Tremors 3 and Tremors 4. Every
 * result was individually defensible and the deck as a whole was worse for it,
 * which is the gap accuracy-shaped tests never catch: beyond-accuracy
 * evaluation treats diversity as its own axis precisely because a list of ten
 * correct-but-alike answers does not satisfy anyone.
 */

/** Two of anyone is a coincidence; three is a rut. */
export const MAX_PER_CREATOR = 2;

/**
 * What counts as "the same source" differs by category, and getting it wrong is
 * worse than not capping at all.
 *
 * `subtitle` is the author on a book and the artist on an album — an exact,
 * provider-supplied fact. On a film it is the release *year*, so capping by it
 * would throw away every film that happened to come out together. Artists need
 * nothing: each card is its own creator and ids are deduplicated upstream.
 *
 * Films are deliberately left uncapped. A recorded deck for Dune: Part Two does
 * contain three Tremors sequels, and a title-stem heuristic does catch them —
 * but a title is prose, not a field, and the same rule reads "movie 2" and
 * "movie 3" as one franchise. Trimming one sequel is not worth a rule that can
 * silently collapse a deck of unrelated films, so films keep every result until
 * TMDB gives us something exact to group on.
 */
export function creatorKeyFor(
  category: ContentCategory
): ((item: ResultItem) => string) | null {
  if (category === "books" || category === "albums") {
    return (item) => item.subtitle.trim().toLowerCase();
  }
  return null;
}

/**
 * Keeps at most `max` items per creator, in the order they arrived.
 *
 * Returns the original list when capping would leave nothing — a repetitive
 * deck still beats an empty one, and that is the same call `applyDiscoveryContext`
 * makes about damping.
 */
export function capPerCreator(
  items: readonly ResultItem[],
  creatorKey: (item: ResultItem) => string,
  max: number = MAX_PER_CREATOR
): ResultItem[] {
  if (max < 1) return [...items];
  const counts = new Map<string, number>();
  const kept: ResultItem[] = [];
  for (const item of items) {
    const key = creatorKey(item);
    // An unattributable item is not evidence of repetition.
    if (!key) {
      kept.push(item);
      continue;
    }
    const seen = counts.get(key) ?? 0;
    if (seen >= max) continue;
    counts.set(key, seen + 1);
    kept.push(item);
  }
  return kept.length > 0 ? kept : [...items];
}

/** Applies the cap that suits this category, if any. */
export function diversifyDeck(
  items: readonly ResultItem[],
  category: ContentCategory
): ResultItem[] {
  const creatorKey = creatorKeyFor(category);
  if (!creatorKey) return [...items];
  return capPerCreator(items, creatorKey);
}
