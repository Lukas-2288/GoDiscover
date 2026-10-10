import { clearRequestCache } from "../requestCache";
import similarFixture from "./fixtures/tmdb-similar-dune.json";
import seedFixture from "./fixtures/tmdb-movie-dune.json";

// tmdb.ts reads its key once at module load, so this has to be set before the
// require below — which is why this file uses require rather than import.
process.env.EXPO_PUBLIC_TMDB_API_KEY = "test-key";

const {
  getSimilarMovies,
  freshMovies,
  // eslint-disable-next-line @typescript-eslint/no-var-requires
} = require("../tmdb") as typeof import("../tmdb");

/**
 * Films had the same hole books did: `getSimilarMovies` had no offline test,
 * and no `tmdb.test.ts` existed.
 *
 * They turned out to be in far better shape. Against real recorded results for
 * Dune: Part Two, all twenty of TMDB's own suggestions share a genre with the
 * seed — so unlike Open Library's fuzzy `subject:` search, TMDB's similarity
 * does hold the promise it makes, and needs no post-filter. These pin that,
 * and the things around it that were genuinely unasserted.
 */

const SIMILAR_RESULTS = similarFixture.body.results as {
  id: number;
  title: string;
  genre_ids?: number[];
  poster_path: string | null;
  release_date?: string;
}[];
const SEED_GENRE_IDS = (seedFixture.body.genres ?? []).map(
  (genre: { id: number }) => genre.id
);

let requested: string[] = [];

function serve(routes: { match: string; body: unknown }[]) {
  (global as { fetch?: unknown }).fetch = jest.fn(async (input: unknown) => {
    const url = String(input);
    requested.push(url);
    const route = routes.find((candidate) => url.includes(candidate.match));
    return {
      ok: true,
      json: async () => route?.body ?? { results: [] },
      text: async () => "",
    };
  });
}

beforeEach(() => {
  requested = [];
  clearRequestCache();
});

afterEach(() => {
  delete (global as { fetch?: unknown }).fetch;
});

describe("recommending a different film", () => {
  // The property the equivalent book path was silently breaking.
  it("returns films sharing a genre with the seed", () => {
    expect(SEED_GENRE_IDS.length).toBeGreaterThan(0);
    const sharing = SIMILAR_RESULTS.filter((movie) =>
      (movie.genre_ids ?? []).some((id) => SEED_GENRE_IDS.includes(id))
    );
    // Recorded from the real API: every one of the twenty holds.
    expect(sharing).toHaveLength(SIMILAR_RESULTS.length);
  });

  // Recommendations are TMDB's better endpoint — built from what audiences
  // actually watched together rather than from shared metadata.
  it("prefers recommendations over raw similarity", async () => {
    serve([{ match: "/recommendations", body: { results: SIMILAR_RESULTS } }]);

    await getSimilarMovies("693134");

    expect(requested[0]).toContain("/movie/693134/recommendations");
    expect(requested.some((url) => url.includes("/similar"))).toBe(false);
  });

  it("falls back to similar when there are no recommendations", async () => {
    serve([
      { match: "/recommendations", body: { results: [] } },
      { match: "/similar", body: { results: SIMILAR_RESULTS } },
    ]);

    const similar = await getSimilarMovies("693134");

    expect(requested.some((url) => url.includes("/similar"))).toBe(true);
    expect(similar.length).toBeGreaterThan(0);
  });

  it("skips films with no poster rather than showing a blank card", async () => {
    serve([
      {
        match: "/recommendations",
        body: {
          results: [
            { ...SIMILAR_RESULTS[0], id: 1, title: "Posterless", poster_path: null },
            ...SIMILAR_RESULTS.slice(1),
          ],
        },
      },
    ]);

    const similar = await getSimilarMovies("693134");

    expect(similar.map((item) => item.title)).not.toContain("Posterless");
  });

  it("caps the deck at ten", async () => {
    serve([{ match: "/recommendations", body: { results: SIMILAR_RESULTS } }]);

    const similar = await getSimilarMovies("693134");

    expect(SIMILAR_RESULTS.length).toBeGreaterThan(10);
    expect(similar).toHaveLength(10);
  });
});

describe("what's new in film", () => {
  const NOW = new Date("2026-07-29T00:00:00Z");

  it("asks only for films already released", async () => {
    serve([{ match: "/discover/movie", body: { results: [] } }]);

    await freshMovies({ now: NOW });

    const query = decodeURIComponent(requested[0]);
    // Without an upper bound, sorting by date descending returns films
    // announced for years hence.
    expect(query).toContain("primary_release_date.lte=2026-07-29");
    expect(query).toContain("primary_release_date.gte=2026-03-31");
    expect(query).toContain("sort_by=primary_release_date.desc");
  });

  it("keeps a vote floor low enough that new films survive it", async () => {
    serve([{ match: "/discover/movie", body: { results: [] } }]);

    await freshMovies({ now: NOW });

    const query = decodeURIComponent(requested[0]);
    // Randomise uses 200; a film out three weeks has not had time for that.
    expect(query).toContain("vote_count.gte=20");
  });

  it("excludes damped genres at the query, not after the fact", async () => {
    serve([{ match: "/discover/movie", body: { results: [] } }]);

    await freshMovies({ now: NOW, withoutGenres: ["Action"] });

    expect(decodeURIComponent(requested[0])).toContain("without_genres=28");
  });
});
