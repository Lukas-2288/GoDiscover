# Task 4 operation-token fix

## Root cause

`commit("save")` captured the mutation owner before awaiting
`discovery.commit()`, but it captured `mapLoadSequence.current` only after that
promise resolved. A pending owner-A operation could therefore cross an
A -> B -> A auth cycle, adopt the new owner-A map generation, and pass both
completion guards. Unmount had the same hole: cleanup invalidated the old
generation, but the continuation captured the post-cleanup value and began a
trail write anyway.

The handler also read `selected` and `trailSeed.current` after the await, so
those values did not unambiguously belong to the save operation that started
the async work.

## Change

- Capture the operation owner, map generation, category, and trail seed before
  calling `discovery.commit()`.
- Check that original owner/generation token after the discovery commit and
  before calling `recordMapTrailEvent`.
- Check the same original token again before applying the returned map
  snapshot.
- Skip `recordMapTrailEvent` entirely when the operation became stale.

No other `recordMapTrailEvent` caller or asynchronous `setMapSnapshot` mutation
handler exists in the app path. The existing map-load writer already validates
its captured owner, sequence, and effect lifecycle.

## Regression coverage

- Deferred owner-A commit crossing A -> B -> A: the newly hydrated owner-A map
  remains visible and no stale trail write starts.
- Deferred commit followed by unmount: no trail write starts after cleanup.
- Deferred same-owner commit: the trail write runs and its snapshot is applied.

## TDD and verification

RED:

- `npm test -- app/__tests__/index.web.test.tsx`
- Failed only the two new stale-operation regressions because
  `recordMapTrailEvent` was called once after A -> B -> A and once after
  unmount. The deferred same-owner control passed.

GREEN:

- `npm test -- app/__tests__/index.web.test.tsx` — PASS, 10/10 tests.
- `npm run typecheck` — PASS.
- `git diff --check` — PASS.
