# Forgiving Swipe Intent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make natural diagonal and deliberate short card swipes reliably commit without stealing strongly vertical page movement.

**Architecture:** Keep `SwipeDeck` and its `PanResponder` integration unchanged. Adjust the pure gesture-policy functions in `lib/discovery/swipeDecision.ts`, prove the new boundaries in unit tests, and update the component-level responder test to verify the policy reaches the existing gesture commit path.

**Tech Stack:** React Native `PanResponder`, TypeScript, Jest, React Native Testing Library.

## Global Constraints

- Keep the existing eight-point horizontal activation floor.
- Claim when horizontal movement is at least 80 percent of vertical movement.
- Commit at 18 percent of card width or horizontal velocity 0.5.
- Keep a 10-percent-width drag at velocity 0.2 below the commit threshold.
- Preserve buttons as the complete non-gesture alternative.
- Do not change Save, Skip, Undo, animation, accessibility, API, or saved-item semantics.
- Work only in `/Users/lukassagmani/GoDiscover/.worktrees/playful-discovery-deck` on `feature/playful-discovery-deck`.
- Never print or commit `.env` values.

---

### Task 1: Make swipe intent and release thresholds forgiving

**Files:**
- Modify: `lib/discovery/__tests__/swipeDecision.test.ts`
- Modify: `components/discovery/__tests__/SwipeDeck.test.tsx`
- Modify: `lib/discovery/swipeDecision.ts`

**Interfaces:**
- Consumes: `shouldClaimSwipe(translationX: number, translationY: number): boolean`.
- Consumes: `resolveSwipeDecision(sample: SwipeSample): CardDecision | null`.
- Produces: unchanged function signatures with the new policy boundaries.

- [ ] **Step 1: Write failing pure-policy tests**

Update the intent test to assert:

```ts
expect(shouldClaimSwipe(12, 14)).toBe(true);
expect(shouldClaimSwipe(-12, 14)).toBe(true);
expect(shouldClaimSwipe(12, 20)).toBe(false);
```

Add release assertions:

```ts
expect(resolveSwipeDecision({ translationX: 60, velocityX: 0.2, cardWidth: 300 })).toBe("save");
expect(resolveSwipeDecision({ translationX: -60, velocityX: -0.2, cardWidth: 300 })).toBe("skip");
expect(resolveSwipeDecision({ translationX: 30, velocityX: 0.6, cardWidth: 300 })).toBe("save");
expect(resolveSwipeDecision({ translationX: 30, velocityX: 0.2, cardWidth: 300 })).toBeNull();
```

- [ ] **Step 2: Update the component responder regression**

In `components/discovery/__tests__/SwipeDeck.test.tsx`, change the moderate
diagonal expectation for `{ dx: 12, dy: 14 }` to `true`, add a strongly
vertical `{ dx: 12, dy: 20 }` expectation of `false`, and release with a
sub-24-percent horizontal distance:

```ts
expect(
  responderConfig?.onMoveShouldSetPanResponder?.({} as never, { dx: 12, dy: 14 } as never)
).toBe(true);
expect(
  responderConfig?.onMoveShouldSetPanResponder?.({} as never, { dx: 12, dy: 20 } as never)
).toBe(false);
act(() => {
  responderConfig?.onPanResponderRelease?.(
    {} as never,
    { dx: -70, dy: 35, vx: -0.2 } as never
  );
});
```

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```bash
npm test -- --runInBand lib/discovery/__tests__/swipeDecision.test.ts components/discovery/__tests__/SwipeDeck.test.tsx
```

Expected: failures show the moderate diagonal, 20-percent drag, velocity-0.6
flick, and component release are still rejected by the old thresholds.

- [ ] **Step 4: Implement the minimal policy change**

In `lib/discovery/swipeDecision.ts`, define named constants and use them:

```ts
const CLAIM_HORIZONTAL_FLOOR = 8;
const CLAIM_HORIZONTAL_TO_VERTICAL_RATIO = 0.8;
const COMMIT_DISTANCE_RATIO = 0.18;
const COMMIT_VELOCITY = 0.5;
```

Keep the existing direction-selection behavior and replace only the four
corresponding numeric literals.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
npm test -- --runInBand lib/discovery/__tests__/swipeDecision.test.ts components/discovery/__tests__/SwipeDeck.test.tsx
```

Expected: both suites pass with no failures.

- [ ] **Step 6: Run local quality checks**

Run:

```bash
npm run typecheck
git diff --check
```

Expected: both commands exit zero.

- [ ] **Step 7: Commit**

```bash
git add lib/discovery/swipeDecision.ts lib/discovery/__tests__/swipeDecision.test.ts components/discovery/__tests__/SwipeDeck.test.tsx
git commit -m "fix: make card swipes more forgiving"
```
