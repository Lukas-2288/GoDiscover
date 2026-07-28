import type { ContentCategory, ResultItem } from "../../types/content";

export type DiscoveryActionMode =
  | "search"
  | "filter"
  | "randomize"
  | "fresh"
  | "underground";
export type DiscoveryMode = DiscoveryActionMode | "similar";

export type DiscoveryRequestIdentity = {
  id: number;
  category: ContentCategory;
};

export type DiscoveryLoadInput =
  | { category: ContentCategory; mode: "randomize" }
  | { category: ContentCategory; mode: "search"; query: string }
  | { category: ContentCategory; mode: "filter"; filters: readonly string[] }
  // Both carry no payload of their own: what "new" and "underground" mean is
  // fixed per provider, so the deck's own page cursor is the only variable.
  // That is also what lets a top-up replay `retryInput` unchanged.
  | { category: ContentCategory; mode: "fresh" }
  | { category: ContentCategory; mode: "underground" }
  | { category: ContentCategory; mode: "similar"; seed: ResultItem };

export type SimilarContext = {
  sourceId: string;
  sourceTitle: string;
  /**
   * How far from the seed the current results are. Shown on the deck so
   * "Loosely related" is honest about having widened rather than pretending
   * everything is a close match.
   */
  tier?: import("./similarTiers").SimilarTier;
  /** True once even the widest tier is spent. */
  exhausted?: boolean;
};

/**
 * What the deck already knows when it asks for more.
 *
 * Carries the memory that "Not for me" builds up: items to never show again,
 * and traits rejected often enough to steer away from. Threaded through
 * `loadDiscovery` so providers can apply it at the query level where the API
 * supports it, with a post-filter as the floor.
 */
export type DiscoveryLoadContext = {
  rejectedIds?: ReadonlySet<string>;
  dampedTraits?: readonly string[];
  /** Items already in the deck, so a top-up does not repeat them. */
  presentIds?: ReadonlySet<string>;
  page?: number;
  /**
   * Rung of the similarity ladder to start from. Each Similar top-up resumes
   * where the last left off, so the scope widens instead of repeating the same
   * ten results.
   */
  similarTier?: import("./similarTiers").SimilarTier;
  /** Receives the rung actually used, so the deck can show and resume it. */
  onSimilarTier?(tier: import("./similarTiers").SimilarTier, exhausted: boolean): void;
};
