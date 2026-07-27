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
import { loadNextSimilar } from "./similarTiers";
import type { DiscoveryLoadContext, DiscoveryLoadInput } from "./types";

export type DiscoveryProvider = {
  search(query: string): Promise<ResultItem[]>;
  // `context` is optional so existing test doubles keep satisfying the type.
  random(context?: DiscoveryLoadContext): Promise<ResultItem[]>;
  filter(
    filters: readonly string[],
    context?: DiscoveryLoadContext
  ): Promise<ResultItem[]>;
  similar(
    item: ResultItem,
    context?: DiscoveryLoadContext
  ): Promise<ResultItem[]>;
  mapFilter?(
    filters: readonly string[],
    context: MapProviderContext
  ): Promise<ResultItem[]>;
  mapSimilar?(
    item: ResultItem,
    context: MapProviderContext
  ): Promise<ResultItem[]>;
};

export type DiscoveryProviderRegistry = Record<ContentCategory, DiscoveryProvider>;
export type MapProviderContext = {
  seed: string;
};

function stablePage(seed: string, pageCount: number): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) % pageCount + 1;
}

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
    // TMDB is the one provider that can exclude genres in the query itself, so
    // damped traits are removed from the result set rather than filtered out of
    // an already-narrow page.
    random: (context) =>
      randomMovies({
        page: context?.page,
        withoutGenres: context?.dampedTraits
          ? [...context.dampedTraits]
          : undefined,
      }),
    filter: (filters, context) => {
      const range = yearRange(filters);
      const genreIds = filters
        .map((filter) => TMDB_GENRES[filter])
        .filter((value): value is number => typeof value === "number");
      return filterMovies({
        genreIds: genreIds.length ? genreIds : undefined,
        yearFrom: range?.yearFrom,
        yearTo: range?.yearTo,
        minRating: minimumRating(filters),
        page: context?.page,
        withoutGenres: context?.dampedTraits
          ? [...context.dampedTraits]
          : undefined,
      });
    },
    similar: (item) => getSimilarMovies(item.id),
    mapFilter: (filters, context) => {
      const range = yearRange(filters);
      const genreIds = filters
        .map((filter) => TMDB_GENRES[filter])
        .filter((value): value is number => typeof value === "number");
      return filterMovies({
        genreIds: genreIds.length ? genreIds : undefined,
        yearFrom: range?.yearFrom,
        yearTo: range?.yearTo,
        minRating: minimumRating(filters),
        page: stablePage(context.seed, 5),
      });
    },
    mapSimilar: (item) => getSimilarMovies(item.id),
  },
  books: {
    search: searchBooks,
    random: (context) =>
      randomBooks({
        page: context?.page,
        withoutSubjects: context?.dampedTraits,
      }),
    filter: (filters, context) => {
      const range = yearRange(filters);
      const subjects = filters
        .map((filter) => OL_SUBJECTS[filter])
        .filter((value): value is string => typeof value === "string");
      return filterBooks({
        subjects: subjects.length ? subjects : undefined,
        yearFrom: range?.yearFrom,
        yearTo: range?.yearTo,
        minRating: minimumRating(filters),
        page: context?.page,
      });
    },
    similar: (item) => getSimilarBooks(item.id),
    mapFilter: (filters) => {
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
    mapSimilar: (item) => getSimilarBooks(item.id),
  },
  artists: {
    search: searchArtists,
    random: (context) => randomArtists({ page: context?.page }),
    filter: (filters, context) => {
      const range = yearRange(filters);
      const genres = filters
        .map((filter) => SPOTIFY_GENRE_MAP[filter])
        .filter((value): value is string => typeof value === "string");
      return filterArtists({
        genres: genres.length ? genres : undefined,
        yearFrom: range?.yearFrom,
        yearTo: range?.yearTo,
        page: context?.page,
      });
    },
    similar: (item) => getSimilarArtists(item.id),
    mapFilter: (filters, context) => {
      const range = yearRange(filters);
      const genres = filters
        .map((filter) => SPOTIFY_GENRE_MAP[filter])
        .filter((value): value is string => typeof value === "string");
      return filterArtists({
        genres: genres.length ? genres : undefined,
        yearFrom: range?.yearFrom,
        yearTo: range?.yearTo,
        page: stablePage(context.seed, 3),
        deterministic: true,
      });
    },
    mapSimilar: (item) => getSimilarArtists(item.id),
  },
  albums: {
    search: searchAlbums,
    random: (context) => randomAlbums({ page: context?.page }),
    filter: (filters, context) => {
      const range = yearRange(filters);
      const genres = filters
        .map((filter) => SPOTIFY_GENRE_MAP[filter])
        .filter((value): value is string => typeof value === "string");
      return filterAlbums({
        genres: genres.length ? genres : undefined,
        yearFrom: range?.yearFrom,
        yearTo: range?.yearTo,
        page: context?.page,
      });
    },
    similar: (item) => getSimilarAlbums(item.id),
    mapFilter: (filters, context) => {
      const range = yearRange(filters);
      const genres = filters
        .map((filter) => SPOTIFY_GENRE_MAP[filter])
        .filter((value): value is string => typeof value === "string");
      return filterAlbums({
        genres: genres.length ? genres : undefined,
        yearFrom: range?.yearFrom,
        yearTo: range?.yearTo,
        page: stablePage(context.seed, 3),
        deterministic: true,
      });
    },
    mapSimilar: (item) =>
      getSimilarAlbums(item.id, { deterministic: true }),
  },
};

