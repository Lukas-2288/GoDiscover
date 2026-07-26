import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ContentCategory, ResultItem } from '../../types/content';
import { assertOwnerUnchanged, ownerScopedKey } from './owner';

/**
 * What "Not for me" remembers.
 *
 * Before this existed the button popped the card and recorded nothing, so
 * rejecting a superhero movie had no effect on the next batch — the deck would
 * hand back the same blockbusters TMDB sorts to the top. A rejection now does
 * two things: the exact item never reappears, and once a genre is rejected
 * enough times it stops being offered.
 */
export type Rejection = {
  category: ContentCategory;
  id: string;
  traits: string[];
  rejectedAt: number;
};

const REJECTIONS_PREFIX = 'godiscover:rejections:v1';

/** Oldest entries are dropped past this. Roughly a year of heavy use. */
const MAX_REJECTIONS = 500;

/**
 * How many rejections of one trait, inside the window, before it is damped.
 * Two is noise — a third is a pattern worth acting on.
 */
export const DAMP_THRESHOLD = 3;

/** Tastes change; a genre rejected months ago should not be banned forever. */
export const DAMP_WINDOW_MS = 60 * 24 * 60 * 60 * 1000;

/**
 * Never damp away so much that a category cannot fill a deck. Past this the
 * oldest damped traits are released.
 */
export const MAX_DAMPED_TRAITS = 3;

export function rejectionsStorageKey(ownerId: string | null): string {
  return ownerScopedKey(REJECTIONS_PREFIX, ownerId);
}

function itemKey(category: ContentCategory, id: string): string {
  return `${category}:${id}`;
}

// ── Pure helpers ────────────────────────────────────────────────────────────
// Kept free of storage so the damping rules can be tested directly.

/** Ids to exclude from the next deck for this category. */
export function rejectedIdsFor(
  rejections: readonly Rejection[],
  category: ContentCategory
): Set<string> {
  const ids = new Set<string>();
  for (const rejection of rejections) {
    if (rejection.category === category) ids.add(rejection.id);
  }
  return ids;
}

/**
 * Traits rejected often enough, recently enough, to steer away from.
 *
 * Ordered by how firmly they were rejected — count first, then recency — so
 * that when the cap trims the list the strongest signals survive.
 */
export function dampedTraitsFor(
  rejections: readonly Rejection[],
  category: ContentCategory,
  now: number = Date.now()
): string[] {
  const counts = new Map<string, { count: number; latest: number }>();
  for (const rejection of rejections) {
    if (rejection.category !== category) continue;
    if (now - rejection.rejectedAt > DAMP_WINDOW_MS) continue;
    for (const trait of rejection.traits) {
      const current = counts.get(trait) ?? { count: 0, latest: 0 };
      counts.set(trait, {
        count: current.count + 1,
        latest: Math.max(current.latest, rejection.rejectedAt),
      });
    }
  }
  return [...counts.entries()]
    .filter(([, stats]) => stats.count >= DAMP_THRESHOLD)
    .sort(
      ([leftTrait, left], [rightTrait, right]) =>
        right.count - left.count ||
        right.latest - left.latest ||
        leftTrait.localeCompare(rightTrait)
    )
    .slice(0, MAX_DAMPED_TRAITS)
    .map(([trait]) => trait);
}

/** Drops items the user already rejected, preserving order. */
export function withoutRejected<T extends { id: string }>(
  items: readonly T[],
  rejectedIds: ReadonlySet<string>
): T[] {
  return items.filter((item) => !rejectedIds.has(item.id));
}

// ── Owner-scoped storage ────────────────────────────────────────────────────

async function read(ownerId: string | null): Promise<Rejection[]> {
  try {
    const raw = await AsyncStorage.getItem(rejectionsStorageKey(ownerId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is Rejection =>
        entry !== null &&
        typeof entry === 'object' &&
        typeof entry.id === 'string' &&
        typeof entry.category === 'string' &&
        typeof entry.rejectedAt === 'number' &&
        Array.isArray(entry.traits)
    );
  } catch {
    return [];
  }
}

async function write(
  ownerId: string | null,
  rejections: readonly Rejection[]
): Promise<void> {
  // Newest first, so the cap drops the oldest signal rather than the freshest.
  const trimmed = [...rejections]
    .sort((left, right) => right.rejectedAt - left.rejectedAt)
    .slice(0, MAX_REJECTIONS);
  await AsyncStorage.setItem(
    rejectionsStorageKey(ownerId),
    JSON.stringify(trimmed)
  );
}

export async function listRejections(
  ownerId: string | null
): Promise<Rejection[]> {
  return read(ownerId);
}

export async function recordRejection(
  ownerId: string | null,
  category: ContentCategory,
  item: ResultItem,
  rejectedAt: number = Date.now()
): Promise<Rejection[]> {
  await assertOwnerUnchanged(ownerId);
  const current = await read(ownerId);
  await assertOwnerUnchanged(ownerId);

  const key = itemKey(category, item.id);
  const next: Rejection[] = [
    ...current.filter(
      (rejection) => itemKey(rejection.category, rejection.id) !== key
    ),
    { category, id: item.id, traits: item.traits ?? [], rejectedAt },
  ];
  await write(ownerId, next);
  return next;
}

/**
 * Undoing a skip must remove the rejection too, or the card comes back while
 * the exclusion silently keeps steering future results.
 */
export async function removeRejection(
  ownerId: string | null,
  category: ContentCategory,
  id: string
): Promise<Rejection[]> {
  await assertOwnerUnchanged(ownerId);
  const current = await read(ownerId);
  await assertOwnerUnchanged(ownerId);

  const key = itemKey(category, id);
  const next = current.filter(
    (rejection) => itemKey(rejection.category, rejection.id) !== key
  );
  await write(ownerId, next);
  return next;
}

export async function clearRejections(ownerId: string | null): Promise<void> {
  await AsyncStorage.removeItem(rejectionsStorageKey(ownerId));
}
