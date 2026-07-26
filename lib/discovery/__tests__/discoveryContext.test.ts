import type { ResultItem } from "../../../types/content";
import {
  applyDiscoveryContext,
  loadDiscovery,
  type DiscoveryProviderRegistry,
} from "../loadDiscovery";

function item(id: string, traits?: string[]): ResultItem {
  return { id, title: id, subtitle: "", meta: "", traits };
}

function providers(
  results: ResultItem[],
  spy?: jest.Mock
): DiscoveryProviderRegistry {
  const provider = {
    search: jest.fn(async () => results),
    random: spy ?? jest.fn(async () => results),
    filter: jest.fn(async () => results),
    similar: jest.fn(async () => results),
  };
  return {
    movies: provider,
    books: provider,
    artists: provider,
    albums: provider,
  } as unknown as DiscoveryProviderRegistry;
}

describe("discovery load context", () => {
  it("never returns an item the user already rejected", async () => {
    const results = [item("hulk"), item("arrival")];
    const loaded = await loadDiscovery(
      { category: "movies", mode: "randomize" },
      providers(results),
      { rejectedIds: new Set(["hulk"]) }
    );
    expect(loaded.map((entry) => entry.id)).toEqual(["arrival"]);
  });

  it("does not repeat items already on the deck during a top-up", async () => {
    const results = [item("arrival"), item("dune")];
    const loaded = await loadDiscovery(
      { category: "movies", mode: "randomize" },
      providers(results),
      { presentIds: new Set(["arrival"]) }
    );
    expect(loaded.map((entry) => entry.id)).toEqual(["dune"]);
  });

  // The complaint this exists for: reject Hulk, get Iron Man. Once a genre is
  // damped it must stop arriving, whether or not the provider can express the
  // exclusion in its own query.
  it("drops damped traits from randomize results", async () => {
    const results = [item("iron-man", ["Action"]), item("arrival", ["Sci-Fi"])];
    const loaded = await loadDiscovery(
      { category: "movies", mode: "randomize" },
      providers(results),
      { dampedTraits: ["Action"] }
    );
    expect(loaded.map((entry) => entry.id)).toEqual(["arrival"]);
  });

  it("passes damped traits to the provider so it can exclude them upstream", async () => {
    const random = jest.fn(async () => [item("arrival", ["Sci-Fi"])]);
    await loadDiscovery(
      { category: "movies", mode: "randomize" },
      providers([], random),
      { dampedTraits: ["Action"], page: 3 }
    );
    expect(random).toHaveBeenCalledWith(
      expect.objectContaining({ dampedTraits: ["Action"], page: 3 })
    );
  });

  // An explicit search outranks a standing preference — hiding matches the user
  // literally typed would read as broken.
  it("keeps damped traits in search results but still hides rejected items", async () => {
    const results = [item("iron-man", ["Action"]), item("hulk", ["Action"])];
    const loaded = await loadDiscovery(
      { category: "movies", mode: "search", query: "marvel" },
      providers(results),
      { dampedTraits: ["Action"], rejectedIds: new Set(["hulk"]) }
    );
    expect(loaded.map((entry) => entry.id)).toEqual(["iron-man"]);
  });

  // Similar is already scoped by the seed the user picked; damping its genre
  // would empty the result.
  it("keeps damped traits in similar results", async () => {
    const results = [item("iron-man", ["Action"])];
    const loaded = await loadDiscovery(
      { category: "movies", mode: "similar", seed: item("hulk", ["Action"]) },
      providers(results),
      { dampedTraits: ["Action"] }
    );
    expect(loaded.map((entry) => entry.id)).toEqual(["iron-man"]);
  });

  it("leaves untagged items alone", () => {
    const filtered = applyDiscoveryContext(
      [item("no-traits"), item("action", ["Action"])],
      { dampedTraits: ["Action"] },
      { dampTraits: true }
    );
    expect(filtered.map((entry) => entry.id)).toEqual(["no-traits"]);
  });
});
