import type { ResultItem } from "../../../types/content";
import {
  loadDiscovery,
  toDiscoveryError,
  type DiscoveryProviderRegistry,
} from "../loadDiscovery";
import type { DiscoveryLoadInput } from "../types";

const item: ResultItem = { id: "1", title: "Arrival", subtitle: "2016", meta: "" };

function providers(): DiscoveryProviderRegistry {
  const provider = () => ({
    search: jest.fn(async () => [item]),
    random: jest.fn(async () => [item]),
    filter: jest.fn(async () => [item]),
    similar: jest.fn(async () => [item]),
  });
  return {
    movies: provider(),
    books: provider(),
    artists: provider(),
    albums: provider(),
  };
}

describe("loadDiscovery", () => {
  it("routes random discovery only to the selected category", async () => {
    const registry = providers();
    await expect(
      loadDiscovery({ category: "movies", mode: "randomize" }, registry)
    ).resolves.toEqual([item]);
    expect(registry.movies.random).toHaveBeenCalledTimes(1);
    expect(registry.books.random).not.toHaveBeenCalled();
  });

  it("requires an explicit source item for Similar", async () => {
    const registry = providers();
    await expect(
      loadDiscovery(
        { category: "movies", mode: "similar" } as unknown as DiscoveryLoadInput,
        registry
      )
    ).rejects.toThrow("Similar requires a source item");
    expect(registry.movies.similar).not.toHaveBeenCalled();
  });

  it("passes the source only after an explicit Similar request", async () => {
    const registry = providers();
    await loadDiscovery(
      { category: "movies", mode: "similar", seed: item },
      registry
    );
    // The second argument carries rejected/present ids so Similar stops
    // repeating cards the user has already seen.
    expect(registry.movies.similar).toHaveBeenCalledWith(item, expect.any(Object));
  });

  it("never exposes a provider token response in user copy", () => {
    const message = toDiscoveryError("albums");
    expect(message).toBe("Couldn't load albums. Check your connection and try again.");
    expect(message).not.toMatch(/Discogs|401|token/i);
  });
});
