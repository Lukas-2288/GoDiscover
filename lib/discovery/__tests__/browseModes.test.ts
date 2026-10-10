import type { ResultItem } from "../../../types/content";
import { loadDiscovery, type DiscoveryProviderRegistry } from "../loadDiscovery";
import { emptyStateAction } from "../emptyState";
import {
  chunksOf,
  formatListeners,
  isUndergroundListenerCount,
  supportsUnderground,
  UNDERGROUND_MAX_LISTENERS,
  UNDERGROUND_MIN_LISTENERS,
} from "../undergroundMode";

/**
 * Surprise Me is deliberately unfiltered and is the only way into a deck. These
 * cover the two modes that express an intent instead — "what came out lately"
 * and "who is worth finding before everyone else" — and the seams where a new
 * mode silently becomes randomize if nobody routes it.
 */

function item(id: string, traits?: string[]): ResultItem {
  return { id, title: id, subtitle: "", meta: "", traits };
}

function registry(
  overrides: Partial<Record<string, unknown>> = {}
): DiscoveryProviderRegistry {
  const provider = () => ({
    search: jest.fn(async () => [item("searched")]),
    random: jest.fn(async () => [item("random")]),
    filter: jest.fn(async () => [item("filtered")]),
    similar: jest.fn(async () => [item("similar")]),
    fresh: jest.fn(async () => [item("fresh")]),
    underground: jest.fn(async () => [item("underground")]),
    ...overrides,
  });
  return {
    movies: provider(),
    books: provider(),
    artists: provider(),
    albums: provider(),
  } as unknown as DiscoveryProviderRegistry;
}

describe("routing the browse modes", () => {
  it("sends What's New to the selected category alone", async () => {
    const providers = registry();
    await expect(
      loadDiscovery({ category: "movies", mode: "fresh" }, providers)
    ).resolves.toEqual([item("fresh")]);
    expect(providers.movies.fresh).toHaveBeenCalledTimes(1);
    expect(providers.books.fresh).not.toHaveBeenCalled();
    expect(providers.movies.random).not.toHaveBeenCalled();
  });

  it("sends Underground to the selected category alone", async () => {
    const providers = registry();
    await expect(
      loadDiscovery({ category: "artists", mode: "underground" }, providers)
    ).resolves.toEqual([item("underground")]);
    expect(providers.artists.underground).toHaveBeenCalledTimes(1);
    expect(providers.artists.random).not.toHaveBeenCalled();
  });

  // The UI never offers a mode its category cannot serve, so reaching this is
  // a wiring mistake — and it should say so rather than quietly shuffling.
  it("refuses a mode the provider has no method for", async () => {
    const providers = registry({ underground: undefined });
    await expect(
      loadDiscovery({ category: "movies", mode: "underground" }, providers)
    ).rejects.toThrow(/Underground is not available/);
    expect(providers.movies.random).not.toHaveBeenCalled();
  });

  it("still requires a seed for Similar", async () => {
    const providers = registry();
    await expect(
      loadDiscovery(
        { category: "movies", mode: "similar" } as never,
        providers
      )
    ).rejects.toThrow("Similar requires a source item");
  });

  it("drops damped traits from What's New", async () => {
    const providers = registry({
      fresh: jest.fn(async () => [
        item("iron-man", ["Action"]),
        item("arrival", ["Sci-Fi"]),
      ]),
    });
    const loaded = await loadDiscovery(
      { category: "movies", mode: "fresh" },
      providers,
      { dampedTraits: ["Action"] }
    );
    expect(loaded.map((entry) => entry.id)).toEqual(["arrival"]);
  });

  // Underground pays a Last.fm lookup per candidate, so unlike the other
  // damped modes it must not re-fetch when damping empties the result.
  it("does not re-fetch Underground when damping would empty it", async () => {
    const fetchUnderground = jest.fn(async () => [item("only", ["Action"])]);
    const providers = registry({ underground: fetchUnderground });
    const loaded = await loadDiscovery(
      { category: "artists", mode: "underground" },
      providers,
      { dampedTraits: ["Action"] }
    );
    expect(fetchUnderground).toHaveBeenCalledTimes(1);
    // Damping yields rather than handing back an empty deck.
    expect(loaded.map((entry) => entry.id)).toEqual(["only"]);
  });

  it("still removes rejected items from both modes", async () => {
    const providers = registry({
      fresh: jest.fn(async () => [item("seen"), item("new")]),
      underground: jest.fn(async () => [item("seen"), item("new")]),
    });
    const context = { rejectedIds: new Set(["seen"]) };
    await expect(
      loadDiscovery({ category: "albums", mode: "fresh" }, providers, context)
    ).resolves.toEqual([item("new")]);
    await expect(
      loadDiscovery({ category: "albums", mode: "underground" }, providers, context)
    ).resolves.toEqual([item("new")]);
  });
});

