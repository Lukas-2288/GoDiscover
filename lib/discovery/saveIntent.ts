import type { ContentCategory, ResultItem } from "../../types/content";
import type { DiscoveryLoadContext, DiscoveryLoadInput } from "./types";

/**
 * What the user wants after saving something.
 *
 * Saving a Captain America film used to guarantee more superhero films: the
 * orbit scores provider-native similar results at 0.9 against 0.66–0.68 for
 * trait matches, so near-clones filled every slot. Liking one thing is not the
 * same as wanting only that thing, so the choice is now explicit.
 */
export type SaveIntent = "more-like-this" | "something-different";

export const SAVE_INTENT_LABELS: Readonly<Record<SaveIntent, string>> = {
  "more-like-this": "More like this",
  "something-different": "Something different",
};

export const DEFAULT_SAVE_INTENT: SaveIntent = "more-like-this";

/**
 * Turns a saved item plus an intent into the next request.
 *
 * "More like this" seeds Similar from the item. "Something different" stays in
 * the category but steers away from what was just saved — the inverse of the
 * trait matching the orbit uses to find near-clones.
 */
export function requestForSaveIntent(
  category: ContentCategory,
  item: ResultItem,
  intent: SaveIntent
): DiscoveryLoadInput {
  if (intent === "more-like-this") {
    return { category, mode: "similar", seed: item };
  }
  return { category, mode: "randomize" };
}

/**
 * Context for the request above. For "something different" the saved item's own
 * traits are damped for this request only — a deliberate one-off steer, not a
 * standing preference like a rejection.
 */
export function contextForSaveIntent(
  item: ResultItem,
  intent: SaveIntent,
  base: DiscoveryLoadContext = {}
): DiscoveryLoadContext {
  if (intent === "more-like-this") return base;
  const traits = item.traits ?? [];
  if (traits.length === 0) return base;
  return {
    ...base,
    dampedTraits: [...new Set([...(base.dampedTraits ?? []), ...traits])],
  };
}

const STORAGE_KEY_PREFIX = "godiscover:save-intent:v1";

export function saveIntentStorageKey(category: ContentCategory): string {
  return `${STORAGE_KEY_PREFIX}:${category}`;
}

export function isSaveIntent(value: unknown): value is SaveIntent {
  return value === "more-like-this" || value === "something-different";
}

type IntentCandidate = {
  category: ContentCategory;
  reason: { kind: string };
};

/**
 * Re-shapes orbit recommendations for the chosen intent.
 *
 * `findMapRecommendations` scores provider-native similars at 0.9 against
 * 0.66–0.68 for trait matches, so they take every slot — which is exactly the
 * near-clone problem. For "something different" they are dropped and other
 * categories come first, leaving the trait-based cross-media matches the map
 * was designed around.
 *
 * If that leaves nothing, the original list is returned: showing near-clones
 * beats showing an empty orbit.
 */
export function applySaveIntent<T extends IntentCandidate>(
  recommendations: readonly T[],
  seedCategory: ContentCategory,
  intent: SaveIntent
): T[] {
  if (intent === "more-like-this") return [...recommendations];

  const widened = recommendations.filter(
    (candidate) => candidate.reason.kind !== "provider-similar"
  );
  if (widened.length === 0) return [...recommendations];

  return [...widened].sort((left, right) => {
    const leftSame = left.category === seedCategory ? 1 : 0;
    const rightSame = right.category === seedCategory ? 1 : 0;
    return leftSame - rightSame;
  });
}
