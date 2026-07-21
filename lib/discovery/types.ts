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
