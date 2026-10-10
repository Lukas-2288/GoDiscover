import { resolveSwipeDecision, shouldClaimSwipe } from "../swipeDecision";

describe("resolveSwipeDecision", () => {
  it("commits by distance", () => {
    expect(resolveSwipeDecision({ translationX: 90, velocityX: 0, cardWidth: 300 })).toBe("save");
    expect(resolveSwipeDecision({ translationX: -90, velocityX: 0, cardWidth: 300 })).toBe("skip");
    expect(resolveSwipeDecision({ translationX: 60, velocityX: 0.2, cardWidth: 300 })).toBe("save");
    expect(resolveSwipeDecision({ translationX: -60, velocityX: -0.2, cardWidth: 300 })).toBe("skip");
  });

  it("commits a short fast flick but rejects a weak drag", () => {
    expect(resolveSwipeDecision({ translationX: 30, velocityX: 0.9, cardWidth: 300 })).toBe("save");
    expect(resolveSwipeDecision({ translationX: 30, velocityX: 0.6, cardWidth: 300 })).toBe("save");
    expect(resolveSwipeDecision({ translationX: 30, velocityX: 0.2, cardWidth: 300 })).toBeNull();
  });

  it("claims horizontal intent without stealing vertical scroll", () => {
    expect(shouldClaimSwipe(12, 4)).toBe(true);
    expect(shouldClaimSwipe(6, 1)).toBe(false);
    expect(shouldClaimSwipe(12, 14)).toBe(true);
    expect(shouldClaimSwipe(-12, 14)).toBe(true);
    expect(shouldClaimSwipe(12, 20)).toBe(false);
  });
});
