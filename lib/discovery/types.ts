import type { ContentCategory, ResultItem } from "../../types/content";

export type DiscoveryActionMode = "search" | "filter" | "randomize";
export type DiscoveryMode = DiscoveryActionMode | "similar";

export type DiscoveryRequestIdentity = {
  id: number;
  category: ContentCategory;
};

export type DiscoveryLoadInput =
  | { category: ContentCategory; mode: "randomize" }
  | { category: ContentCategory; mode: "search"; query: string }
  | { category: ContentCategory; mode: "filter"; filters: readonly string[] }
  | { category: ContentCategory; mode: "similar"; seed: ResultItem };

export type SimilarContext = {
  sourceId: string;
  sourceTitle: string;
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
};
