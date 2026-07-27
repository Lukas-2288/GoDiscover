/**
 * A small TTL cache with in-flight deduplication, shared by the provider
 * adapters.
 *
 * Nothing was cached before, so re-opening a detail, pressing Similar on the
 * same seed twice, or the map firing overlapping trait queries all paid full
 * network cost every time. Two separate wins:
 *
 * - **Deduplication** collapses concurrent identical requests into one. The map
 *   queries four categories at once and the deck tops up while a detail loads,
 *   so this matters even on a first visit.
 * - **TTL caching** makes repeat actions within a session effectively instant.
 *
 * Deliberately not cached: failures, so a transient error is retried rather
 * than remembered. Randomise is unaffected because it varies the page in the
 * URL, so its keys genuinely differ — the randomness is preserved.
 */

type Entry = {
  value: unknown;
  expiresAt: number;
};

/** Provider metadata is effectively static; minutes of staleness is invisible. */
export const DEFAULT_TTL_MS = 5 * 60 * 1000;

/** Bounded so a long session cannot grow the cache without limit. */
export const MAX_ENTRIES = 120;

const entries = new Map<string, Entry>();
const inFlight = new Map<string, Promise<unknown>>();

function evictIfNeeded(): void {
  if (entries.size <= MAX_ENTRIES) return;
  // Map preserves insertion order, so the oldest key is the first.
  const oldest = entries.keys().next();
  if (!oldest.done) entries.delete(oldest.value);
}

export function readCachedRequest<T>(key: string, now = Date.now()): T | undefined {
  const entry = entries.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= now) {
    entries.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export async function cachedRequest<T>(
  key: string,
  load: () => Promise<T>,
  { ttlMs = DEFAULT_TTL_MS, now = Date.now }: { ttlMs?: number; now?: () => number } = {}
): Promise<T> {
  const cached = readCachedRequest<T>(key, now());
  if (cached !== undefined) return cached;

  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T>;

  const request = load()
    .then((value) => {
      // A `undefined` result would be indistinguishable from a cache miss.
      if (value !== undefined) {
        entries.set(key, { value, expiresAt: now() + ttlMs });
        evictIfNeeded();
      }
      return value;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, request);
  return request;
}

export function clearRequestCache(): void {
  entries.clear();
  inFlight.clear();
}

export function requestCacheSize(): number {
  return entries.size;
}
