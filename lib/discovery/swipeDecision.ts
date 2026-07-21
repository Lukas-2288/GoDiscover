export type CardDecision = "save" | "skip";

export type SwipeSample = {
  translationX: number;
  velocityX: number;
  cardWidth: number;
};

export function shouldClaimSwipe(translationX: number, translationY: number): boolean {
  const horizontal = Math.abs(translationX);
  return horizontal >= 8 && horizontal >= Math.abs(translationY) * 1.2;
}

export function resolveSwipeDecision(sample: SwipeSample): CardDecision | null {
  const distanceReached = Math.abs(sample.translationX) >= sample.cardWidth * 0.24;
  const velocityReached = Math.abs(sample.velocityX) >= 0.75;
  if (!distanceReached && !velocityReached) return null;

  const direction = Math.abs(sample.translationX) >= 8
    ? sample.translationX
    : sample.velocityX;
  return direction > 0 ? "save" : "skip";
}
