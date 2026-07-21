import { getMotionSpec } from "../motion";

describe("getMotionSpec", () => {
  it("uses snappy standard motion", () => {
    expect(getMotionSpec(false)).toEqual({
      commitDurationMs: 220,
      resetDurationMs: 180,
      rotateDegrees: 8,
      scaleDelta: 0.035,
    });
  });

  it("removes motion when the system preference requests it", () => {
    expect(getMotionSpec(true)).toEqual({
      commitDurationMs: 0,
      resetDurationMs: 0,
      rotateDegrees: 0,
      scaleDelta: 0,
    });
  });
});
