import { createDiscoveryRequestTracker } from "../requestTracker";

describe("createDiscoveryRequestTracker", () => {
  it("recognizes only its current request", () => {
    const tracker = createDiscoveryRequestTracker();
    const first = tracker.start("movies");
    const second = tracker.start("books");

    expect(tracker.isCurrent(first)).toBe(false);
    expect(tracker.isCurrent(second)).toBe(true);
    expect(
      tracker.isCurrent({ id: second.id, category: "movies" })
    ).toBe(false);
  });

  it("invalidates an in-flight request", () => {
    const tracker = createDiscoveryRequestTracker();
    const request = tracker.start("albums");

    tracker.invalidate();

    expect(tracker.isCurrent(request)).toBe(false);
  });
});
