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
  params: Record<string, string | number>
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
  return cachedRequest(cacheKey, async () => {
    const res = await fetch(`${API_BASE}?${qs}`);
    if (!res.ok) throw new Error(`Last.fm ${res.status}`);
    return res.json() as Promise<T>;
  });
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
