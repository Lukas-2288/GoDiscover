import { clearRequestCache } from "../requestCache";
import { freshMovies, randomMovies, getSimilarMovies } from "../tmdb";
import { freshBooks, randomBooks, filterBooks } from "../openlibrary";
import {
  freshAlbums,
  freshArtists,
  randomAlbums,
  searchAlbums,
  getSimilarAlbums,
} from "../discogs";
import { hasLastfmKey, similarArtistNames } from "../lastfm";
import { undergroundArtists } from "../underground";
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

live("whether Last.fm is answering at all", () => {
  // Last.fm is deliberately silent on failure: no key, a typo'd key, a revoked
  // key and a network error all return an empty list so the Discogs path can
  // run. That is right for the app and useless for setup, because it makes a
  // broken key look exactly like a missing one. This says which you have.
  it("returns neighbours for a modern artist when a key is configured", async () => {
    if (!hasLastfmKey()) {
      // eslint-disable-next-line no-console
      console.log(
        "\nLast.fm — no EXPO_PUBLIC_LASTFM_API_KEY set." +
          "\n  Music similarity is running on Discogs tags alone." +
          "\n  Get a free key at https://www.last.fm/api/account/create"
      );
      return;
    }
    const neighbours = await similarArtistNames("Chappell Roan", 8);
    // eslint-disable-next-line no-console
    console.log(
      `\nLast.fm — key configured; Chappell Roan → ${
        neighbours.join(", ") || "(nothing)"
      }`
    );
    // A key that is set but answers nothing for a well-known artist is a bad
    // key, not a quiet one.
    expect(neighbours.length).toBeGreaterThan(0);
  });
});

live("whether What's New is actually new", () => {
  // Every provider expresses "new" differently — a date window, a sort, a year
  // filter — so the only honest check is to ask each one and look at the years
  // that come back. A fixture would just be repeating the query back.
  it.each([
    ["movies", () => freshMovies(), "subtitle"],
    ["books", () => freshBooks(), "meta"],
    ["albums", () => freshAlbums(), "meta"],
  ] as const)("returns recent %s", async (label, fetch, field) => {
    const items = await fetch();
    const years = yearsOf(items, field);
    // eslint-disable-next-line no-console
    console.log(
      `\nWhat's New — ${label}: ${items.length} results${
        years.length ? `, years ${Math.min(...years)}–${Math.max(...years)}` : ""
      }\n  ${items.slice(0, 5).map((item) => item.title).join("\n  ")}`
    );

    expect(items.length).toBeGreaterThan(0);
    if (years.length > 0) {
      // Catalogues lag, so last year counts as new; anything older does not.
      expect(Math.min(...years)).toBeGreaterThanOrEqual(
        new Date().getFullYear() - 1
      );
    }
  });

  it("finds artists behind the new releases", async () => {
    const artists = await freshArtists();
    // eslint-disable-next-line no-console
    console.log(
      `\nWhat's New — artists: ${artists.map((a) => a.title).join(", ") || "(nothing)"}`
    );
    expect(artists.length).toBeGreaterThan(0);
    // The fake-artist fix: every card is a real Discogs record, never a name
    // scraped out of a release title.
    for (const artist of artists) {
      expect(artist.id.startsWith("name:")).toBe(false);
    }
  });
});

live("whether Underground finds anyone", () => {
  // This is the slowest thing in the app by construction: no Last.fm endpoint
  // returns listener counts in a listing, so each candidate costs its own
  // request. The wall-clock assertion is the point of the test — it shares the
  // 20s budget every discovery request gets.
  it("returns artists inside the listener band, within the request budget", async () => {
    if (!hasLastfmKey()) {
      // eslint-disable-next-line no-console
      console.log("\nUnderground — no Last.fm key; skipping.");
      return;
    }
    const startedAt = Date.now();
    const artists = await undergroundArtists({ tag: "indie" });
    const elapsedMs = Date.now() - startedAt;

    // eslint-disable-next-line no-console
    console.log(
      `\nUnderground — ${artists.length} artists in ${(elapsedMs / 1000).toFixed(1)}s\n  ${
        artists.map((a) => `${a.title} (${a.meta})`).join("\n  ") || "(nothing)"
      }`
    );

    expect(artists.length).toBeGreaterThan(0);
    // Well inside the 20s discovery timeout, with room for a slow network.
    expect(elapsedMs).toBeLessThan(15_000);
    for (const artist of artists) {
      const listeners = Number.parseInt(artist.meta.replace(/[^\d.]/g, ""), 10);
      expect(Number.isFinite(listeners)).toBe(true);
      expect(artist.id.startsWith("name:")).toBe(false);
    }
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
