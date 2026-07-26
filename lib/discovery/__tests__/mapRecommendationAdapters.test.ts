import type {
  AlbumDetail,
  ArtistDetail,
  BookDetail,
  ContentCategory,
  MovieDetail,
  ResultItem,
} from "../../../types/content";
import type { ContentDetail } from "../loadDetail";
import type { DiscoveryProviderRegistry } from "../loadDiscovery";
import { loadMapRecommendationSeed } from "../mapRecommendationAdapters";
import { findMapRecommendations } from "../mapRecommendations";

const lightweightItems: Record<ContentCategory, ResultItem> = {
  movies: {
    id: "movie",
    title: "Movie",
    subtitle: "2016",
    meta: "★ 8.0",
  },
  books: {
    id: "book",
    title: "Book",
    subtitle: "Ursula K. Le Guin",
    meta: "1969",
  },
  artists: {
    id: "name:Alice%20Coltrane",
    title: "Alice Coltrane",
    subtitle: "Artist",
    meta: "",
  },
  albums: {
    id: "album",
    title: "Journey in Satchidananda",
    subtitle: "Alice Coltrane",
    meta: "1971",
  },
};

const details: Record<ContentCategory, ContentDetail> = {
  movies: {
    category: "movies",
    data: {
      id: "movie",
      title: "Movie",
      overview: "A science-fiction drama.",
      releaseYear: "2016",
      rating: 8,
      genres: ["Science Fiction"],
      language: "en",
    } satisfies MovieDetail,
  },
  books: {
    category: "books",
    data: {
      id: "book",
      title: "Book",
      authors: ["Ursula K. Le Guin"],
      firstPublishYear: 1969,
      subjects: ["Science fiction"],
      description: "An anthropological science-fiction novel.",
    } satisfies BookDetail,
  },
  artists: {
    category: "artists",
    data: {
      id: "artist",
      name: "Alice Coltrane",
      albums: [],
      spotifyUrl: "https://example.com/artist",
      genres: ["Jazz"],
      styles: ["Spiritual Jazz"],
      description: "Jazz harpist and composer.",
      releaseYear: "1971",
    } satisfies ArtistDetail,
  },
  albums: {
    category: "albums",
    data: {
      id: "album",
      name: "Journey in Satchidananda",
      artists: ["Alice Coltrane"],
      releaseDate: "1971",
      totalTracks: 4,
      albumType: "album",
      genres: ["Jazz"],
      popularity: 0,
      tracks: [],
      spotifyUrl: "https://example.com/album",
    } satisfies AlbumDetail,
  },
};

function providers(): DiscoveryProviderRegistry {
  const provider = (category: ContentCategory) => ({
    search: async () => [],
    random: async () => [],
    filter: async () => [],
    similar: async () => [],
    mapFilter: async () => [
      {
        id: `${category}-match`,
        title: `${category} match`,
        subtitle: "Match",
        meta: "",
      },
    ],
  });
  return {
    movies: provider("movies"),
    books: provider("books"),
    artists: provider("artists"),
    albums: provider("albums"),
  };
}

it.each([
  ["movies", "books"],
  ["books", "movies"],
  ["artists", "albums"],
  ["albums", "artists"],
] as const)(
  "loads real %s detail before producing a strong cross-category %s match",
  async (seedCategory, expectedCategory) => {
    const detailLoader = jest.fn(
      async (): Promise<ContentDetail> => details[seedCategory]
    );
    const seed = await loadMapRecommendationSeed(
      seedCategory,
      lightweightItems[seedCategory],
      detailLoader
    );

    const result = await findMapRecommendations(seed, {
      providers: providers(),
    });

    expect(detailLoader).toHaveBeenCalledWith(
      seedCategory,
      lightweightItems[seedCategory]
    );
    expect(seed.profile.genres).not.toEqual([]);
    const crossCategory = result.recommendations.find(
      (candidate) => candidate.category === expectedCategory
    );
    expect(crossCategory).toEqual(
      expect.objectContaining({
        category: expectedCategory,
        score: expect.any(Number),
        reason: expect.objectContaining({
          evidence: expect.any(Array),
        }),
      })
    );
    expect(crossCategory!.reason.evidence.length).toBeGreaterThan(0);
    expect(crossCategory!.score).toBeGreaterThanOrEqual(0.6);
  }
);
