import type { ContentCategory, ResultItem } from "../../../types/content";
import { decadeToYearRange } from "../../api/tmdb";
import type { DiscoveryProviderRegistry } from "../loadDiscovery";
import { findMapRecommendations } from "../mapRecommendations";

const seed: ResultItem = { id: "arrival", title: "Arrival", subtitle: "2016", meta: "2016" };
const similarMovie: ResultItem = { id: "contact", title: "Contact", subtitle: "1997", meta: "1997" };

function providers(overrides: Partial<Record<ContentCategory, Partial<DiscoveryProviderRegistry[ContentCategory]>>> = {}): DiscoveryProviderRegistry {
  const provider = (category: ContentCategory) => ({
    search: async () => [],
    random: async () => [],
    filter: async () => [],
    similar: async () => category === "movies" ? [similarMovie] : [],
    ...overrides[category],
  });
  return {
    movies: provider("movies"),
    books: provider("books"),
    artists: provider("artists"),
    albums: provider("albums"),
  };
}

describe("findMapRecommendations", () => {
  it("treats a provider-native similar item as a strong same-category recommendation", async () => {
    const result = await findMapRecommendations(
      {
        category: "movies",
        item: seed,
        profile: {
          vocabularyVersion: 1,
          genres: ["Sci-Fi"],
          styles: [],
          subjects: [],
          creators: [],
          era: "2010s",
        },
      },
      { providers: providers() }
    );

    expect(result.recommendations).toEqual([
      {
        category: "movies",
        item: similarMovie,
        score: 0.9,
        reason: {
          kind: "provider-similar",
          label: "Provider-native similar movie",
          evidence: ["provider-native similar result"],
        },
      },
    ]);
  });

  it("queries every compatible category from normalized traits, omits the seed, and deduplicates candidates", async () => {
    const filteredMovie: ResultItem = { id: "interstellar", title: "Interstellar", subtitle: "2014", meta: "2014" };
    const filteredBook: ResultItem = { id: "left-hand", title: "The Left Hand of Darkness", subtitle: "1969", meta: "1969" };
    const filteredArtist: ResultItem = { id: "name:bjork", title: "Björk", subtitle: "Artist", meta: "" };
    const filteredAlbum: ResultItem = { id: "untrue", title: "Untrue", subtitle: "Burial", meta: "2007" };
    const registry = providers({
      movies: { filter: jest.fn(async () => [seed, filteredMovie]) },
      books: { filter: jest.fn(async () => [filteredBook, filteredBook]) },
      artists: { filter: jest.fn(async () => [filteredArtist]) },
      albums: { filter: jest.fn(async () => [filteredAlbum]) },
    });

    const result = await findMapRecommendations(
      { category: "movies", item: seed, profile: { vocabularyVersion: 1, genres: ["Jazz"], styles: ["Epic"], subjects: ["Space opera"], creators: [], era: "2010s" } },
      { providers: registry }
    );

    expect(result.recommendations.map(({ category, item, score, reason }) => ({ category, id: item.id, score, reason }))).toEqual([
      { category: "movies", id: "contact", score: 0.9, reason: { kind: "provider-similar", label: "Provider-native similar movie", evidence: ["provider-native similar result"] } },
      { category: "artists", id: "name:bjork", score: 0.68, reason: { kind: "shared-genre", label: "Shared genre: Jazz", evidence: ["Jazz"] } },
      { category: "albums", id: "untrue", score: 0.68, reason: { kind: "shared-genre", label: "Shared genre: Jazz", evidence: ["Jazz"] } },
    ]);
    for (const category of ["artists", "albums"] as const) {
      expect(registry[category].filter).toHaveBeenCalledWith(["Jazz", "10s"]);
    }
    expect(registry.movies.filter).not.toHaveBeenCalled();
    expect(registry.books.filter).not.toHaveBeenCalled();
  });

  it("does not fill cross-category variety with era-only weak matches", async () => {
    const registry = providers({
      movies: { similar: async () => [] },
      books: { filter: async () => [similarMovie] },
      artists: { filter: async () => [similarMovie] },
      albums: { filter: async () => [similarMovie] },
    });

    const result = await findMapRecommendations(
      { category: "movies", item: seed, profile: { vocabularyVersion: 1, genres: [], styles: [], subjects: [], creators: [], era: "2010s" } },
      { providers: registry }
    );

    expect(result.recommendations).toEqual([]);
  });

  it("returns available recommendations and provider source statuses after a partial failure", async () => {
    const registry = providers({
      movies: { similar: async () => { throw new Error("offline"); } },
      artists: { filter: async () => [similarMovie] },
      albums: { filter: async () => { throw new Error("offline"); } },
    });

    const result = await findMapRecommendations(
      { category: "movies", item: seed, profile: { vocabularyVersion: 1, genres: ["Jazz"], styles: [], subjects: [], creators: [], era: "2010s" } },
      { providers: registry }
    );

    expect(result.recommendations).toEqual([
      { category: "artists", item: similarMovie, score: 0.68, reason: { kind: "shared-genre", label: "Shared genre: Jazz", evidence: ["Jazz"] } },
    ]);
    expect(result.sourceStatuses).toEqual(expect.arrayContaining([
      { category: "movies", source: "similar", status: "failed" },
      { category: "albums", source: "traits", status: "failed" },
      { category: "artists", source: "traits", status: "available" },
    ]));
  });

  it("reports every applicable provider failure without fabricating an empty-success result", async () => {
    const offline = async (): Promise<ResultItem[]> => { throw new Error("offline"); };
    const registry = providers({
      movies: { similar: offline },
      books: { filter: offline },
      artists: { filter: offline },
      albums: { filter: offline },
    });

    const result = await findMapRecommendations(
      { category: "movies", item: seed, profile: { vocabularyVersion: 1, genres: ["Jazz"], styles: [], subjects: [], creators: [], era: "2010s" } },
      { providers: registry }
    );

    expect(result.recommendations).toEqual([]);
    expect(result.sourceStatuses.filter((status) => status.status !== "not-applicable")).toEqual([
      { category: "movies", source: "similar", status: "failed" },
      { category: "artists", source: "traits", status: "failed" },
      { category: "albums", source: "traits", status: "failed" },
    ]);
  });

  it("does not call an incompatible provider filter or fabricate a shared trait label", async () => {
    const movieMatch: ResultItem = { id: "blade-runner", title: "Blade Runner", subtitle: "1982", meta: "1982" };
    const bookMatch: ResultItem = { id: "foundation", title: "Foundation", subtitle: "1951", meta: "1951" };
    const artistMismatch: ResultItem = { id: "name:artist", title: "An Artist", subtitle: "Artist", meta: "" };
    const registry = providers({
      movies: { similar: async () => [], filter: async () => [movieMatch] },
      books: { filter: async () => [bookMatch] },
      artists: { filter: jest.fn(async () => [artistMismatch]) },
      albums: { filter: jest.fn(async () => [artistMismatch]) },
    });

    const result = await findMapRecommendations(
      { category: "movies", item: seed, profile: { vocabularyVersion: 1, genres: ["Sci-Fi"], styles: [], subjects: [], creators: [], era: "2010s" } },
      { providers: registry }
    );

    expect(result.recommendations.map((candidate) => `${candidate.category}:${candidate.item.id}`)).toEqual([
      "movies:blade-runner",
      "books:foundation",
    ]);
    expect(registry.artists.filter).not.toHaveBeenCalled();
    expect(registry.albums.filter).not.toHaveBeenCalled();
    expect(result.sourceStatuses).toEqual(expect.arrayContaining([
      { category: "artists", source: "traits", status: "not-applicable" },
      { category: "albums", source: "traits", status: "not-applicable" },
    ]));
  });

  it("caps strong candidates at eight without adding weak categories", async () => {
    const artistMatches = Array.from({ length: 10 }, (_, index): ResultItem => ({
      id: `artist-${index}`,
      title: `Artist ${index}`,
      subtitle: "Artist",
      meta: "",
    }));
    const registry = providers({
      artists: { similar: async () => [], filter: async () => artistMatches },
    });

    const result = await findMapRecommendations(
      { category: "artists", item: { id: "seed", title: "Seed", subtitle: "Artist", meta: "" }, profile: { vocabularyVersion: 1, genres: ["Jazz"], styles: [], subjects: [], creators: [], era: "2010s" } },
      { providers: registry }
    );

    expect(result.recommendations).toHaveLength(8);
    expect(result.recommendations.map((candidate) => candidate.item.id)).toEqual([
      "artist-0", "artist-1", "artist-2", "artist-3", "artist-4", "artist-5", "artist-6", "artist-7",
    ]);
  });

  it("adapts canonical eras to the live provider decade contract", async () => {
    const registry = providers({
      movies: { similar: async () => [], filter: jest.fn(async () => []) },
    });

    await findMapRecommendations(
      { category: "movies", item: seed, profile: { vocabularyVersion: 1, genres: ["Action"], styles: [], subjects: [], creators: [], era: "2010s" } },
      { providers: registry }
    );

    expect(registry.movies.filter).toHaveBeenCalledWith(["Action", "10s"]);
    expect(decadeToYearRange("10s")).toEqual({ yearFrom: 2010, yearTo: 2019 });
  });

  it("orders equal recommendation titles by item ID and source statuses by category despite reversed completion", async () => {
    const delayed = <T,>(milliseconds: number, value: T): Promise<T> =>
      new Promise((resolve) => setTimeout(() => resolve(value), milliseconds));
    const registry = providers({
      movies: { similar: () => delayed(1, [similarMovie]) },
      artists: {
        filter: () => delayed(30, [
          { id: "b", title: "Same", subtitle: "Artist", meta: "" },
          { id: "a", title: "Same", subtitle: "Artist", meta: "" },
        ]),
      },
      albums: { filter: () => delayed(1, []) },
    });

    const result = await findMapRecommendations(
      { category: "movies", item: seed, profile: { vocabularyVersion: 1, genres: ["Jazz"], styles: [], subjects: [], creators: [], era: "2010s" } },
      { providers: registry }
    );

    expect(result.recommendations.map((candidate) => candidate.item.id)).toEqual(["contact", "a", "b"]);
    expect(result.sourceStatuses).toEqual([
      { category: "movies", source: "similar", status: "available" },
      { category: "movies", source: "traits", status: "not-applicable" },
      { category: "books", source: "traits", status: "not-applicable" },
      { category: "artists", source: "traits", status: "available" },
      { category: "albums", source: "traits", status: "available" },
    ]);
  });
});
