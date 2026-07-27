import type { MovieDetail, ResultItem } from '../../types/content';
import { cachedRequest } from './requestCache';

const API_KEY = process.env.EXPO_PUBLIC_TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p';

type TMDBMovie = {
  id: number;
  title: string;
  overview: string;
  release_date: string;
  vote_average: number;
  poster_path: string | null;
  backdrop_path: string | null;
  genre_ids?: number[];
  runtime?: number;
  genres?: { id: number; name: string }[];
  original_language: string;
};

type TMDBPaged<T> = { page: number; results: T[]; total_pages: number };

function requireKey(): string {
  if (!API_KEY) throw new Error('EXPO_PUBLIC_TMDB_API_KEY is not set');
  return API_KEY;
}

async function tmdb<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set('api_key', requireKey());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const cacheKey = `tmdb:${path}?${cacheableQuery(url)}`;
  return cachedRequest(cacheKey, async () => {
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`TMDB ${res.status}: ${await res.text()}`);
    return res.json() as Promise<T>;
  });
}

/** Cache key without the credential, so a rotated key does not miss. */
function cacheableQuery(url: URL): string {
  const params = new URLSearchParams(url.searchParams);
  params.delete('api_key');
  params.sort();
  return params.toString();
}

export function posterUrl(path: string | null, size: 'w342' | 'w500' | 'original' = 'w500') {
  return path ? `${IMG_BASE}/${size}${path}` : undefined;
}

function toResultItem(m: TMDBMovie): ResultItem {
  const year = m.release_date ? m.release_date.slice(0, 4) : '—';
  return {
    id: String(m.id),
    title: m.title,
    subtitle: year,
    meta: m.vote_average ? `★ ${m.vote_average.toFixed(1)}` : '',
    imageUrl: posterUrl(m.poster_path),
    traits: movieTraits(m),
  };
}

/**
 * TMDB returns `genre_ids` on search/discover rows and a richer `genres` array
 * on detail rows. Map either back to the labels the filter UI uses so a
 * rejection can be turned into a `without_genres` query later.
 */
function movieTraits(m: TMDBMovie): string[] | undefined {
  const ids = m.genres?.length
    ? m.genres.map((genre) => genre.id)
    : m.genre_ids ?? [];
  if (ids.length === 0) return undefined;
  const labels = ids
    .map((id) => TMDB_GENRE_LABELS.get(id))
    .filter((label): label is string => label !== undefined);
  return labels.length > 0 ? labels : undefined;
}

export async function searchMovies(query: string, page = 1): Promise<ResultItem[]> {
  if (!query.trim()) return [];
  const data = await tmdb<TMDBPaged<TMDBMovie>>('/search/movie', {
    query,
    page,
    include_adult: 'false',
  });
  return data.results.slice(0, 5).map(toResultItem);
}

export type RandomMovieParams = {
  page?: number;
  withoutGenres?: string[];
};

export async function randomMovies(
  params: RandomMovieParams = {}
): Promise<ResultItem[]> {
  const page = params.page ?? Math.floor(Math.random() * 20) + 1;
  const q: Record<string, string | number> = {
    sort_by: 'popularity.desc',
    page,
    include_adult: 'false',
  };
  // `popularity.desc` is why rejecting one superhero film used to hand back
  // another: the blockbusters TMDB sorts to the top are heavily one genre.
  // Excluding damped genres at the query level actually removes them from the
  // result set rather than filtering an already-narrow page.
  const withoutGenreIds = toGenreIds(params.withoutGenres);
  if (withoutGenreIds) q.without_genres = withoutGenreIds;
  const data = await tmdb<TMDBPaged<TMDBMovie>>('/discover/movie', q);
  const shuffled = [...data.results].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 5).map(toResultItem);
}

/** Maps filter labels to a TMDB `with_genres`/`without_genres` value. */
function toGenreIds(labels?: readonly string[]): string | undefined {
  if (!labels?.length) return undefined;
  const ids = labels
    .map((label) => TMDB_GENRES[label])
    .filter((id): id is number => typeof id === 'number');
  return ids.length > 0 ? ids.join(',') : undefined;
}

