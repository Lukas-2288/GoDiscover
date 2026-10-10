export type MotionSpec = {
  commitDurationMs: number;
  resetDurationMs: number;
  rotateDegrees: number;
  scaleDelta: number;
};

export function getMotionSpec(reducedMotion: boolean): MotionSpec {
  return reducedMotion
    ? { commitDurationMs: 0, resetDurationMs: 0, rotateDegrees: 0, scaleDelta: 0 }
    : { commitDurationMs: 220, resetDurationMs: 180, rotateDegrees: 8, scaleDelta: 0.035 };
}
