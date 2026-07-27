import { pickRandomEraWindow, RANDOM_ERA_WINDOWS } from "../discogs";
import { MOVIE_ERA_WINDOWS } from "../tmdb";
import type { EraWindow } from "../discogs";

/**
 * Every category randomised towards whatever its provider happened to sort
 * first: Discogs' `master` catalogue is a vinyl-era archive, and TMDB's
 * `popularity.desc` is a *current* metric, so movies were nothing but the last
 * two years. Both now ask for an explicit decade instead.
 *
 * The subtlety worth pinning is that "even across every decade" is not neutral.
 * Equal weights over a range starting at 1960 puts ~57% of picks before 2000 —
 * more old music than the lopsided weights it replaced. Where the range *starts*
 * is the entire lever, so that is what these assert.
 */

const thisYear = new Date().getFullYear();

function totalWeight(windows: readonly EraWindow[]): number {
  return windows.reduce((sum, window) => sum + window.weight, 0);
}

function shareBefore(windows: readonly EraWindow[], year: number): number {
  const older = windows
    .filter((window) => window.yearFrom < year)
    .reduce((sum, window) => sum + window.weight, 0);
  return older / totalWeight(windows);
}

describe.each([
  ["music", RANDOM_ERA_WINDOWS, 1990],
  ["movies", MOVIE_ERA_WINDOWS, 1970],
] as const)("%s era windows", (_label, windows, expectedFloor) => {
  it("starts at the decade chosen for this category and runs to today", () => {
    const sorted = [...windows].sort((a, b) => a.yearFrom - b.yearFrom);
    expect(sorted[0].yearFrom).toBe(expectedFloor);
    expect(sorted[sorted.length - 1].yearTo).toBe(thisYear);
  });

  it("covers the decades in between with no gap and no overlap", () => {
    const sorted = [...windows].sort((a, b) => a.yearFrom - b.yearFrom);
    sorted.forEach((window, index) => {
      expect(window.yearFrom).toBe(expectedFloor + index * 10);
      expect(window.yearTo).toBeGreaterThanOrEqual(window.yearFrom);
      if (index > 0) {
        // The next window opens the year after the previous one closes.
        expect(window.yearFrom).toBe(sorted[index - 1].yearTo + 1);
      }
    });
  });

  it("weights every decade the same, so no era is favoured", () => {
    const weights = new Set(windows.map((window) => window.weight));
    expect(weights.size).toBe(1);
    expect([...weights][0]).toBeGreaterThan(0);
  });
});

describe("what an even spread actually yields", () => {
  // The number the choice of floor was made on: an even split from 1990 puts
  // a quarter of music picks in the last century, down from ~41% before.
  it("leaves music at a quarter pre-2000", () => {
    expect(shareBefore(RANDOM_ERA_WINDOWS, 2000)).toBeCloseTo(0.25, 5);
  });

  // Film's canon travels further back than pop music's, so movies deliberately
  // reach to 1970 and land at half.
  it("leaves movies at half pre-2000, reaching further back on purpose", () => {
    expect(shareBefore(MOVIE_ERA_WINDOWS, 2000)).toBeCloseTo(0.5, 5);
    expect(MOVIE_ERA_WINDOWS.length).toBeGreaterThan(RANDOM_ERA_WINDOWS.length);
  });
});

describe("pickRandomEraWindow", () => {
  it("selects deterministically from the injected roll", () => {
    expect(pickRandomEraWindow(() => 0)).toEqual(RANDOM_ERA_WINDOWS[0]);
    expect(pickRandomEraWindow(() => 0.999_999)).toEqual(
      RANDOM_ERA_WINDOWS[RANDOM_ERA_WINDOWS.length - 1]
    );
  });

  it("reaches every window across the unit interval", () => {
    const reached = new Set<number>();
    for (let roll = 0; roll < 1; roll += 0.001) {
      reached.add(pickRandomEraWindow(() => roll).yearFrom);
    }
    expect(reached.size).toBe(RANDOM_ERA_WINDOWS.length);
  });

  // Movies and music share one picker; passing the wrong set silently is how
  // movies would drift back onto the music floor.
  it("honours whichever window set it is handed", () => {
    expect(pickRandomEraWindow(() => 0, MOVIE_ERA_WINDOWS)).toEqual(
      MOVIE_ERA_WINDOWS[0]
    );
    const everyMovieWindow = new Set<number>();
    for (let roll = 0; roll < 1; roll += 0.001) {
      everyMovieWindow.add(
        pickRandomEraWindow(() => roll, MOVIE_ERA_WINDOWS).yearFrom
      );
    }
    expect(everyMovieWindow.size).toBe(MOVIE_ERA_WINDOWS.length);
  });

  it("clamps a roll outside the unit interval rather than falling off the end", () => {
    expect(pickRandomEraWindow(() => -1)).toEqual(RANDOM_ERA_WINDOWS[0]);
    expect(pickRandomEraWindow(() => 2)).toEqual(
      RANDOM_ERA_WINDOWS[RANDOM_ERA_WINDOWS.length - 1]
    );
  });
});
