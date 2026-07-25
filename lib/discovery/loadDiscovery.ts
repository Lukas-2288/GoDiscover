import {
  decadeToYearRange,
  filterMovies,
  getSimilarMovies,
  randomMovies,
  searchMovies,
  TMDB_GENRES,
} from "../api/tmdb";
import {
  filterBooks,
  getSimilarBooks,
  OL_SUBJECTS,
  randomBooks,
  searchBooks,
} from "../api/openlibrary";
import {
  filterAlbums,
  filterArtists,
  getSimilarAlbums,
  getSimilarArtists,
  randomAlbums,
  randomArtists,
  searchAlbums,
  searchArtists,
  SPOTIFY_GENRE_MAP,
} from "../api/discogs";
import type { ContentCategory, ResultItem } from "../../types/content";
import type { DiscoveryLoadInput } from "./types";

export type DiscoveryProvider = {
  search(query: string): Promise<ResultItem[]>;
  random(): Promise<ResultItem[]>;
  filter(filters: readonly string[]): Promise<ResultItem[]>;
  similar(item: ResultItem): Promise<ResultItem[]>;
};

export type DiscoveryProviderRegistry = Record<ContentCategory, DiscoveryProvider>;

function yearRange(filters: readonly string[]) {
  const decade = filters.find((filter) => /^\d{2}s$/.test(filter));
  return decade ? decadeToYearRange(decade) : null;
}

function minimumRating(filters: readonly string[]): number | undefined {
  const label = filters.find((filter) => /^\d(\.\d)?\+$/.test(filter));
  return label ? Number.parseFloat(label) : undefined;
}

export const defaultDiscoveryProviders: DiscoveryProviderRegistry = {
  movies: {
    search: searchMovies,
    random: randomMovies,
    filter: (filters) => {
      const range = yearRange(filters);
      const genreIds = filters
        .map((filter) => TMDB_GENRES[filter])
        .filter((value): value is number => typeof value === "number");
      return filterMovies({
        genreIds: genreIds.length ? genreIds : undefined,
        yearFrom: range?.yearFrom,
        yearTo: range?.yearTo,
        minRating: minimumRating(filters),
      });
    },
    similar: (item) => getSimilarMovies(item.id),
  },
  books: {
    search: searchBooks,
    random: randomBooks,
    filter: (filters) => {
      const range = yearRange(filters);
      const subjects = filters
        .map((filter) => OL_SUBJECTS[filter])
        .filter((value): value is string => typeof value === "string");
      return filterBooks({
        subjects: subjects.length ? subjects : undefined,
        yearFrom: range?.yearFrom,
        yearTo: range?.yearTo,
        minRating: minimumRating(filters),
      });
    },
    similar: (item) => getSimilarBooks(item.id),
  },
  artists: {
    search: searchArtists,
    random: randomArtists,
    filter: (filters) => {
      const range = yearRange(filters);
      const genres = filters
        .map((filter) => SPOTIFY_GENRE_MAP[filter])
        .filter((value): value is string => typeof value === "string");
      return filterArtists({
        genres: genres.length ? genres : undefined,
        yearFrom: range?.yearFrom,
        yearTo: range?.yearTo,
      });
    },
    similar: (item) => getSimilarArtists(item.id),
  },
  albums: {
    search: searchAlbums,
    random: randomAlbums,
    filter: (filters) => {
      const range = yearRange(filters);
      const genres = filters
        .map((filter) => SPOTIFY_GENRE_MAP[filter])
        .filter((value): value is string => typeof value === "string");
      return filterAlbums({
        genres: genres.length ? genres : undefined,
        yearFrom: range?.yearFrom,
        yearTo: range?.yearTo,
      });
    },
    similar: (item) => getSimilarAlbums(item.id),
  },
};

export async function loadDiscovery(
  input: DiscoveryLoadInput,
  providers: DiscoveryProviderRegistry = defaultDiscoveryProviders
): Promise<ResultItem[]> {
  const provider = providers[input.category];
  if (input.mode === "search") {
    if (!input.query.trim()) throw new Error("Search requires a query");
    return provider.search(input.query.trim());
  }
  if (input.mode === "filter") return provider.filter([...input.filters]);
  if (input.mode === "randomize") return provider.random();
  if (!("seed" in input)) throw new Error("Similar requires a source item");
  return provider.similar(input.seed);
}

export function toDiscoveryError(category: ContentCategory): string {
  const label: Record<ContentCategory, string> = {
    movies: "movies",
    books: "books",
    artists: "artists",
    albums: "albums",
  };
  return `Couldn't load ${label[category]}. Check your connection and try again.`;
}
