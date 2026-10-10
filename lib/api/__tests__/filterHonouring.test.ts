import { clearRequestCache } from "../requestCache";
import {
  ERA_ANY_FILTER,
  RATING_ANY_FILTER,
  isEraFilter,
  isRatingFilter,
  toggleDiscoveryFilter,
} from "../../discovery/filterSelection";

// Both provider modules read their keys once at module load, and `import` is
// hoisted above any assignment — hence `require` below, as musicSimilarity does.
process.env.EXPO_PUBLIC_TMDB_API_KEY = "test-key";
process.env.EXPO_PUBLIC_DISCOGS_TOKEN = "test-token";

const {
  defaultDiscoveryProviders,
  loadDiscovery,
  // eslint-disable-next-line @typescript-eslint/no-var-requires
} = require("../../discovery/loadDiscovery") as typeof import("../../discovery/loadDiscovery");

/**
 * Whether a filtered deck is actually filtered.
 *
 * Nothing checked. The live probe proves a filtered book deck *pages* — that
 * page two differs from page one — and stops there. No test asked whether the
 * horror filter returned horror, or whether the 80s filter returned the 80s,
 * and `lib/discovery/filterSelection.ts` had no test file at all.
 *
 * Two real failures were hiding in that gap, both on the music path:
 *
 * 1. `resolveGenreStyle` returned on the first label it recognised, so picking
 *    Jazz, Metal and Reggae searched Jazz alone while all three chips stayed
 *    lit. Discogs has no OR for genre, so honouring a multi-select means
 *    several requests — it was doing one.
 * 2. `filterAlbums` retried *without the year* when a page came back empty, so
 *    a request for the 80s could answer with 2015 records and say nothing. The
 *    same silent widening that once answered a 2025 single with a 1975 album.
 *
 * These assert on the query sent, because that is where a filter either
 * survives or is quietly dropped.
 */

let requested: string[] = [];

function serve(results: unknown = []) {
  (global as { fetch?: unknown }).fetch = jest.fn(async (input: unknown) => {
    const url = String(input);
    requested.push(url);
    const body = url.includes("openlibrary")
      ? { docs: results, numFound: 0 }
      : { results, page: 1, total_pages: 1 };
    return { ok: true, json: async () => body, text: async () => "" };
  });
}

/**
 * Every query string sent, decoded so assertions read like the real params.
 * `+` is a space in a query string and `decodeURIComponent` leaves it alone.
 */
function queries(fragment: string): string[] {
  return requested
    .filter((url) => url.includes(fragment))
    .map((url) => decodeURIComponent(url).replace(/\+/g, " "));
}

function filterDeck(category: "movies" | "books" | "artists" | "albums", filters: string[]) {
  return loadDiscovery(
    { category, mode: "filter", filters },
    defaultDiscoveryProviders,
    { page: 1 }
  );
}

beforeEach(() => {
  requested = [];
  clearRequestCache();
});

afterEach(() => {
  delete (global as { fetch?: unknown }).fetch;
});

describe("choosing filters", () => {
  // Era and rating are single-select: picking the 90s after the 80s replaces it
  // rather than asking for both, which would be a contradiction.
  it("replaces rather than accumulates a single-select choice", () => {
    let filters = toggleDiscoveryFilter([], "80s");
    filters = toggleDiscoveryFilter(filters, "90s");
    expect(filters.filter(isEraFilter)).toEqual(["90s"]);
  });

  it("keeps genres additive, because several genres is a real request", () => {
    let filters = toggleDiscoveryFilter([], "Jazz");
    filters = toggleDiscoveryFilter(filters, "Metal");
    expect(filters).toEqual(["Jazz", "Metal"]);
  });

  it("removes a genre when it is chosen again", () => {
    const filters = toggleDiscoveryFilter(["Jazz", "Metal"], "Jazz");
    expect(filters).toEqual(["Metal"]);
  });

  it.each([
    [ERA_ANY_FILTER, isEraFilter, "80s"],
    [RATING_ANY_FILTER, isRatingFilter, "7+"],
  ])("clears its own family when %s is chosen", (anyFilter, predicate, member) => {
    const filters = toggleDiscoveryFilter(["Jazz", member], anyFilter);
    expect(filters.filter(predicate)).toEqual([]);
    // And leaves everything else alone.
    expect(filters).toContain("Jazz");
  });

  it("does not mistake a genre for an era or a rating", () => {
    expect(isEraFilter("Jazz")).toBe(false);
    expect(isRatingFilter("Jazz")).toBe(false);
    expect(isEraFilter("80s")).toBe(true);
    expect(isRatingFilter("3.5+")).toBe(true);
  });
});

