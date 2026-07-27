/**
 * Rewrites provider artwork URLs to the size a slot actually renders at.
 *
 * `ResultItem.imageUrl` carries one URL, sized for the largest use — the deck
 * card, which is ~470px wide. Every thumbnail reused it: the Saved Atlas list
 * renders 40x58 and the recents row 150x112, both downloading a 500px-wide
 * poster. That is roughly an order of magnitude more image bytes than needed,
 * and images are the largest payload after the JS bundle.
 *
 * Unknown hosts are returned untouched — a wrong guess would break the image,
 * which is far worse than serving one that is too large.
 */

/** Widths TMDB actually publishes; anything else 404s. */
const TMDB_THUMBNAIL_SIZE = "w185";
const TMDB_CARD_SIZE = "w500";
const TMDB_PATH = /\/t\/p\/(w\d+|original)\//;

/** Open Library cover suffixes: S (~90px), M (~180px), L (~500px). */
const OPEN_LIBRARY_COVER = /(covers\.openlibrary\.org\/b\/id\/\d+)-[SML]\.jpg/;

export type ImageSlot = "thumbnail" | "card";

export function sizedImageUrl(
  url: string | undefined,
  slot: ImageSlot
): string | undefined {
  if (!url) return undefined;
  if (slot === "card") return url;

  if (TMDB_PATH.test(url)) {
    return url.replace(TMDB_PATH, `/t/p/${TMDB_THUMBNAIL_SIZE}/`);
  }
  if (OPEN_LIBRARY_COVER.test(url)) {
    return url.replace(OPEN_LIBRARY_COVER, "$1-M.jpg");
  }
  // Discogs serves pre-sized images from an opaque CDN path, so there is
  // nothing safe to rewrite.
  return url;
}

/** Convenience for the common case. */
export function thumbnailUrl(url: string | undefined): string | undefined {
  return sizedImageUrl(url, "thumbnail");
}

export const TMDB_IMAGE_SIZES = {
  thumbnail: TMDB_THUMBNAIL_SIZE,
  card: TMDB_CARD_SIZE,
} as const;
