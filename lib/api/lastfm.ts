import { cachedRequest } from './requestCache';

/**
 * Last.fm's similar-artist graph, used to steer music recommendations.
 *
 * Discogs is a catalogue, not a recommender: the only thing it can say about
 * two records is that they carry the same genre or style tag. That is how a
 * 2025 country-pop single returned a 1975 trucker album — both are tagged
 * Country, and Discogs has no further opinion.
 *
 * Last.fm's `artist.getSimilar` is built from listening data, so it does have
 * one. It is entirely optional: without EXPO_PUBLIC_LASTFM_API_KEY every
 * function here returns nothing and the Discogs path runs unchanged.
 */

const API_BASE = 'https://ws.audioscrobbler.com/2.0/';

/**
 * Read at call time rather than module load. Metro inlines EXPO_PUBLIC_* as a
 * literal either way, and it keeps the key togglable from a test.
 */
function apiKey(): string | undefined {
  const key = process.env.EXPO_PUBLIC_LASTFM_API_KEY;
  return key && key.trim() ? key.trim() : undefined;
}

export function hasLastfmKey(): boolean {
  return apiKey() !== undefined;
}

type SimilarArtistsResponse = {
  similarartists?: { artist?: { name?: string }[] };
  // Last.fm answers 200 with an error body rather than an HTTP status.
  error?: number;
  message?: string;
};

/**
 * Discogs disambiguates duplicate artist names with a numeric suffix —
 * "Nirvana (2)", "Eden (5)". Last.fm has never heard of those.
 */
export function stripDiscogsSuffix(name: string): string {
  return name.replace(/\s*\(\d+\)\s*$/, '').trim();
}

async function lastfm<T>(
  method: string,
  params: Record<string, string | number>,
  options: { ttlMs?: number } = {}
): Promise<T | null> {
  const key = apiKey();
  if (!key) return null;
  const qs = new URLSearchParams({
    method,
    api_key: key,
    format: 'json',
    ...Object.fromEntries(
      Object.entries(params).map(([name, value]) => [name, String(value)])
    ),
  }).toString();
  // The key is in the query string, so keep it out of the cache key.
  const cacheKey = `lastfm:${method}:${JSON.stringify(params)}`;
  return cachedRequest(
    cacheKey,
    async () => {
      const res = await fetch(`${API_BASE}?${qs}`);
      if (!res.ok) throw new Error(`Last.fm ${res.status}`);
      return res.json() as Promise<T>;
    },
    options.ttlMs === undefined ? undefined : { ttlMs: options.ttlMs }
  );
}

/**
 * Listener counts move over months, not minutes, and Underground pays for
 * every one of them individually — so they are worth remembering far longer
 * than the default.
 */
const LISTENER_TTL_MS = 24 * 60 * 60 * 1000;

type ArtistInfoResponse = {
  artist?: { stats?: { listeners?: string; playcount?: string } };
  error?: number;
  message?: string;
};

/**
 * How many distinct people have listened to this artist, or null when the
 * answer is unavailable for any reason.
 *
 * Null and zero mean different things and the caller has to tell them apart:
 * zero is a real artist nobody plays, null is "Last.fm did not say", and
 * treating the second as the first would silently drop artists for being
 * unpopular when the request simply failed.
 */
export async function artistListeners(artist: string): Promise<number | null> {
  const query = stripDiscogsSuffix(artist);
  if (!query) return null;
  let data: ArtistInfoResponse | null;
  try {
    data = await lastfm<ArtistInfoResponse>(
      'artist.getinfo',
      { artist: query, autocorrect: 1 },
      { ttlMs: LISTENER_TTL_MS }
    );
  } catch {
    return null;
  }
  if (!data || data.error) return null;
  const listeners = Number.parseInt(data.artist?.stats?.listeners ?? '', 10);
  return Number.isFinite(listeners) ? listeners : null;
}

type TagArtistsResponse = {
  topartists?: { artist?: { name?: string }[] };
  error?: number;
  message?: string;
};

/**
 * Artists carrying a tag, most-tagged first.
 *
 * Note what this does *not* return: listener counts. No Last.fm listing
 * endpoint includes them, which is why a listener band cannot be queried and
 * has to be checked an artist at a time.
 */
export async function topArtistsByTag(
  tag: string,
  { limit = 50, page = 1 }: { limit?: number; page?: number } = {}
): Promise<string[]> {
  if (!tag.trim()) return [];
  let data: TagArtistsResponse | null;
  try {
    data = await lastfm<TagArtistsResponse>('tag.gettopartists', {
      tag: tag.trim(),
      limit,
      page,
    });
  } catch {
    return [];
  }
  if (!data || data.error) return [];
  const names = (data.topartists?.artist ?? [])
    .map((entry) => entry.name?.trim())
    .filter((name): name is string => Boolean(name));
  return [...new Set(names)];
}

/**
 * Names of artists Last.fm considers close to this one, most similar first.
 *
 * Returns an empty list rather than throwing for every failure mode — no key,
 * network error, unknown artist — because every caller's answer to all three is
 * the same: fall through to Discogs.
 */
export async function similarArtistNames(
  artist: string,
  limit = 8
): Promise<string[]> {
  const query = stripDiscogsSuffix(artist);
  if (!query) return [];
  let data: SimilarArtistsResponse | null;
  try {
    data = await lastfm<SimilarArtistsResponse>('artist.getsimilar', {
      artist: query,
      autocorrect: 1,
      limit,
    });
  } catch {
    return [];
  }
  if (!data || data.error) return [];
  const names = (data.similarartists?.artist ?? [])
    .map((entry) => entry.name?.trim())
    .filter((name): name is string => Boolean(name))
    // An artist is not similar to itself, whatever autocorrect decided.
    .filter((name) => name.toLowerCase() !== query.toLowerCase());
  return [...new Set(names)].slice(0, limit);
}
