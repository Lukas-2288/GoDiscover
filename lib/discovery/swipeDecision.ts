export type CardDecision = "save" | "skip";

export type SwipeSample = {
  translationX: number;
  velocityX: number;
  cardWidth: number;
};

const CLAIM_HORIZONTAL_FLOOR = 8;
const CLAIM_HORIZONTAL_TO_VERTICAL_RATIO = 0.8;
const COMMIT_DISTANCE_RATIO = 0.18;
const COMMIT_VELOCITY = 0.5;

export function shouldClaimSwipe(translationX: number, translationY: number): boolean {
  const horizontal = Math.abs(translationX);
  return horizontal >= CLAIM_HORIZONTAL_FLOOR
    && horizontal >= Math.abs(translationY) * CLAIM_HORIZONTAL_TO_VERTICAL_RATIO;
}

export function resolveSwipeDecision(sample: SwipeSample): CardDecision | null {
  const distanceReached = Math.abs(sample.translationX) >= sample.cardWidth * COMMIT_DISTANCE_RATIO;
  const velocityReached = Math.abs(sample.velocityX) >= COMMIT_VELOCITY;
  if (!distanceReached && !velocityReached) return null;

  const direction = Math.abs(sample.translationX) >= 8
    ? sample.translationX
    : sample.velocityX;
  return direction > 0 ? "save" : "skip";
}
