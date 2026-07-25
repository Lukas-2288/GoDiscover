# Task 5: Discovery Orbit interactions

## Delivered

- Saved-node selection captures the current React Flow viewport, projects direct and second-degree relationships into an orbit, and fades unrelated work.
- Map recommendations are capped at eight and remain transient until a Save action succeeds. Existing saved candidates create only a connecting trail.
- Skip removes the local suggestion; Reseed moves into the chosen suggestion only after its replacement request succeeds.
- Back, Escape, and View whole atlas restore the captured overview viewport exactly. Provider failures retain the orbit and offer Retry.
- Detail unsave appends disconnect trail events and reloads the atlas snapshot so removed endpoints and paths disappear.

## RED / GREEN evidence

1. `npm test -- --runTestsByPath components/web/map/__tests__/orbitGraph.test.ts`
   - RED: failed because `orbitGraph` did not exist.
   - GREEN: passed after the pure projection/transient graph implementation.
2. `npm test -- --runTestsByPath components/web/map/__tests__/SavedAtlas.web.test.tsx`
   - RED: failed for missing orbit controls, viewport restoration, and explicit Back action.
   - GREEN: passed after the controlled orbit panel and camera restore implementation.
3. `npm test -- --runTestsByPath app/__tests__/index.web.test.tsx`
   - RED: unconfirmed item persistence still emitted a connecting trail.
   - GREEN: passed after blocking the trail until `saveSavedItem` confirms persistence.
4. Review corrections:
   - RED: a deferred recommendation from seed A appeared after selection moved to B; a reseeded graph produced nine transient nodes.
   - GREEN: request completions now require the current request and owning seed, resets invalidate pending work, and a transient reseed seed reserves one of eight graph slots.
   - RED: all provider failures resolved as an empty recommendation result, and unsave could prune a connect before creating its disconnect tombstone.
   - GREEN: app-level status normalization surfaces a retryable failure only when every applicable source fails; disconnect persists before removal, with a real connect-to-disconnect folding test.

## Verification

- `npm test` — 35 suites, 229 tests passed.
- `npm run typecheck` — passed.
- `npx expo export --platform web` — passed; static web bundles and routes exported.

## Concerns

- The provider request receives only the stored item's lightweight profile when full detail metadata is unavailable, so cross-media breadth depends on the provider-native similar results in that case.
