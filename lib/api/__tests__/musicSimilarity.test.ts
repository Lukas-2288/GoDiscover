import { clearRequestCache } from "../requestCache";

// discogs.ts reads its token once at module load, so this has to be set before
// the require below — which is why this file uses require rather than import.
process.env.EXPO_PUBLIC_DISCOGS_TOKEN = "test-token";

const {
  eraNeighbourhood,
  getSimilarAlbums,
  getSimilarArtists,
  // eslint-disable-next-line @typescript-eslint/no-var-requires
} = require("../discogs") as typeof import("../discogs");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { similarArtistNames } = require("../lastfm") as typeof import("../lastfm");

/**
 * The report was "I had Chappell Roan's The Giver, pressed Find similar, and
 * got Black Bear Road by C.W. McCall". Both are tagged Country; that is the
 * entire extent of what Discogs knows about them, and nothing constrained the
 * year, so a 2025 single and a 1975 trucker album were equally valid answers.
 *
 * These pin the two mechanisms that fix it: a year window around the seed, and
 * Last.fm's listening-data graph when a key is present.
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
    if (route.body instanceof Error) throw route.body;
    return { ok: true, json: async () => route.body, text: async () => "" };
  });
}

function searchesFor(fragment: string): string[] {
  return requested.filter(
    (url) => url.includes("/database/search") && url.includes(fragment)
  );
}

const master = (id: number, title: string, year: number) => ({
  id,
  title,
  year,
  cover_image: `https://img.example/${id}.jpg`,
  type: "master",
});

const SEED_RELEASE = {
  id: 9001,
  title: "The Giver",
  artists: [{ name: "Chappell Roan" }],
  year: 2025,
  genres: ["Folk, World, & Country"],
  styles: ["Country"],
  tracklist: [],
};

const LASTFM_NEIGHBOURS = {
  similarartists: {
    artist: [
      { name: "Sabrina Carpenter" },
      { name: "Olivia Rodrigo" },
      { name: "Renée Rapp" },
      { name: "Gracie Abrams" },
    ],
  },
};

beforeEach(() => {
  requested = [];
  clearRequestCache();
  delete process.env.EXPO_PUBLIC_LASTFM_API_KEY;
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("eraNeighbourhood", () => {
  it("brackets the seed's own year rather than the whole catalogue", () => {
    expect(eraNeighbourhood(1985)).toBe("1975-1995");
  });

  it("does not ask for years that have not happened", () => {
    const thisYear = new Date().getFullYear();
    expect(eraNeighbourhood(thisYear)).toBe(`${thisYear - 10}-${thisYear}`);
  });

  it("omits the window entirely when the seed has no year", () => {
    expect(eraNeighbourhood(undefined)).toBeUndefined();
    expect(eraNeighbourhood(0)).toBeUndefined();
    expect(eraNeighbourhood(Number.NaN)).toBeUndefined();
  });
});

describe("similar albums without a Last.fm key", () => {
  it("constrains the search to a decade either side of the seed", async () => {
    serve([
      { match: "/masters/701", body: { main_release: 9001 } },
      { match: "/releases/9001", body: SEED_RELEASE },
      {
        match: "/database/search",
        body: { results: [master(2, "Kacey Musgraves - Golden Hour", 2018)] },
      },
    ]);

    await getSimilarAlbums("701");

    const [search] = searchesFor("style=Country");
    expect(search).toBeDefined();
    expect(search).toContain(`year=${eraNeighbourhood(SEED_RELEASE.year)}`);
    expect(search).toContain("year=2015-");
  });

  it("sends the seed's style alone, not style plus its broad genre", async () => {
    serve([
      { match: "/masters/701", body: { main_release: 9001 } },
      { match: "/releases/9001", body: SEED_RELEASE },
      {
        match: "/database/search",
        body: { results: [master(2, "Kacey Musgraves - Golden Hour", 2018)] },
      },
    ]);

    await getSimilarAlbums("701");

    // Sending both let a broad genre widen a search the style had narrowed.
    const [search] = searchesFor("style=Country");
    expect(search).not.toContain("genre=");
  });

  it("widens a step at a time only when a narrower search finds nothing", async () => {
    let call = 0;
    (global as { fetch?: unknown }).fetch = jest.fn(async (input: unknown) => {
      const url = String(input);
      requested.push(url);
      if (url.includes("/masters/701")) {
        return { ok: true, json: async () => ({ main_release: 9001 }) };
      }
      if (url.includes("/releases/9001")) {
        return { ok: true, json: async () => SEED_RELEASE };
      }
      call += 1;
      // Style+year, then style alone, then genre+year all come back empty.
      const results =
        call >= 4 ? [master(2, "Willie Nelson - Stardust", 1978)] : [];
      return { ok: true, json: async () => ({ results }) };
    });

    const items = await getSimilarAlbums("701");

    const searches = searchesFor("/database/search");
    expect(searches).toHaveLength(4);
    expect(searches[0]).toContain("style=Country");
    expect(searches[0]).toContain("year=");
    expect(searches[1]).toContain("style=Country");
    expect(searches[1]).not.toContain("year=");
    expect(searches[3]).toContain("genre=");
    expect(items).toHaveLength(1);
  });

  it("never calls Last.fm when there is no key", async () => {
    serve([
      { match: "/masters/701", body: { main_release: 9001 } },
      { match: "/releases/9001", body: SEED_RELEASE },
      {
        match: "/database/search",
        body: { results: [master(2, "Kacey Musgraves - Golden Hour", 2018)] },
      },
    ]);

    await getSimilarAlbums("701");

    expect(requested.some((url) => url.includes("audioscrobbler"))).toBe(false);
  });
});

describe("similar albums with a Last.fm key", () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_LASTFM_API_KEY = "test-key";
  });

  it("looks up records by artists Last.fm considers close to the seed", async () => {
    serve([
      { match: "/masters/701", body: { main_release: 9001 } },
      { match: "/releases/9001", body: SEED_RELEASE },
      { match: "audioscrobbler", body: LASTFM_NEIGHBOURS },
      {
        match: "q=Sabrina",
        body: { results: [master(11, "Sabrina Carpenter - Short n' Sweet", 2024)] },
      },
      {
        match: "q=Olivia",
        body: { results: [master(12, "Olivia Rodrigo - GUTS", 2023)] },
      },
      {
        match: "q=Ren",
        body: { results: [master(13, "Renée Rapp - Snow Angel", 2023)] },
      },
      {
        match: "q=Gracie",
        body: { results: [master(14, "Gracie Abrams - The Secret", 2024)] },
      },
    ]);

    const items = await getSimilarAlbums("701", { deterministic: true });

    expect(items.map((item) => item.subtitle)).toEqual(
      expect.arrayContaining(["Sabrina Carpenter", "Olivia Rodrigo"])
    );
    // The genre bucket is what produced C.W. McCall; it should not be reached.
    expect(searchesFor("style=Country")).toHaveLength(0);
  });

  it("falls back to the tag search when Last.fm finds too few to fill a rung", async () => {
    serve([
      { match: "/masters/701", body: { main_release: 9001 } },
      { match: "/releases/9001", body: SEED_RELEASE },
      {
        match: "audioscrobbler",
        body: { similarartists: { artist: [{ name: "Sabrina Carpenter" }] } },
      },
      {
        match: "q=Sabrina",
        body: { results: [master(11, "Sabrina Carpenter - Short n' Sweet", 2024)] },
      },
      {
        match: "style=Country",
        body: { results: [master(2, "Kacey Musgraves - Golden Hour", 2018)] },
      },
    ]);

    const items = await getSimilarAlbums("701", { deterministic: true });

    expect(searchesFor("style=Country")).not.toHaveLength(0);
    expect(items).not.toHaveLength(0);
  });

  it("survives a Last.fm outage instead of stranding the button", async () => {
    serve([
      { match: "/masters/701", body: { main_release: 9001 } },
      { match: "/releases/9001", body: SEED_RELEASE },
      { match: "audioscrobbler", body: new Error("network down") },
      {
        match: "style=Country",
        body: { results: [master(2, "Kacey Musgraves - Golden Hour", 2018)] },
      },
    ]);

    await expect(getSimilarAlbums("701")).resolves.toHaveLength(1);
  });

  it("does not hand back the seed album itself", async () => {
    serve([
      { match: "/masters/701", body: { main_release: 9001 } },
      { match: "/releases/9001", body: SEED_RELEASE },
      { match: "audioscrobbler", body: LASTFM_NEIGHBOURS },
      {
        match: "/database/search",
        body: {
          results: [
            master(11, "Sabrina Carpenter - Short n' Sweet", 2024),
            master(12, "Chappell Roan - The Giver", 2025),
          ],
        },
      },
    ]);

    const items = await getSimilarAlbums("701", { deterministic: true });

    expect(items.map((item) => item.title)).not.toContain("The Giver");
  });
});

describe("similar artists", () => {
  it("resolves Last.fm names to real Discogs artists, so art and detail work", async () => {
    process.env.EXPO_PUBLIC_LASTFM_API_KEY = "test-key";
    serve([
      { match: "/artists/55", body: { id: 55, name: "Chappell Roan" } },
      { match: "audioscrobbler", body: LASTFM_NEIGHBOURS },
      {
        match: "q=Sabrina",
        body: {
          results: [
            { id: 811, title: "Sabrina Carpenter", cover_image: "a.jpg", type: "artist" },
          ],
        },
      },
      {
        match: "q=Olivia",
        body: {
          results: [
            { id: 812, title: "Olivia Rodrigo", cover_image: "b.jpg", type: "artist" },
          ],
        },
      },
      {
        match: "q=Ren",
        body: {
          results: [
            { id: 813, title: "Renée Rapp", cover_image: "c.jpg", type: "artist" },
          ],
        },
      },
      {
        match: "q=Gracie",
        body: {
          results: [
            { id: 814, title: "Gracie Abrams", cover_image: "d.jpg", type: "artist" },
          ],
        },
      },
    ]);

    const items = await getSimilarArtists("55");

    expect(items.map((item) => item.title)).toEqual([
      "Sabrina Carpenter",
      "Olivia Rodrigo",
      "Renée Rapp",
      "Gracie Abrams",
    ]);
    // Real ids rather than `name:` placeholders, so the detail sheet loads.
    expect(items.map((item) => item.id)).toEqual(["811", "812", "813", "814"]);
    expect(items[0].imageUrl).toBe("a.jpg");
  });

  it("keeps a name placeholder when Discogs cannot find the artist", async () => {
    process.env.EXPO_PUBLIC_LASTFM_API_KEY = "test-key";
    serve([
      { match: "/artists/55", body: { id: 55, name: "Chappell Roan" } },
      { match: "audioscrobbler", body: LASTFM_NEIGHBOURS },
      { match: "type=artist", body: { results: [] } },
    ]);

    const items = await getSimilarArtists("55");

    expect(items[0].id).toBe("name:Sabrina%20Carpenter");
    expect(items[0].title).toBe("Sabrina Carpenter");
  });

  it("constrains the tag fallback to the era of the artist's own work", async () => {
    serve([
      // Ahead of the bare artist route, which would otherwise swallow this URL.
      {
        match: "/artists/55/releases",
        body: { releases: [{ id: 44, title: "x", type: "master", year: 2023 }] },
      },
      { match: "/artists/55", body: { id: 55, name: "Chappell Roan" } },
      {
        match: "/masters/44",
        body: { main_release: 1, styles: ["Synth-pop"], genres: ["Pop"], year: 2023 },
      },
      {
        match: "/database/search",
        body: { results: [master(3, "Carly Rae Jepsen - Emotion", 2015)] },
      },
    ]);

    const items = await getSimilarArtists("55");

    const [search] = searchesFor("style=Synth-pop");
    expect(search).toContain(`year=${eraNeighbourhood(2023)}`);
    expect(items[0].title).toBe("Carly Rae Jepsen");
  });
});

describe("similarArtistNames", () => {
  it("returns nothing at all without a key, and asks for nothing", async () => {
    serve([]);
    await expect(similarArtistNames("Chappell Roan")).resolves.toEqual([]);
    expect(requested).toHaveLength(0);
  });

  it("reads Last.fm's error body, which arrives with a 200", async () => {
    process.env.EXPO_PUBLIC_LASTFM_API_KEY = "test-key";
    serve([
      { match: "audioscrobbler", body: { error: 6, message: "Artist not found" } },
    ]);
    await expect(similarArtistNames("Nobody At All")).resolves.toEqual([]);
  });

  it("drops the seed itself, which autocorrect sometimes returns", async () => {
    process.env.EXPO_PUBLIC_LASTFM_API_KEY = "test-key";
    serve([
      {
        match: "audioscrobbler",
        body: {
          similarartists: {
            artist: [{ name: "chappell roan" }, { name: "Sabrina Carpenter" }],
          },
        },
      },
    ]);
    await expect(similarArtistNames("Chappell Roan")).resolves.toEqual([
      "Sabrina Carpenter",
    ]);
  });

  it("strips the disambiguation suffix Discogs adds and Last.fm has never seen", async () => {
    process.env.EXPO_PUBLIC_LASTFM_API_KEY = "test-key";
    serve([
      { match: "audioscrobbler", body: { similarartists: { artist: [] } } },
    ]);

    await similarArtistNames("Nirvana (2)");

    expect(requested[0]).toContain("artist=Nirvana");
    expect(requested[0]).not.toContain("2%29");
  });
});
