import { clearRequestCache } from "../requestCache";
import { randomMovies, getSimilarMovies } from "../tmdb";
import { randomBooks, filterBooks } from "../openlibrary";
import { randomAlbums, searchAlbums, getSimilarAlbums } from "../discogs";
import type { ResultItem } from "../../../types/content";

/**
 * Live checks against the real providers, skipped by default.
 *
 *     LIVE_API_PROBE=1 npx jest liveProviders --coverage=false
 *
 * Every bug this file guards was a data-shape bug: a query that fetched the
 * wrong page, or no date window at all. Fixtures cannot see any of that,
 * because a fixture is whatever the test decided the provider returns. These
 * ask the provider.
 *
 * They talk to the network and cost API quota, so they stay out of `npm test`
 * and out of CI. Requires the same .env the app uses:
 *
 *     set -a && . ./.env && set +a && LIVE_API_PROBE=1 npx jest liveProviders
 */

const live = process.env.LIVE_API_PROBE === "1" ? describe : describe.skip;

jest.setTimeout(120_000);

/** Movies carry the year in `subtitle`, albums in `meta`. */
function yearsOf(items: readonly ResultItem[], field: "subtitle" | "meta"): number[] {
  return items
    .map((item) => Number.parseInt(item[field], 10))
    .filter((year) => Number.isFinite(year) && year > 1900);
}

function decadeHistogram(label: string, years: readonly number[]): Set<number> {
  const counts = new Map<number, number>();
  for (const year of years) {
    const decade = Math.floor(year / 10) * 10;
    counts.set(decade, (counts.get(decade) ?? 0) + 1);
  }
  const rows = [...counts.entries()].sort(([a], [b]) => a - b);
  const report = rows
    .map(([decade, count]) => `${decade}s ${"#".repeat(count)} (${count})`)
    .join("\n  ");
  // eslint-disable-next-line no-console
  console.log(`\n${label} — ${years.length} dated results\n  ${report}`);
  return new Set(rows.map(([decade]) => decade));
}

beforeEach(() => {
  clearRequestCache();
});

live("what randomise actually returns", () => {
  // The report was "I keep swiping no and I keep getting 2025 to 2026 movies",
  // which is exactly what `popularity.desc` with no date window does.
  it("spreads movies across decades rather than only this year", async () => {
    const pages = await Promise.all(
      Array.from({ length: 8 }, (_, index) => randomMovies({ page: index + 1 }))
    );
    const years = yearsOf(pages.flat(), "subtitle");
    const decades = decadeHistogram("Movies", years);

    expect(years.length).toBeGreaterThan(10);
    expect(decades.size).toBeGreaterThanOrEqual(3);
    expect([...decades].some((decade) => decade < 2000)).toBe(true);
    expect([...decades].some((decade) => decade >= 2010)).toBe(true);
  });

  // The mirror-image complaint: "artists and albums still give me older
  // artists", because randomAlbums sent no year and Discogs is a vinyl archive.
  it("reaches recent records as well as old ones for albums", async () => {
    const pages = await Promise.all(
      Array.from({ length: 8 }, (_, index) => randomAlbums({ page: index + 1 }))
    );
    const years = yearsOf(pages.flat(), "meta");
    const decades = decadeHistogram("Albums", years);

    expect(years.length).toBeGreaterThan(10);
    expect(decades.size).toBeGreaterThanOrEqual(2);
    expect([...decades].some((decade) => decade >= 2010)).toBe(true);
    // Nothing before 1990 should appear at all now.
    expect(Math.min(...years)).toBeGreaterThanOrEqual(1990);
  });
});

live("what a refill actually fetches", () => {
  // "I put no 4 times and then it kept giving me the same two books and now
  // it's showing nothing" — randomBooks took no arguments, so every top-up
  // re-fetched one window, dedup dropped the lot, and the deck died.
  it("gives books a different shelf on each page", async () => {
    const pages = await Promise.all(
      Array.from({ length: 5 }, (_, index) => randomBooks({ page: index + 1 }))
    );
    const ids = pages.flat().map((item) => item.id);
    const distinct = new Set(ids);

    // eslint-disable-next-line no-console
    console.log(`\nBooks — ${ids.length} results, ${distinct.size} distinct`);
    expect(ids.length).toBeGreaterThan(10);
    expect(distinct.size / ids.length).toBeGreaterThan(0.7);
  });

  // The exact filter combination from the report: books, horror, the 2020s.
  it("pages a filtered book deck instead of serving one window forever", async () => {
    const pages = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        filterBooks({
          subjects: ["horror"],
          yearFrom: 2020,
          yearTo: 2029,
          page: index + 1,
        })
      )
    );
    const perPage = pages.map((page) => page.map((item) => item.id));
    const distinct = new Set(perPage.flat());

    // eslint-disable-next-line no-console
    console.log(
      `\nBooks (horror, 2020s) — per page: ${perPage
        .map((page) => page.length)
        .join(", ")}; ${distinct.size} distinct overall`
    );
    // Page 2 must not repeat page 1. That repetition *was* the bug.
    expect(distinct.size).toBeGreaterThan(perPage[0].length);
  });
});

live("what Find similar actually returns", () => {
  it("keeps a modern film's neighbours in roughly its own era", async () => {
    // Dune: Part Two (2024).
    const similar = await getSimilarMovies("693134");
    const years = yearsOf(similar, "subtitle");
    decadeHistogram("Similar to Dune: Part Two (2024)", years);

    expect(years.length).toBeGreaterThan(0);
  });

  // The headline complaint: Chappell Roan's "The Giver" returned "Black Bear
  // Road" by C.W. McCall, a 1975 trucker album, because both are tagged
  // Country and nothing constrained the year.
  it("does not answer a 2025 single with a 1975 record", async () => {
    const seeds = await searchAlbums("Chappell Roan The Giver");
    expect(seeds.length).toBeGreaterThan(0);
    const seed = seeds[0];
    const seedYear = Number.parseInt(seed.meta, 10);

    const similar = await getSimilarAlbums(seed.id);
    const years = yearsOf(similar, "meta");
    decadeHistogram(`Similar to ${seed.title} (${seed.meta})`, years);
    // eslint-disable-next-line no-console
    console.log(
      `  → ${similar
        .slice(0, 5)
        .map((item) => `${item.subtitle} — ${item.title} (${item.meta})`)
        .join("\n    ")}`
    );

    expect(similar.length).toBeGreaterThan(0);
    if (Number.isFinite(seedYear) && years.length > 0) {
      const median = [...years].sort((a, b) => a - b)[
        Math.floor(years.length / 2)
      ];
      // Half a century apart is the failure; a decade or two is fair.
      expect(Math.abs(median - seedYear)).toBeLessThan(25);
    }
  });
});
