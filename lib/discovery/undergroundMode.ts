import type { ContentCategory } from "../../types/content";

/**
 * What counts as "underground", kept apart from the code that fetches it so
 * the numbers can be argued about and tested without a network.
 *
 * The request was "artists with 5,000 or greater streams". Two things had to
 * change on the way in. Streams do not exist here — Discogs is a release
 * catalogue with no listening data at all, and Last.fm listener counts are the
 * only real signal available. And a floor alone does not mean underground: at
 * 5,000-and-up the answer is mostly Taylor Swift, because everyone famous
 * clears that bar too. It takes a ceiling as well.
 */

/** Below this an artist is more likely mis-tagged than genuinely obscure. */
export const UNDERGROUND_MIN_LISTENERS = 5_000;
/** Above this an artist is findable without help, which is the whole point. */
export const UNDERGROUND_MAX_LISTENERS = 100_000;

/** Enough for a deck plus a couple of refills before paging further. */
export const UNDERGROUND_TARGET_RESULTS = 10;

/**
 * Ceiling on listener lookups per request.
 *
 * Every candidate costs its own Last.fm call — no endpoint returns listener
 * counts in a listing — so this is the one lever on how slow the button feels.
 * The whole request shares the 20s discovery timeout with the Discogs
 * resolution that follows it.
 */
export const UNDERGROUND_MAX_LOOKUPS = 24;

/**
 * Concurrent lookups. Last.fm allows roughly five requests a second per key
 * and this app has no rate limiting of its own, so the limit is enforced by
 * simply not asking faster.
 */
export const UNDERGROUND_LOOKUP_CONCURRENCY = 4;

/**
 * Where in a tag's ranking to start reading.
 *
 * Page 1 of any tag is its household names, which are exactly what this mode
 * exists to skip. The interesting band sits deeper, and starting there means
 * far more candidates survive per lookup paid for.
 */
export const UNDERGROUND_FIRST_TAG_PAGE = 4;

export function isUndergroundListenerCount(listeners: number | null): boolean {
  if (listeners === null) return false;
  return (
    listeners >= UNDERGROUND_MIN_LISTENERS &&
    listeners <= UNDERGROUND_MAX_LISTENERS
  );
}

/**
 * Only music. Last.fm is the sole source of listener counts in this app and it
 * knows nothing about films or books, so there is no honest equivalent to
 * offer there — hence no button rather than a button that disappoints.
 */
export function supportsUnderground(category: ContentCategory): boolean {
  return category === "artists" || category === "albums";
}

/** "12.4K listeners" — fills the `meta` line, which artists leave empty. */
export function formatListeners(listeners: number): string {
  const label =
    listeners >= 1_000
      ? `${(listeners / 1_000).toFixed(listeners >= 10_000 ? 0 : 1)}K`
      : String(listeners);
  return `${label} listeners`;
}

/**
 * Last.fm tag for one of the app's genre labels.
 *
 * The app's labels are display copy — "Hip-Hop / Rap", "R&B / Soul" — and
 * Last.fm's tags are lowercase slugs. Passing the label straight through
 * returns nothing at all, silently.
 */
export const LASTFM_TAG_MAP: Record<string, string> = {
  Pop: "pop",
  Rock: "rock",
  "Hip-Hop / Rap": "hip-hop",
  "R&B / Soul": "soul",
  "Electronic / EDM": "electronic",
  Country: "country",
  Jazz: "jazz",
  Classical: "classical",
  Metal: "metal",
  "Indie / Alternative": "indie",
  Latin: "latin",
  "K-Pop": "k-pop",
  Folk: "folk",
  Reggae: "reggae",
  Blues: "blues",
};

export const UNDERGROUND_TAGS: readonly string[] = Object.values(LASTFM_TAG_MAP);

/** Splits into fixed-size groups so lookups can stop early between them. */
export function chunksOf<T>(items: readonly T[], size: number): T[][] {
  if (size < 1) return [[...items]];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
