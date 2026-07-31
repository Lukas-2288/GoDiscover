import type { ResultItem } from "../../../types/content";
import {
  MAX_PER_CREATOR,
  capPerCreator,
  creatorKeyFor,
  diversifyDeck,
} from "../deckDiversity";
import { loadDiscovery, type DiscoveryProviderRegistry } from "../loadDiscovery";
import subjectFixture from "../../api/__tests__/fixtures/openlibrary-subject-sciencefiction.json";
import similarFixture from "../../api/__tests__/fixtures/tmdb-similar-dune.json";

/**
 * Whether a deck is varied, as opposed to merely correct.
 *
 * Drawn from responses recorded off the real providers, because this is never
 * a bug in any single result — each one is individually defensible. The
 * recorded science-fiction search returns ten books and spends four slots on
 * two authors. Accuracy-shaped tests pass on that, which is exactly why
 * diversity is its own axis.
 *
 * It only applies where the provider hands over an exact creator. Books and
 * albums do. Films do not — their subtitle is the release year — and inferring
 * a franchise from title text was tried and backed out: the same rule that
 * groups three Tremors sequels also groups "movie 2" with "movie 3".
 */

function item(id: string, title: string, subtitle: string): ResultItem {
  return { id, title, subtitle, meta: "" };
}

describe("what counts as the same source", () => {
  // `subtitle` is the author on a book and the artist on an album — exact,
  // provider-supplied facts rather than anything inferred.
  it.each([
    ["books", "Octavia E. Butler"],
    ["albums", "Björk"],
  ] as const)("uses the creator in the subtitle for %s", (category, creator) => {
    const key = creatorKeyFor(category);
    expect(key?.(item("1", "Anything", creator))).toBe(creator.toLowerCase());
  });

  // A film's subtitle is its release year, so there is no exact creator to
  // group on. Grouping by title stem was tried and rejected: it reads
  // "movie 2" and "movie 3" as one franchise.
  it.each(["movies", "artists"] as const)("caps nothing for %s", (category) => {
    expect(creatorKeyFor(category)).toBeNull();
  });
});

describe("capping a deck", () => {
  const bySubtitle = (entry: ResultItem) => entry.subtitle.toLowerCase();

  it("keeps at most two from one creator, in the order they arrived", () => {
    const capped = capPerCreator(
      [
        item("1", "First", "Adams"),
        item("2", "Second", "Adams"),
        item("3", "Third", "Adams"),
        item("4", "Other", "Weir"),
      ],
      bySubtitle
    );

    expect(capped.map((entry) => entry.id)).toEqual(["1", "2", "4"]);
  });

  it("leaves an already-varied deck untouched", () => {
    const deck = [
      item("1", "A", "Adams"),
      item("2", "B", "Weir"),
      item("3", "C", "Le Guin"),
    ];
    expect(capPerCreator(deck, bySubtitle)).toEqual(deck);
  });

  it("does not treat missing attribution as repetition", () => {
    const capped = capPerCreator(
      [item("1", "A", ""), item("2", "B", ""), item("3", "C", "")],
      bySubtitle
    );
    expect(capped).toHaveLength(3);
  });

  // The same call `applyDiscoveryContext` makes about damping: a repetitive
  // deck still beats an empty one.
  it("returns the original rather than nothing", () => {
    const deck = [item("1", "A", "Adams")];
    expect(capPerCreator(deck, bySubtitle, 0)).toEqual(deck);
  });
});

describe("the decks the real providers returned", () => {
  it("thins the recorded science fiction shelf down to one book per author", () => {
    const books = (subjectFixture.body.docs as {
      key: string;
      title: string;
      author_name?: string[];
    }[]).map((doc) =>
      item(doc.key, doc.title, doc.author_name?.[0] ?? "Unknown author")
    );

    // What the provider actually sent: Douglas Adams twice, Andy Weir twice.
    const authors = books.map((entry) => entry.subtitle);
    expect(authors.filter((name) => name === "Douglas Adams")).toHaveLength(2);
    expect(authors.filter((name) => name === "Andy Weir")).toHaveLength(2);

    const varied = diversifyDeck(books, "books");
    const keptAuthors = varied.map((entry) => entry.subtitle);
    for (const author of new Set(keptAuthors)) {
      expect(keptAuthors.filter((name) => name === author).length)
        .toBeLessThanOrEqual(MAX_PER_CREATOR);
    }
  });

  // Three Tremors sequels really are in this deck. They stay, because the only
  // way to spot them is a guess at the title, and that guess is not safe.
  it("leaves a film deck whole, sequels and all", () => {
    const films = (similarFixture.body.results as {
      id: number;
      title: string;
      release_date?: string;
    }[]).map((movie) =>
      item(String(movie.id), movie.title, (movie.release_date ?? "").slice(0, 4))
    );

    expect(
      films.filter((entry) => entry.title.startsWith("Tremors")).length
    ).toBeGreaterThan(MAX_PER_CREATOR);
    expect(diversifyDeck(films, "movies")).toHaveLength(films.length);
  });

  it("does not thin a film deck merely for sharing a year", () => {
    const sameYear = [
      item("1", "Arrival", "2016"),
      item("2", "Moonlight", "2016"),
      item("3", "La La Land", "2016"),
    ];
    expect(diversifyDeck(sameYear, "movies")).toHaveLength(3);
  });
});

describe("every mode gets the same treatment", () => {
  function registry(results: ResultItem[]): DiscoveryProviderRegistry {
    const provider = () => ({
      search: jest.fn(async () => results),
      random: jest.fn(async () => results),
      filter: jest.fn(async () => results),
      similar: jest.fn(async () => results),
      fresh: jest.fn(async () => results),
      underground: jest.fn(async () => results),
    });
    return {
      movies: provider(),
      books: provider(),
      artists: provider(),
      albums: provider(),
    } as unknown as DiscoveryProviderRegistry;
  }

  const lopsided = [
    item("1", "First", "Adams"),
    item("2", "Second", "Adams"),
    item("3", "Third", "Adams"),
  ];

  // Applied once in loadDiscovery rather than per provider, so no mode can be
  // forgotten — which is how the mode plumbing went wrong before.
  it.each(["randomize", "filter", "fresh", "underground"] as const)(
    "caps a %s deck",
    async (mode) => {
      const loaded = await loadDiscovery(
        { category: "books", mode, filters: [] } as never,
        registry(lopsided)
      );
      expect(loaded).toHaveLength(MAX_PER_CREATOR);
    }
  );

  it("caps a similar deck too", async () => {
    const loaded = await loadDiscovery(
      { category: "books", mode: "similar", seed: item("seed", "Seed", "Someone") },
      registry(lopsided)
    );
    expect(loaded).toHaveLength(MAX_PER_CREATOR);
  });

  it("leaves an artist deck at full length", async () => {
    const artists = [
      item("1", "Portishead", "Artist"),
      item("2", "Massive Attack", "Artist"),
      item("3", "Tricky", "Artist"),
    ];
    const loaded = await loadDiscovery(
      { category: "artists", mode: "randomize" },
      registry(artists)
    );
    expect(loaded).toHaveLength(3);
  });
});