/**
 * Drops anything the user rejected, anything already on the deck, and — for
 * providers whose API cannot express exclusion — anything carrying a damped
 * trait. Search is exempt from trait damping: an explicit query outranks a
 * standing preference, and silently hiding matches would look broken.
 *
 * Damping is a preference, not a filter, so it yields when it would leave
 * nothing. A category where most items share one genre — books tagged only
 * "Fiction", say — would otherwise go completely dark after three rejections,
 * which is the dead end this whole change set exists to remove. Rejected and
 * already-present items are always excluded; those are facts, not preferences.
 */
export function applyDiscoveryContext(
  items: readonly ResultItem[],
  context: DiscoveryLoadContext,
  { dampTraits }: { dampTraits: boolean }
): ResultItem[] {
  const alwaysExcluded = (item: ResultItem) =>
    Boolean(context.rejectedIds?.has(item.id) || context.presentIds?.has(item.id));

  const available = items.filter((item) => !alwaysExcluded(item));
  const damped = dampTraits ? new Set(context.dampedTraits ?? []) : null;
  if (!damped?.size) return available;

  const preferred = available.filter(
    (item) => !item.traits?.some((trait) => damped.has(trait))
  );
  return preferred.length > 0 ? preferred : available;
}

/**
 * Runs a request with damping, and repeats it without if that produced nothing.
 *
 * Providers that can express exclusion do it in the query — TMDB's
 * `without_genres` — so an over-eager damp comes back genuinely empty and no
 * amount of post-filtering can recover it. Asking again unfiltered is the only
 * way to tell "you dislike this genre" apart from "there is nothing else here",
 * and the second is never a good reason to hand the user an empty deck.
 */
async function withDampingFallback(
  context: DiscoveryLoadContext,
  fetch: (context: DiscoveryLoadContext) => Promise<ResultItem[]>
): Promise<ResultItem[]> {
  const damped = await fetch(context);
  const preferred = applyDiscoveryContext(damped, context, { dampTraits: true });
  if (preferred.length > 0 || !context.dampedTraits?.length) return preferred;

  const relaxed: DiscoveryLoadContext = { ...context, dampedTraits: undefined };
  return applyDiscoveryContext(await fetch(relaxed), relaxed, {
    dampTraits: false,
  });
}

export async function loadDiscovery(
  input: DiscoveryLoadInput,
  providers: DiscoveryProviderRegistry = defaultDiscoveryProviders,
  context: DiscoveryLoadContext = {}
): Promise<ResultItem[]> {
  const provider = providers[input.category];
  if (input.mode === "search") {
    if (!input.query.trim()) throw new Error("Search requires a query");
    return applyDiscoveryContext(await provider.search(input.query.trim()), context, {
      dampTraits: false,
    });
  }
  if (input.mode === "filter") {
    return withDampingFallback(context, (used) =>
      provider.filter([...input.filters], used)
    );
  }
  if (input.mode === "randomize") {
    return withDampingFallback(context, (used) => provider.random(used));
  }
  if (!("seed" in input)) throw new Error("Similar requires a source item");

  // Walk the similarity ladder rather than re-asking for page 1 every time,
  // which is what made Similar repeat itself.
  const seen = new Set<string>([
    ...(context.presentIds ?? []),
    ...(context.rejectedIds ?? []),
  ]);
  const { items, tier, exhausted } = await loadNextSimilar(
    {
      category: input.category,
      seed: input.seed,
      tier: context.similarTier ?? "close",
      page: context.page ?? 1,
    },
    {
      provider,
      wander: (page) => provider.random({ page }),
    },
    seen
  );
  context.onSimilarTier?.(tier, exhausted);
  // Similar is already scoped by the seed the user chose, so damping its genre
  // would gut the result. Rejected and present items are still removed.
  return applyDiscoveryContext(items, context, { dampTraits: false });
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
