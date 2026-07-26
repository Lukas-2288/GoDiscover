import { musicTraits } from "../discogs";

// Traits are what "Not for me" damps on, so a wrong label is worse than a
// missing one — it steers the user away from a genre they never rejected.
describe("music traits", () => {
  it("maps a Discogs genre onto the filter label", () => {
    expect(musicTraits(["Jazz"], [])).toEqual(["Jazz"]);
    expect(musicTraits(["Funk / Soul"], [])).toEqual(["R&B / Soul"]);
  });

  it("requires the style for labels that are a style of a broader genre", () => {
    // Rock alone must not claim Metal or Indie.
    expect(musicTraits(["Rock"], [])).toEqual(["Rock"]);
    expect(musicTraits(["Rock"], ["Heavy Metal"])).toEqual(
      expect.arrayContaining(["Metal"])
    );
    expect(musicTraits(["Rock"], ["Heavy Metal"])).not.toContain(
      "Indie / Alternative"
    );
  });

  it("returns undefined when nothing maps", () => {
    expect(musicTraits(["Brass & Military"], ["Marches"])).toBeUndefined();
    expect(musicTraits(undefined, undefined)).toBeUndefined();
    expect(musicTraits([], [])).toBeUndefined();
  });
});
