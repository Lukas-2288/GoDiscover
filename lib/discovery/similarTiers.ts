import type { ContentCategory, ResultItem } from "../../types/content";
import type { DiscoveryProvider } from "./loadDiscovery";

/**
 * How far from the seed a Similar result is allowed to be.
 *
 * Similar used to ask the provider for page 1 and take the top ten, every time.
 * Same seed, same ten results, forever — and once those ran out there was
 * nowhere to go, so it looped. The ladder gives it somewhere to go: exhaust the
 * closest matches, then widen, and say so plainly rather than repeating.
 */
export type SimilarTier = "close" | "adjacent" | "loose" | "wander";

export const SIMILAR_TIER_ORDER: readonly SimilarTier[] = [
  "close",
  "adjacent",
  "loose",
  "wander",
];

export const SIMILAR_TIER_LABELS: Readonly<Record<SimilarTier, string>> = {
  close: "Very similar",
  adjacent: "Similar",
  loose: "Loosely related",
  wander: "A wider leap",
};

/** Shown when even the widest tier is spent, instead of looping. */
export const SIMILAR_EXHAUSTED_MESSAGE =
  "That's everything close to this one. Try Randomize for a fresh direction.";

export type SimilarTierRequest = {
  category: ContentCategory;
  seed: ResultItem;
  tier: SimilarTier;
  page: number;
};

export type SimilarTierResult = {
  items: ResultItem[];
  tier: SimilarTier;
  /** True when no tier has anything left to offer. */
  exhausted: boolean;
};

export type SimilarTierDependencies = {
  provider: DiscoveryProvider;
  /**
   * Broad in-category fallback for `wander`, deliberately not seeded by the
   * item — that is the point of the widest rung.
   */
  wander(page: number): Promise<ResultItem[]>;
};

export function nextSimilarTier(tier: SimilarTier): SimilarTier | null {
  const index = SIMILAR_TIER_ORDER.indexOf(tier);
  const next = SIMILAR_TIER_ORDER[index + 1];
  return next ?? null;
}

/**
 * Traits shared with the seed decide which rung a candidate belongs on. A
 * candidate with no trait data cannot be placed above `loose`, because there is
 * no evidence it is any closer.
 */
export function classifyCandidate(
  seed: ResultItem,
  candidate: ResultItem,
  fromProviderSimilar: boolean
): SimilarTier {
  const seedTraits = new Set(seed.traits ?? []);
  const shared = (candidate.traits ?? []).filter((trait) => seedTraits.has(trait));
  if (fromProviderSimilar && shared.length >= 2) return "close";
  if (fromProviderSimilar) return "adjacent";
  if (shared.length >= 2) return "adjacent";
  if (shared.length === 1) return "loose";
  return "wander";
}

/**
 * Fetches one rung. `close` and `adjacent` both come from the provider's own
 * similar endpoint but are separated by how much they share with the seed;
 * `loose` re-queries by shared traits; `wander` leaves the seed behind.
 */
export async function loadSimilarTier(
  request: SimilarTierRequest,
  dependencies: SimilarTierDependencies,
  exclude: ReadonlySet<string> = new Set()
): Promise<ResultItem[]> {
  const { seed, tier, page } = request;
  const context = { page, presentIds: exclude };

  if (tier === "wander") {
    return dropExcluded(await dependencies.wander(page), exclude, seed);
  }

  if (tier === "loose") {
    const traits = seed.traits ?? [];
    if (traits.length === 0) return [];
    return dropExcluded(
      await dependencies.provider.filter(traits, context),
      exclude,
      seed
    );
  }

  const similar = await dependencies.provider.similar(seed, context);
  const placed = similar.filter(
    (candidate) => classifyCandidate(seed, candidate, true) === tier
  );
  return dropExcluded(placed, exclude, seed);
}

function dropExcluded(
  items: readonly ResultItem[],
  exclude: ReadonlySet<string>,
  seed: ResultItem
): ResultItem[] {
  return items.filter((item) => item.id !== seed.id && !exclude.has(item.id));
}

/**
 * Walks the ladder until something is found. Each rung is paged before the next
 * is tried, so the close matches are genuinely spent before the scope widens.
 */
export async function loadNextSimilar(
  request: SimilarTierRequest,
  dependencies: SimilarTierDependencies,
  exclude: ReadonlySet<string> = new Set()
): Promise<SimilarTierResult> {
  let tier: SimilarTier | null = request.tier;
  let page = request.page;

  while (tier) {
    let items: ResultItem[] = [];
    try {
      items = await loadSimilarTier(
        { ...request, tier, page },
        dependencies,
        exclude
      );
    } catch {
      // One rung failing should not strand the user — try the next.
      items = [];
    }
    if (items.length > 0) return { items, tier, exhausted: false };
    tier = nextSimilarTier(tier);
    // Each rung starts from its own first page.
    page = 1;
  }

  return { items: [], tier: "wander", exhausted: true };
}
