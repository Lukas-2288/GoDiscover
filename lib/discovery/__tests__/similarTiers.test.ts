import type { ResultItem } from "../../../types/content";
import {
  SIMILAR_TIER_ORDER,
  classifyCandidate,
  loadNextSimilar,
  nextSimilarTier,
  type SimilarTierDependencies,
} from "../similarTiers";

function item(id: string, traits?: string[]): ResultItem {
  return { id, title: id, subtitle: "", meta: "", traits };
}

const seed = item("hulk", ["Action", "Sci-Fi"]);

function dependencies(
  overrides: Partial<{
    similar: ResultItem[];
    filter: ResultItem[];
    wander: ResultItem[];
  }> = {}
): SimilarTierDependencies {
  return {
    provider: {
      search: jest.fn(async () => []),
      random: jest.fn(async () => []),
      filter: jest.fn(async () => overrides.filter ?? []),
      similar: jest.fn(async () => overrides.similar ?? []),
    },
    wander: jest.fn(async () => overrides.wander ?? []),
  };
}

describe("similar tiers", () => {
  it("orders the ladder from closest to widest", () => {
    expect(SIMILAR_TIER_ORDER).toEqual([
      "close",
      "adjacent",
      "loose",
      "wander",
    ]);
    expect(nextSimilarTier("close")).toBe("adjacent");
    expect(nextSimilarTier("wander")).toBeNull();
  });

  it("places candidates by how much they share with the seed", () => {
    // Provider-native plus two shared traits is as close as it gets.
    expect(
      classifyCandidate(seed, item("iron-man", ["Action", "Sci-Fi"]), true)
    ).toBe("close");
    // Provider-native but little in common is one rung out.
    expect(classifyCandidate(seed, item("drama", ["Drama"]), true)).toBe(
      "adjacent"
    );
    expect(
      classifyCandidate(seed, item("arrival", ["Action", "Sci-Fi"]), false)
    ).toBe("adjacent");
    expect(classifyCandidate(seed, item("solo", ["Action"]), false)).toBe(
      "loose"
    );
    expect(classifyCandidate(seed, item("nothing", []), false)).toBe("wander");
    // No trait data is not evidence of closeness.
    expect(classifyCandidate(seed, item("unknown"), false)).toBe("wander");
  });

  it("returns close matches without widening when they exist", async () => {
    const result = await loadNextSimilar(
      { category: "movies", seed, tier: "close", page: 1 },
      dependencies({ similar: [item("iron-man", ["Action", "Sci-Fi"])] })
    );
    expect(result.tier).toBe("close");
    expect(result.items.map((entry) => entry.id)).toEqual(["iron-man"]);
    expect(result.exhausted).toBe(false);
  });

  // The actual complaint: once close matches run out it repeated instead of
  // widening.
  it("descends to the next tier when the current one is spent", async () => {
    const result = await loadNextSimilar(
      { category: "movies", seed, tier: "close", page: 1 },
      dependencies({
        similar: [], // nothing close or adjacent left
        filter: [item("solo", ["Action"])],
      })
    );
    expect(result.tier).toBe("loose");
    expect(result.items.map((entry) => entry.id)).toEqual(["solo"]);
  });

  it("falls all the way to a wider leap before giving up", async () => {
    const result = await loadNextSimilar(
      { category: "movies", seed, tier: "close", page: 1 },
      dependencies({ similar: [], filter: [], wander: [item("anything")] })
    );
    expect(result.tier).toBe("wander");
    expect(result.items.map((entry) => entry.id)).toEqual(["anything"]);
  });

  it("reports exhaustion rather than looping when every tier is empty", async () => {
    const result = await loadNextSimilar(
      { category: "movies", seed, tier: "close", page: 1 },
      dependencies()
    );
    expect(result.exhausted).toBe(true);
    expect(result.items).toEqual([]);
  });

  it("never repeats the seed or anything already seen", async () => {
    const result = await loadNextSimilar(
      { category: "movies", seed, tier: "close", page: 1 },
      dependencies({
        similar: [
          seed,
          item("iron-man", ["Action", "Sci-Fi"]),
          item("thor", ["Action", "Sci-Fi"]),
        ],
      }),
      new Set(["thor"])
    );
    expect(result.items.map((entry) => entry.id)).toEqual(["iron-man"]);
  });

  it("keeps going when one tier's provider call fails", async () => {
    const deps = dependencies({ wander: [item("anything")] });
    deps.provider.similar = jest.fn(async () => {
      throw new Error("offline");
    });
    deps.provider.filter = jest.fn(async () => {
      throw new Error("offline");
    });

    const result = await loadNextSimilar(
      { category: "movies", seed, tier: "close", page: 1 },
      deps
    );
    expect(result.tier).toBe("wander");
    expect(result.exhausted).toBe(false);
  });

  it("skips the loose tier when the seed has no traits to match on", async () => {
    const untagged = item("mystery");
    const deps = dependencies({ wander: [item("anything")] });
    const result = await loadNextSimilar(
      { category: "movies", seed: untagged, tier: "loose", page: 1 },
      deps
    );
    expect(deps.provider.filter).not.toHaveBeenCalled();
    expect(result.tier).toBe("wander");
  });
});
