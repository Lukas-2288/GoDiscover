import { pickRandomEraWindow, RANDOM_ERA_WINDOWS } from "../discogs";

// Artists and Albums felt stuck in the 80s and 90s because randomAlbums and
// randomArtists passed no `year` at all, leaving Discogs' own ordering to
// decide — and Discogs is a record-collector catalogue whose `master` releases
// are dominated by the vinyl era. Spreading the query across explicit decades
// is what puts recent music back in rotation.
describe("random era windows", () => {
  it("covers every decade from the 60s to the present", () => {
    const covered = RANDOM_ERA_WINDOWS.map((window) => window.yearFrom).sort(
      (left, right) => left - right
    );
    expect(covered[0]).toBeLessThanOrEqual(1960);
    expect(covered[covered.length - 1]).toBeGreaterThanOrEqual(2020);
    for (const window of RANDOM_ERA_WINDOWS) {
      expect(window.yearTo).toBeGreaterThanOrEqual(window.yearFrom);
      expect(window.weight).toBeGreaterThan(0);
    }
  });

  it("gives this century at least half the total weight", () => {
    const total = RANDOM_ERA_WINDOWS.reduce(
      (sum, window) => sum + window.weight,
      0
    );
    const modern = RANDOM_ERA_WINDOWS.filter(
      (window) => window.yearFrom >= 2000
    ).reduce((sum, window) => sum + window.weight, 0);
    expect(modern / total).toBeGreaterThanOrEqual(0.5);
  });

  it("selects deterministically from the injected roll", () => {
    const first = pickRandomEraWindow(() => 0);
    const last = pickRandomEraWindow(() => 0.999_999);
    expect(first).toEqual(RANDOM_ERA_WINDOWS[0]);
    expect(last).toEqual(RANDOM_ERA_WINDOWS[RANDOM_ERA_WINDOWS.length - 1]);
  });

  it("reaches every window across the unit interval", () => {
    const reached = new Set<number>();
    for (let roll = 0; roll < 1; roll += 0.001) {
      reached.add(pickRandomEraWindow(() => roll).yearFrom);
    }
    expect(reached.size).toBe(RANDOM_ERA_WINDOWS.length);
  });
});
