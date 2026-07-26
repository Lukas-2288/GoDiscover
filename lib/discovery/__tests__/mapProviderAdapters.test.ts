import type { ResultItem } from "../../../types/content";

const mockFilterMovies = jest.fn();
const mockFilterBooks = jest.fn();
const mockFilterArtists = jest.fn();
const mockFilterAlbums = jest.fn();
const mockSimilarAlbums = jest.fn();

jest.mock("../../api/tmdb", () => ({
  TMDB_GENRES: { Drama: 18, "Sci-Fi": 878 },
  decadeToYearRange: (decade: string) =>
    decade === "10s" ? { yearFrom: 2010, yearTo: 2019 } : null,
  filterMovies: (...args: unknown[]) => mockFilterMovies(...args),
  getSimilarMovies: jest.fn(async () => []),
  randomMovies: jest.fn(async () => []),
  searchMovies: jest.fn(async () => []),
}));

jest.mock("../../api/openlibrary", () => ({
  OL_SUBJECTS: { "Sci-Fi": "science_fiction" },
  filterBooks: (...args: unknown[]) => mockFilterBooks(...args),
  getSimilarBooks: jest.fn(async () => []),
  randomBooks: jest.fn(async () => []),
  searchBooks: jest.fn(async () => []),
}));

jest.mock("../../api/discogs", () => ({
  SPOTIFY_GENRE_MAP: { Jazz: "Jazz" },
  filterAlbums: (...args: unknown[]) => mockFilterAlbums(...args),
  filterArtists: (...args: unknown[]) => mockFilterArtists(...args),
  getSimilarAlbums: (...args: unknown[]) => mockSimilarAlbums(...args),
  getSimilarArtists: jest.fn(async () => []),
  randomAlbums: jest.fn(async () => []),
  randomArtists: jest.fn(async () => []),
  searchAlbums: jest.fn(async () => []),
  searchArtists: jest.fn(async () => []),
}));

import { defaultDiscoveryProviders } from "../loadDiscovery";
import { findMapRecommendations } from "../mapRecommendations";

const artist: ResultItem = {
  id: "artist",
  title: "Artist",
  subtitle: "Artist",
  meta: "",
};
const album: ResultItem = {
  id: "album",
  title: "Album",
  subtitle: "Artist",
  meta: "2018",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFilterMovies.mockResolvedValue([]);
  mockFilterBooks.mockResolvedValue([]);
  mockFilterArtists.mockResolvedValue([artist]);
  mockFilterAlbums.mockResolvedValue([album]);
  mockSimilarAlbums.mockResolvedValue([]);
});

it("keeps production map filter pages and cross-media results stable when randomness changes", async () => {
  const seed = {
    category: "movies" as const,
    item: {
      id: "arrival",
      title: "Arrival",
      subtitle: "2016",
      meta: "2016",
    },
    profile: {
      vocabularyVersion: 1 as const,
      genres: ["Jazz"],
      styles: [],
      subjects: [],
      creators: [],
      era: "2010s",
    },
  };

  jest.spyOn(Math, "random").mockReturnValueOnce(0).mockReturnValueOnce(0.99);
  const first = await findMapRecommendations(seed, {
    providers: defaultDiscoveryProviders,
  });
  const second = await findMapRecommendations(seed, {
    providers: defaultDiscoveryProviders,
  });

  expect(
    first.recommendations.map(({ category, item, reason }) => ({
      category,
      id: item.id,
      reason,
    }))
  ).toEqual(
    second.recommendations.map(({ category, item, reason }) => ({
      category,
      id: item.id,
      reason,
    }))
  );
  expect(mockFilterArtists.mock.calls[0][0]).toEqual(
    mockFilterArtists.mock.calls[1][0]
  );
  expect(mockFilterAlbums.mock.calls[0][0]).toEqual(
    mockFilterAlbums.mock.calls[1][0]
  );
  expect(mockFilterAlbums.mock.calls[0][0]).toEqual(
    expect.objectContaining({
      deterministic: true,
      page: expect.any(Number),
    })
  );
  jest.restoreAllMocks();
});

it("uses deterministic same-category album similarity only in the map adapter", async () => {
  await defaultDiscoveryProviders.albums.mapSimilar!(
    {
      id: "seed-album",
      title: "Seed",
      subtitle: "Artist",
      meta: "2020",
    },
    { seed: "albums:seed-album" }
  );

  expect(mockSimilarAlbums).toHaveBeenCalledWith("seed-album", {
    deterministic: true,
  });
});