export type MovieFilterParams = {
  genreIds?: number[];
  yearFrom?: number;
  yearTo?: number;
  minRating?: number;
  language?: string;
  page?: number;
  withoutGenres?: string[];
};

export async function filterMovies(params: MovieFilterParams): Promise<ResultItem[]> {
  const q: Record<string, string | number> = {
    sort_by: 'popularity.desc',
    include_adult: 'false',
    'vote_count.gte': 50,
    page: params.page ?? Math.floor(Math.random() * 5) + 1,
  };
  if (params.genreIds?.length) q.with_genres = params.genreIds.join('|');
  if (params.yearFrom) q['primary_release_date.gte'] = `${params.yearFrom}-01-01`;
  if (params.yearTo) q['primary_release_date.lte'] = `${params.yearTo}-12-31`;
  if (params.minRating) q['vote_average.gte'] = params.minRating;
  if (params.language) q.with_original_language = params.language;
  // An explicitly chosen genre wins over a damped one — the user asking for
  // Action right now outranks having skipped Action before.
  const requested = new Set(params.genreIds ?? []);
  const withoutGenreIds = toGenreIds(
    params.withoutGenres?.filter((label) => !requested.has(TMDB_GENRES[label]))
  );
  if (withoutGenreIds) q.without_genres = withoutGenreIds;
  const data = await tmdb<TMDBPaged<TMDBMovie>>('/discover/movie', q);
  return data.results.slice(0, 5).map(toResultItem);
}

export function decadeToYearRange(decade: string): { yearFrom: number; yearTo: number } | null {
  const map: Record<string, [number, number]> = {
    '50s': [1950, 1959],
    '60s': [1960, 1969],
    '70s': [1970, 1979],
    '80s': [1980, 1989],
    '90s': [1990, 1999],
    '00s': [2000, 2009],
    '10s': [2010, 2019],
    '20s': [2020, 2029],
  };
  const r = map[decade];
  return r ? { yearFrom: r[0], yearTo: r[1] } : null;
}

export async function getMovieDetail(id: string): Promise<MovieDetail> {
  const m = await tmdb<TMDBMovie>(`/movie/${id}`);
  return {
    id: String(m.id),
    title: m.title,
    overview: m.overview,
    releaseYear: m.release_date ? m.release_date.slice(0, 4) : '—',
    rating: m.vote_average,
    runtime: m.runtime,
    genres: (m.genres ?? []).map((g) => g.name),
    posterUrl: posterUrl(m.poster_path, 'w500'),
    backdropUrl: posterUrl(m.backdrop_path, 'original'),
    language: m.original_language,
  };
}

export async function getSimilarMovies(id: string): Promise<ResultItem[]> {
  const data = await tmdb<TMDBPaged<TMDBMovie>>(`/movie/${id}/recommendations`, {
    page: 1,
  });
  let results = data.results ?? [];
  if (results.length === 0) {
    const fallback = await tmdb<TMDBPaged<TMDBMovie>>(`/movie/${id}/similar`, { page: 1 });
    results = fallback.results ?? [];
  }
  return results
    .filter((m) => m.poster_path)
    .slice(0, 10)
    .map(toResultItem);
}

export const TMDB_GENRES: Record<string, number> = {
  Action: 28,
  Adventure: 12,
  Animation: 16,
  Comedy: 35,
  Crime: 80,
  Documentary: 99,
  Drama: 18,
  Fantasy: 14,
  Horror: 27,
  Romance: 10749,
  'Sci-Fi': 878,
  Thriller: 53,
  Western: 37,
};

/**
 * Reverse of TMDB_GENRES. Ids TMDB returns but the filter UI has no label for
 * (Family, Music, War, …) are simply absent, so they never become traits.
 */
const TMDB_GENRE_LABELS: ReadonlyMap<number, string> = new Map(
  Object.entries(TMDB_GENRES).map(([label, id]) => [id, label])
);

export const TMDB_LANGUAGES: Record<string, string> = {
  English: 'en',
  Spanish: 'es',
  French: 'fr',
  Japanese: 'ja',
  Korean: 'ko',
  Italian: 'it',
  German: 'de',
  Hindi: 'hi',
};