describe("movies honour their filters", () => {
  it("asks TMDB for the chosen genres, the chosen decade and the rating floor", async () => {
    serve();

    await filterDeck("movies", ["Horror", "Thriller", "80s", "7+"]);

    const [query] = queries("/discover/movie");
    // Horror 27, Thriller 53 — OR'd, since either satisfies the request.
    expect(query).toContain("with_genres=27|53");
    expect(query).toContain("primary_release_date.gte=1980-01-01");
    expect(query).toContain("primary_release_date.lte=1989-12-31");
    expect(query).toContain("vote_average.gte=7");
  });

  it("sends no genre constraint when none was chosen", async () => {
    serve();

    await filterDeck("movies", ["80s"]);

    expect(queries("/discover/movie")[0]).not.toContain("with_genres");
  });
});

describe("books honour their filters", () => {
  it("asks Open Library for the chosen subjects and publication window", async () => {
    serve();

    await filterDeck("books", ["Horror", "Sci-Fi", "20s"]);

    const [query] = queries("openlibrary");
    expect(query).toContain('subject:"horror"');
    expect(query).toContain('subject:"science_fiction"');
    expect(query).toContain("first_publish_year:[2020 TO 2029]");
  });

  // The rating floor is applied to the response rather than the query, because
  // Open Library cannot express it. Worth knowing it drops unrated books.
  it("keeps only books meeting the rating floor", async () => {
    serve([
      { key: "/works/A", title: "Rated high", cover_i: 1, ratings_average: 4.6 },
      { key: "/works/B", title: "Rated low", cover_i: 2, ratings_average: 2.1 },
      { key: "/works/C", title: "Unrated", cover_i: 3 },
    ]);

    const deck = await filterDeck("books", ["4+"]);

    expect(deck.map((item) => item.title)).toEqual(["Rated high"]);
  });
});

describe("music honours every genre chosen, not just the first", () => {
  // The bug: one request went out and two chips did nothing.
  it.each(["albums", "artists"] as const)(
    "searches once per genre for %s",
    async (category) => {
      serve();

      await filterDeck(category, ["Jazz", "Metal", "80s"]);

      const searches = queries("/database/search");
      expect(searches.length).toBeGreaterThanOrEqual(2);
      expect(searches.some((query) => query.includes("genre=Jazz"))).toBe(true);
      // Metal is genre Rock with style Heavy Metal, so the pair is the identity.
      expect(
        searches.some(
          (query) => query.includes("genre=Rock") && query.includes("style=Heavy Metal")
        )
      ).toBe(true);
    }
  );

  it("caps the fan-out rather than firing one request per chip", async () => {
    serve();

    await filterDeck("albums", [
      "Jazz",
      "Metal",
      "Reggae",
      "Blues",
      "Latin",
      "Classical",
    ]);

    expect(queries("/database/search").length).toBeLessThanOrEqual(3);
  });

  it("does not repeat a genre that resolves to the same Discogs pair", async () => {
    serve();

    // Both map onto genre Pop with no style beyond K-Pop's.
    await filterDeck("albums", ["Pop", "Pop"]);

    expect(queries("/database/search")).toHaveLength(1);
  });

  it("still searches the era when no genre was chosen", async () => {
    serve();

    await filterDeck("albums", ["80s"]);

    const searches = queries("/database/search");
    expect(searches).toHaveLength(1);
    expect(searches[0]).toContain("year=1980-1989");
  });
});

describe("music never abandons the era", () => {
  // The regression this exists for: an empty page used to be retried with the
  // year removed, so the 80s quietly became any year at all.
  it.each(["albums", "artists"] as const)(
    "keeps the year on every retry for %s",
    async (category) => {
      // Every search comes back empty, forcing the fallback path.
      serve([]);

      await loadDiscovery(
        { category, mode: "filter", filters: ["Jazz", "80s"] },
        defaultDiscoveryProviders,
        { page: 3 }
      );

      const searches = queries("/database/search");
      expect(searches.length).toBeGreaterThan(1);
      for (const query of searches) {
        expect(query).toContain("year=1980-1989");
      }
    }
  );

  it("retries page one rather than widening the years", async () => {
    serve([]);

    await loadDiscovery(
      { category: "albums", mode: "filter", filters: ["Jazz", "80s"] },
      defaultDiscoveryProviders,
      { page: 4 }
    );

    const searches = queries("/database/search");
    expect(searches[0]).toContain("&page=4");
    // `per_page` survives; the page cursor is what gets dropped.
    expect(searches[1]).not.toContain("&page=");
    expect(searches[1]).toContain("year=1980-1989");
  });

  it("does not retry at all when the first page already answered", async () => {
    serve([{ id: 1, title: "Artist - Album", year: 1985, type: "master" }]);

    await loadDiscovery(
      { category: "albums", mode: "filter", filters: ["Jazz", "80s"] },
      defaultDiscoveryProviders,
      { page: 2 }
    );

    expect(queries("/database/search")).toHaveLength(1);
  });
});
