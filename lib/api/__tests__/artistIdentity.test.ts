import { clearRequestCache } from "../requestCache";

// discogs.ts reads its token once at module load, so this has to be set before
// the require below — which is why this file uses require rather than import.
process.env.EXPO_PUBLIC_DISCOGS_TOKEN = "test-token";

const {
  randomArtists,
  filterArtists,
  // eslint-disable-next-line @typescript-eslint/no-var-requires
} = require("../discogs") as typeof import("../discogs");

/**
 * The report was "it gives me artists that have no songs".
 *
 * They had no songs because they were never artists. Both artist paths
 * searched *releases* and split each "Artist - Album" title on the dash,
 * treating the left half as an artist and keying it `name:<the string>`.
 * Anything that happened to sit left of a dash became a card: mastering
 * engineers, label names, "DJ Unknown", and Discogs' disambiguation suffixes
 * rendered verbatim as "Nirvana (2)".
 *
 * Release titles are still the candidate *source* — Discogs' artist search
 * does not honour genre or year, so a genre-constrained deck has nowhere else
 * to come from — but every candidate now has to resolve to a real artist
 * record before it can reach a card.
 */

type Route = { match: string; body: unknown };

let requested: string[] = [];

function serve(routes: Route[]) {
  (global as { fetch?: unknown }).fetch = jest.fn(async (input: unknown) => {
    const url = String(input);
    requested.push(url);
    const route = routes.find((candidate) => url.includes(candidate.match));
    if (!route) {
      return { ok: true, json: async () => ({ results: [] }), text: async () => "" };
    }
    return { ok: true, json: async () => route.body, text: async () => "" };
  });
}

/** A master-release search result, the shape both artist paths sample from. */
const master = (id: number, title: string) => ({
  id,
  title,
  year: 2001,
  cover_image: `https://img.example/${id}.jpg`,
  type: "master",
});

const artistRecord = (id: number, title: string) => ({
  id,
  title,
  type: "artist",
  cover_image: `https://img.example/artist-${id}.jpg`,
});

/**
 * Resolves only the names given, so anything else is a name Discogs has no
 * artist record for — the junk this fix exists to drop.
 */
function serveArtistLookups(releases: unknown[], resolvable: Record<string, number>) {
  (global as { fetch?: unknown }).fetch = jest.fn(async (input: unknown) => {
    const url = String(input);
    requested.push(url);
    const parsed = new URL(url);
    if (parsed.searchParams.get("type") === "artist") {
      const query = parsed.searchParams.get("q") ?? "";
      const id = resolvable[query];
      return {
        ok: true,
        json: async () => ({ results: id ? [artistRecord(id, query)] : [] }),
        text: async () => "",
      };
    }
    return { ok: true, json: async () => ({ results: releases }), text: async () => "" };
  });
}

beforeEach(() => {
  requested = [];
  clearRequestCache();
});

afterEach(() => {
  delete (global as { fetch?: unknown }).fetch;
});

describe.each([
  ["randomArtists", () => randomArtists({ page: 1 })],
  ["filterArtists", () => filterArtists({ genres: [], page: 1 })],
] as const)("%s", (_label, run) => {
  it("drops names that resolve to no artist record", async () => {
    serveArtistLookups(
      [
        master(1, "Portishead - Dummy"),
        master(2, "Some Mastering Studio - Various Cuts"),
        master(3, "Aphex Twin - Selected Ambient Works"),
      ],
      { Portishead: 4321, "Aphex Twin": 8765 }
    );

    const artists = await run();

    expect(artists.map((artist) => artist.title)).toEqual([
      "Portishead",
      "Aphex Twin",
    ]);
    expect(artists.map((artist) => artist.id)).toEqual(["4321", "8765"]);
  });

  it("carries a real Discogs id rather than the scraped name", async () => {
    serveArtistLookups([master(1, "Portishead - Dummy")], { Portishead: 4321 });

    const [artist] = await run();

    expect(artist.id).toBe("4321");
    expect(artist.id.startsWith("name:")).toBe(false);
  });

  // "Nirvana (2)" is Discogs disambiguating two bands of the same name. It is
  // catalogue bookkeeping, and it was reaching the card face.
  it("strips the disambiguation suffix from the name it shows and looks up", async () => {
    serveArtistLookups([master(1, "Nirvana (2) - Nevermind")], { Nirvana: 5566 });

    const [artist] = await run();

    expect(artist.title).toBe("Nirvana");
    const lookups = requested.filter((url) => url.includes("type=artist"));
    expect(lookups.some((url) => url.includes("Nirvana+%282%29"))).toBe(false);
  });

  it("treats a compilation credit as no artist at all", async () => {
    serveArtistLookups(
      [master(1, "Various - Now That's What I Call Music"), master(2, "Slowdive - Souvlaki")],
      { Slowdive: 7788, Various: 1 }
    );

    const artists = await run();

    expect(artists.map((artist) => artist.title)).toEqual(["Slowdive"]);
  });

  it("asks for one artist per distinct name, not one per release", async () => {
    serveArtistLookups(
      [
        master(1, "Portishead - Dummy"),
        master(2, "Portishead - Third"),
        master(3, "Portishead - Roseland NYC Live"),
      ],
      { Portishead: 4321 }
    );

    await run();

    const lookups = requested.filter((url) => url.includes("type=artist"));
    expect(lookups).toHaveLength(1);
  });

  it("returns nothing rather than junk when no candidate resolves", async () => {
    serveArtistLookups([master(1, "Unknown Engineer - Test Pressing")], {});

    await expect(run()).resolves.toEqual([]);
  });
});

describe("randomArtists", () => {
  it("still samples releases, since artist search ignores genre and year", async () => {
    serve([{ match: "/database/search", body: { results: [] } }]);

    await randomArtists({ page: 1 });

    const searches = requested.filter((url) => url.includes("/database/search"));
    expect(searches[0]).toContain("type=master");
    expect(searches[0]).toContain("year=");
  });
});