describe("the underground band", () => {
  it.each([
    ["below the floor", UNDERGROUND_MIN_LISTENERS - 1, false],
    ["exactly the floor", UNDERGROUND_MIN_LISTENERS, true],
    ["mid band", 40_000, true],
    ["exactly the ceiling", UNDERGROUND_MAX_LISTENERS, true],
    ["above the ceiling", UNDERGROUND_MAX_LISTENERS + 1, false],
  ])("rejects or accepts %s", (_label, listeners, expected) => {
    expect(isUndergroundListenerCount(listeners)).toBe(expected);
  });

  // A failed lookup is not the same as an unpopular artist, and conflating
  // them would drop real artists whenever Last.fm hiccuped.
  it("treats an unknown listener count as not qualifying", () => {
    expect(isUndergroundListenerCount(null)).toBe(false);
  });

  // The literal request was "5,000 or greater". A floor alone still returns
  // household names, which is the opposite of what was wanted.
  it("excludes an artist far above the ceiling even though it clears the floor", () => {
    expect(isUndergroundListenerCount(4_000_000)).toBe(false);
  });

  it("offers itself for music only", () => {
    expect(supportsUnderground("artists")).toBe(true);
    expect(supportsUnderground("albums")).toBe(true);
    expect(supportsUnderground("movies")).toBe(false);
    expect(supportsUnderground("books")).toBe(false);
  });

  it.each([
    [820, "820 listeners"],
    [5_400, "5.4K listeners"],
    [42_000, "42K listeners"],
  ])("renders %d as %s", (listeners, expected) => {
    expect(formatListeners(listeners)).toBe(expected);
  });

  it("splits candidates into whole chunks with a short remainder", () => {
    expect(chunksOf([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunksOf([], 4)).toEqual([]);
  });
});

describe("what an empty deck offers next", () => {
  it("sends a search or filter back to its own panel", () => {
    expect(emptyStateAction("search", "movies")).toMatchObject({
      kind: "openPanel",
      mode: "search",
    });
    expect(emptyStateAction("filter", "books")).toMatchObject({
      kind: "openPanel",
      mode: "filter",
    });
  });

  // The bug this replaces: anything that was not search or filter was offered
  // "Shuffle again", which abandons the mode the user deliberately chose.
  it.each(["fresh", "underground"] as const)(
    "offers to retry %s rather than shuffling away from it",
    (mode) => {
      expect(emptyStateAction(mode, "artists")).toMatchObject({
        kind: "retryMode",
        mode,
      });
    }
  );

  it("still shuffles when the deck came from shuffling", () => {
    expect(emptyStateAction("randomize", "albums")).toMatchObject({
      kind: "randomize",
    });
    expect(emptyStateAction(undefined, "albums")).toMatchObject({
      kind: "randomize",
    });
  });

  it("names the category in every message", () => {
    for (const mode of ["search", "fresh", "underground", "randomize"] as const) {
      expect(emptyStateAction(mode, "albums").message).toContain("albums");
    }
  });
});
