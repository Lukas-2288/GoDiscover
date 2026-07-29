import { clearRequestCache } from "../requestCache";
import { getSimilarBooks, sharesSubject } from "../openlibrary";
import seedFixture from "./fixtures/openlibrary-search-kindred.json";
import subjectFixture from "./fixtures/openlibrary-subject-sciencefiction.json";

/**
 * "If we hit recommend me a different book it has to make sense."
 *
 * It did not have to. Music similarity has been pinned since the Chappell Roan
 * report — era windows, style precision, seed exclusion, tier widening — but
 * `getSimilarBooks` had no test of any kind, and no `openlibrary.test.ts`
 * existed at all. Nothing said a book recommendation had to resemble the book
 * it came from, and two things ensured it often did not.
 *
 * The query led with whatever subject Open Library listed first, which for
 * Kindred is "Fiction" — so it asked for every novel ever catalogued. And
 * `subject:` matching is fuzzy, so even a precise query comes back with works
 * that do not carry the subject at all.
 *
 * These run against responses recorded from the real Open Library by
 * `scripts/record-fixtures.mjs`. Both failures are properties of the actual
 * catalogue and neither would appear in a hand-written mock.
 */

type Doc = {
  key: string;
  title: string;
  subject?: string[];
  cover_i?: number;
  author_name?: string[];
};

const SUBJECT_DOCS = subjectFixture.body.docs as Doc[];
/** Kindred's real subject list, from the recorded search. */
const KINDRED_SUBJECTS = (seedFixture.body.docs[0].subject ?? []) as string[];

let requested: string[] = [];

function serve(work: unknown, docs: readonly unknown[]) {
  (global as { fetch?: unknown }).fetch = jest.fn(async (input: unknown) => {
    const url = String(input);
    requested.push(url);
    const body = url.includes("/search.json")
      ? { docs, numFound: docs.length }
      : work;
    return { ok: true, json: async () => body, text: async () => "" };
  });
}

function workOf(subjects: readonly string[]) {
  return { key: "/works/SEED", title: "Seed", subjects, covers: [1] };
}

beforeEach(() => {
  requested = [];
  clearRequestCache();
});

afterEach(() => {
  delete (global as { fetch?: unknown }).fetch;
});

describe("recognising a shared subject", () => {
  it.each([
    ["exactly", ["Science fiction"], ["Science fiction"]],
    ["in case", ["Science Fiction"], ["science fiction"]],
    // Kindred files it with a space, Project Hail Mary with a hyphen.
    ["in punctuation", ["Science fiction"], ["science-fiction"]],
    ["by a trailing qualifier", ["Science fiction"], ["Science fiction, American"]],
  ])("matches subjects differing only %s", (_label, seed, candidate) => {
    expect(sharesSubject(seed, candidate)).toBe(true);
  });

  it("does not match unrelated subjects", () => {
    expect(sharesSubject(["Time travel"], ["Cookery", "Baking"])).toBe(false);
  });

  // "Fiction" is the load-bearing case: Kindred carries it, and so does every
  // novel. Treating it as evidence makes the whole check vacuous.
  it.each(["Fiction", "Literature", "General", "American"])(
    "refuses to treat %s as evidence of anything",
    (broad) => {
      expect(sharesSubject([broad], [broad])).toBe(false);
    }
  );

  // A seed's broad subject must not swallow a candidate's precise one.
  it("does not let a general seed subject match a specific candidate", () => {
    expect(sharesSubject(["Fantasy"], ["Fantasy fiction, epic"])).toBe(false);
  });

  it("needs something on both sides", () => {
    expect(sharesSubject([], ["Science fiction"])).toBe(false);
    expect(sharesSubject(["Science fiction"], undefined)).toBe(false);
  });
});

describe("building the query", () => {
  // The original took the first three subjects the API happened to list.
  // Kindred's list opens with "Fiction", so it asked for the catalogue.
  it("skips subjects too broad to narrow anything", async () => {
    serve(workOf(KINDRED_SUBJECTS), []);

    await getSimilarBooks("SEED");

    const search = decodeURIComponent(requested[1]);
    expect(search).not.toContain('subject:"fiction"');
    // What Kindred is actually about.
    expect(search).toContain('subject:"slaves"');
  });

  it("asks for nothing at all when no subject is specific enough", async () => {
    serve(workOf(["Fiction", "Literature", "General"]), SUBJECT_DOCS);

    await expect(getSimilarBooks("SEED")).resolves.toEqual([]);
    expect(requested.filter((url) => url.includes("/search.json"))).toHaveLength(0);
  });

  it("sorts by rating, so a thin record does not lead the deck", async () => {
    serve(workOf(["Time travel"]), []);

    await getSimilarBooks("SEED");

    expect(requested[1]).toContain("sort=rating");
  });
});

describe("recommending a different book", () => {
  const SCIENCE_FICTION = workOf(["Science fiction"]);

  // The headline guarantee, and the one that was missing.
  it("returns only books that carry a subject it searched for", async () => {
    serve(SCIENCE_FICTION, SUBJECT_DOCS);

    const similar = await getSimilarBooks("SEED");

    expect(similar.length).toBeGreaterThan(0);
    const subjectsById = new Map(
      SUBJECT_DOCS.map((doc) => [doc.key.replace("/works/", ""), doc.subject])
    );
    for (const item of similar) {
      expect(sharesSubject(["Science fiction"], subjectsById.get(item.id))).toBe(true);
    }
  });

  // The concrete case. Open Library returns this from a science-fiction subject
  // search; its record is fantasy and carries no science-fiction subject.
  it("drops The Two Towers from a science fiction search", async () => {
    serve(SCIENCE_FICTION, SUBJECT_DOCS);

    const similar = await getSimilarBooks("SEED");

    expect(similar.map((item) => item.title)).not.toContain("The Two Towers");
    // And keeps the ones that genuinely belong.
    expect(similar.map((item) => item.title)).toContain("Project Hail Mary");
  });

  it("never hands back the seed itself", async () => {
    serve(SCIENCE_FICTION, [
      { ...SUBJECT_DOCS[0], key: "/works/SEED", title: "Seed" },
      ...SUBJECT_DOCS.slice(1),
    ]);

    const similar = await getSimilarBooks("SEED");

    expect(similar.map((item) => item.id)).not.toContain("SEED");
  });

  it("skips books with no cover rather than showing a blank card", async () => {
    serve(SCIENCE_FICTION, [
      { ...SUBJECT_DOCS[0], key: "/works/NOCOVER", title: "Coverless", cover_i: undefined },
      ...SUBJECT_DOCS.slice(1),
    ]);

    const similar = await getSimilarBooks("SEED");

    expect(similar.map((item) => item.title)).not.toContain("Coverless");
  });

  // A thin deck of loose matches still beats a dead end.
  it("falls back to the search's own results rather than returning nothing", async () => {
    serve(workOf(["Time travel"]), [
      { key: "/works/A", title: "Unrelated", cover_i: 1, subject: ["Cookery"] },
    ]);

    const similar = await getSimilarBooks("SEED");

    expect(similar.map((item) => item.title)).toEqual(["Unrelated"]);
  });

  it("caps the deck at ten", async () => {
    serve(SCIENCE_FICTION, [
      ...SUBJECT_DOCS,
      ...SUBJECT_DOCS.map((doc, index) => ({
        ...doc,
        key: `/works/EXTRA${index}`,
        title: `Extra ${index}`,
      })),
    ]);

    const similar = await getSimilarBooks("SEED");

    expect(similar.length).toBeLessThanOrEqual(10);
  });
});
