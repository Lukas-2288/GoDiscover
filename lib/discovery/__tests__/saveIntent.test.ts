import type { ResultItem } from "../../../types/content";
import {
  DEFAULT_SAVE_INTENT,
  applySaveIntent,
  contextForSaveIntent,
  isSaveIntent,
  requestForSaveIntent,
} from "../saveIntent";

const captainAmerica: ResultItem = {
  id: "cap",
  title: "Captain America",
  subtitle: "2011",
  meta: "",
  traits: ["Action", "Adventure"],
};

describe("save intent", () => {
  it("seeds Similar from the saved item when the user wants more like it", () => {
    expect(requestForSaveIntent("movies", captainAmerica, "more-like-this")).toEqual({
      category: "movies",
      mode: "similar",
      seed: captainAmerica,
    });
  });

  // The complaint: saving one superhero film produced only superhero films.
  it("steers away from the saved item's own genres when the user wants a change", () => {
    const context = contextForSaveIntent(captainAmerica, "something-different");
    expect(context.dampedTraits).toEqual(
      expect.arrayContaining(["Action", "Adventure"])
    );
    expect(requestForSaveIntent("movies", captainAmerica, "something-different")).toEqual({
      category: "movies",
      mode: "randomize",
    });
  });

  it("leaves the context untouched when the user wants more like it", () => {
    const base = { dampedTraits: ["Horror"] };
    expect(contextForSaveIntent(captainAmerica, "more-like-this", base)).toBe(base);
  });

  it("keeps standing rejections alongside the one-off steer", () => {
    const context = contextForSaveIntent(captainAmerica, "something-different", {
      dampedTraits: ["Horror"],
    });
    expect(context.dampedTraits).toEqual(
      expect.arrayContaining(["Horror", "Action", "Adventure"])
    );
    // No duplicates, so a genre is not damped twice.
    expect(new Set(context.dampedTraits).size).toBe(context.dampedTraits!.length);
  });

  it("cannot steer away from an item with no trait data", () => {
    const untagged: ResultItem = { id: "x", title: "X", subtitle: "", meta: "" };
    expect(contextForSaveIntent(untagged, "something-different")).toEqual({});
  });

  it("defaults to more like this and validates stored values", () => {
    expect(DEFAULT_SAVE_INTENT).toBe("more-like-this");
    expect(isSaveIntent("something-different")).toBe(true);
    expect(isSaveIntent("nonsense")).toBe(false);
    expect(isSaveIntent(null)).toBe(false);
  });
});

describe("applying intent to orbit recommendations", () => {
  const candidates = [
    { category: "movies" as const, id: "clone-1", reason: { kind: "provider-similar" } },
    { category: "movies" as const, id: "clone-2", reason: { kind: "provider-similar" } },
    { category: "books" as const, id: "book", reason: { kind: "shared-subject" } },
    { category: "movies" as const, id: "themed", reason: { kind: "shared-genre" } },
  ];

  it("leaves the ranking alone when the user wants more like it", () => {
    expect(
      applySaveIntent(candidates, "movies", "more-like-this").map((c) => c.id)
    ).toEqual(["clone-1", "clone-2", "book", "themed"]);
  });

  // Provider-native similars score 0.9 against 0.66-0.68 for trait matches, so
  // they take every slot — that is the near-clone problem.
  it("drops near-clones and leads with other media when the user wants a change", () => {
    const widened = applySaveIntent(candidates, "movies", "something-different");
    expect(widened.map((c) => c.id)).toEqual(["book", "themed"]);
    expect(widened[0].category).not.toBe("movies");
  });

  it("keeps near-clones rather than showing an empty orbit", () => {
    const onlyClones = candidates.filter(
      (c) => c.reason.kind === "provider-similar"
    );
    expect(
      applySaveIntent(onlyClones, "movies", "something-different")
    ).toHaveLength(onlyClones.length);
  });
});
