import type { ResultItem } from "../../../types/content";
import {
  DEFAULT_SAVE_INTENT,
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
