import type { ResultItem } from '../../types/content';
import {
  UNDERGROUND_FIRST_TAG_PAGE,
  UNDERGROUND_LOOKUP_CONCURRENCY,
  UNDERGROUND_MAX_LOOKUPS,
  UNDERGROUND_TAGS,
  UNDERGROUND_TARGET_RESULTS,
  chunksOf,
  formatListeners,
  isUndergroundListenerCount,
} from '../discovery/undergroundMode';
import { artistsByName, mastersByArtistNames, releaseToResult } from './discogs';
import { artistListeners, topArtistsByTag } from './lastfm';

/**
 * Artists inside a listener band — known enough to be real, obscure enough to
 * be worth surfacing.
 *
 * The shape of this file is dictated by one API fact: **no Last.fm listing
 * endpoint returns listener counts.** Not `tag.getTopArtists`, not
 * `geo.getTopArtists`. So a band cannot be queried; it can only be found by
 * fetching candidates and asking about each one individually, which is why
 * this is the slowest thing in the app and why every constant in
 * `lib/discovery/undergroundMode.ts` exists to bound that cost.
 */

export type UndergroundParams = {
  page?: number;
  /** Injectable so a test can pin the tag instead of rolling for it. */
  tag?: string;
};

function pickTag(params: UndergroundParams): string {
  if (params.tag) return params.tag;
  return UNDERGROUND_TAGS[Math.floor(Math.random() * UNDERGROUND_TAGS.length)];
}

/**
 * Names inside the band, most-tagged first, capped by `UNDERGROUND_MAX_LOOKUPS`.
 *
 * Verifies in fixed chunks rather than a worker pool so it can stop the moment
 * enough have been found — on a good tag that is often the first chunk or two,
 * and the calls not made are the entire saving.
 */
async function undergroundArtistNames(
  params: UndergroundParams
): Promise<{ name: string; listeners: number }[]> {
  const tag = pickTag(params);
  // Page 1 of a tag is its household names. Reading deeper is what makes this
  // cheap: far more of what comes back is already near the band.
  const page = UNDERGROUND_FIRST_TAG_PAGE + ((params.page ?? 1) - 1);
  const candidates = (await topArtistsByTag(tag, { limit: 50, page })).slice(
    0,
    UNDERGROUND_MAX_LOOKUPS
  );

  const found: { name: string; listeners: number }[] = [];
  for (const chunk of chunksOf(candidates, UNDERGROUND_LOOKUP_CONCURRENCY)) {
    const counts = await Promise.all(
      chunk.map(async (name) => ({ name, listeners: await artistListeners(name) }))
    );
    for (const entry of counts) {
      if (!isUndergroundListenerCount(entry.listeners)) continue;
      found.push({ name: entry.name, listeners: entry.listeners as number });
    }
    if (found.length >= UNDERGROUND_TARGET_RESULTS) break;
  }
  return found.slice(0, UNDERGROUND_TARGET_RESULTS);
}

export async function undergroundArtists(
  params: UndergroundParams = {}
): Promise<ResultItem[]> {
  const found = await undergroundArtistNames(params);
  if (!found.length) return [];
  const metaByName = new Map(
    found.map((entry) => [entry.name, formatListeners(entry.listeners)])
  );
  // `requireMatch` because an artist Discogs has never heard of has no detail
  // page to open — a dead card is worse than a shorter deck.
  return artistsByName(
    found.map((entry) => entry.name),
    { requireMatch: true, metaByName }
  );
}

export async function undergroundAlbums(
  params: UndergroundParams = {}
): Promise<ResultItem[]> {
  const found = await undergroundArtistNames(params);
  if (!found.length) return [];
  // Two releases each from the first few, rather than one each from all of
  // them: a deck of albums by one artist you have not heard of is a better
  // introduction than ten unrelated singles.
  const releases = await mastersByArtistNames(
    found.slice(0, 5).map((entry) => entry.name),
    2
  );
  return releases.slice(0, 10).map(releaseToResult);
}
