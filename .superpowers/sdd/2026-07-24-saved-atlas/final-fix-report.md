# Saved Atlas final correction report — 2026-07-25

Worktree: `/Users/lukassagmani/GoDiscover/.worktrees/playful-discovery-deck`  
Required baseline: `5ef5330`  
Branch: `feature/playful-discovery-deck`

## Result

All ten findings in `final-review.md` are corrected. The fresh release gates pass:

- 40 Jest suites / 282 tests;
- TypeScript;
- script syntax and diff hygiene;
- exact dependency versions;
- production web, iOS, and Android exports;
- isolated Chrome-CDP mouse, keyboard, touch, and pan checks at all four responsive sizes;
- a real 200-node/400-edge production-browser representative hit test.

The browser restoration checks now compare the complete React Flow transform string captured immediately before selection and also require the absence of selected artwork, the Discovery Orbit, and Back controls. Closing the mobile sheet is no longer accepted as restoration by itself.

## Corrections by finding

### 1. Saved ownership isolation

Saved data now uses owner-partitioned v2 buckets for anonymous and authenticated owners. `listSavedForOwner(ownerId)` never returns another owner's fallback cache. Legacy v1 data migrates once into the active bucket. Signing in uploads the anonymous bucket idempotently before cloud hydration.

Focused coverage exercises owner A → signed out, legacy migration, anonymous → A merge, and A → B cloud-read failure without leaking A.

### 2. Authoritative cloud failures

Signed-in save and remove operations are authoritative: cloud write failure rejects rather than presenting a local-only success. The controller returns an explicit confirmed/failed/no-op result, and map/trail changes use only the confirmed authoritative item list.

### 3. Append-only trail storage

Trail history is never pruned when a saved endpoint temporarily disappears. Snapshot derivation filters edges whose endpoint is not currently saved, while retaining the underlying connect/disconnect history for re-save and sync.

### 4. Serialized map mutation and sync

All local event-store reads, normalization, appends, disconnect tombstones, and sync merges run through one serialized transaction queue. Sync re-reads the latest local store before its final merge so a connect recorded during a pending cloud read is retained. App orchestration synchronizes before hydration, after confirmed connect/disconnect, and on focus/online retry while guarding owner and map generation.

### 5. Real cross-media metadata

Map recommendations lazily load real detail and build a cultural profile before querying across media. Movie → book, book → movie, artist → album, and album → artist paths are covered through the production detail adapter. Discogs artist detail is enriched from master metadata when available.

### 6. Deterministic production recommendation paths

Map-only provider calls accept a stable seed/page seam. TMDB and Discogs map recommendation candidates no longer depend on discovery-card randomness or album shuffling. Reasons are limited to evidence the provider query actually used, including honest creator and style mappings.

### 7. Seeded D3-force and 200/400 usability

`createAtlasLayout()` now uses statically imported `d3-force` with seeded randomness, synchronous ticks, category anchor, link, charge, and size-aware collision forces. Settled layouts are cached by permanent graph signature and explicit seed. Pan/zoom detail changes do not re-run layout.

The 200-node/400-edge test requires:

- deterministic output for reversed input;
- cache object identity;
- at most four actual artwork-rectangle overlaps on the 1600×1000 logical canvas;
- more than 44 logical pixels from representative dense-node centers to the nearest other center;
- first settlement below 750 ms.

The last fresh focused run passed in 701 ms. A sparse-map regression found during browser verification was corrected by density-scaling the many-body charge: a three-item map now remains inside mobile fit-view hit bounds. The minimum React Flow zoom is also density-aware, so the expanded 200-node canvas can fit instead of being clipped by the sparse-map 0.35 floor.

The production-browser dense fixture loads 200 saved nodes and 400 trail events. Chrome physically selects representative left, center, and right visible nodes and requires exact overview restoration after each. It passed at 1440×900 with fit transform `translate(234.466px, 50.332px) scale(0.244534)`.

### 8. Permanent coordinates through orbit changes

Saved Atlas settles permanent nodes once and passes those exact positions into orbit construction. Transient seeds and recommendations no longer participate in permanent layout. Exact-coordinate tests retain every unrelated saved node through select, find, skip, and reseed.

### 9. One responsive orbit state machine

`app/index.web.tsx` is now the only owner of orbit seed, recommendations, preview, loading, failure, request token, Save, Skip, and Reseed state. `SavedAtlas` is controlled at every breakpoint. Stable callbacks read the current owner-controlled refs, so a breakpoint render does not change the action owner.

The resize tests cover settled results, pending load, provider failure, pending reseed, and pending save across desktop, mobile, tablet portrait, tablet landscape, and back to desktop. Seed, results, and action identities remain attached to the same request owner throughout.

### 10. One exact restoration contract

Back, View whole Atlas, map/pane Escape, detail rail close, portrait drawer close, and mobile sheet close all invoke `restoreAtlasOverview`. It invalidates requests, clears selection/orbit/detail state, and increments a restoration version. `SavedAtlas` responds to that command by applying the exact viewport captured before selection with zero animation.

The component test requires the exact `{ x: 24, y: -18, zoom: 0.86 }` viewport. The browser gate records and compares the actual CSS transform at every size and also requires no selected artwork, orbit, or Back action after restoration.

## TDD and debugging evidence

The correction wave used failing focused tests before each production change:

- saved ownership: five new storage tests failed against the shared fallback cache, then passed with owner partitions and migration;
- serialized event store: connect/connect, sync/connect, connect/disconnect, append-only, and owner-isolation tests failed against read-modify-write races, then passed through the transaction queue;
- authoritative app orchestration: stale-owner, unconfirmed save, and rejected unsave/trail tests failed before the guarded result contract;
- metadata and determinism: four cross-media adapter tests and two production-provider stability tests failed before lazy detail and stable map-only provider seams;
- layout/orbit: cache identity, actual rectangle overlap, hit spacing, and unrelated-coordinate tests failed before D3 settlement and permanent-position injection;
- responsive state/restore: the breakpoint test found no shared request owner, mobile close left `selectedId`, and Saved Atlas exits did not delegate to one restore callback;
- sparse and dense browser follow-ups: the three-node fixture failed with `movies:arrival.x = 0.883`, and the 200-node renderer test failed at `minZoom = 0.35`, before the density-aware corrections.

## Fresh automated gates

| Gate | Command | Result |
| --- | --- | --- |
| Full Jest | `npm test -- --coverage=false` | PASS — 40 suites / 282 tests / 16.203 s |
| TypeScript | `npm run typecheck` | PASS |
| Browser script syntax | `node --check scripts/run-saved-atlas-browser-smoke.mjs` | PASS |
| Dependencies | `npm ls @xyflow/react d3-force zustand --depth=1` | PASS — React Flow 12.11.2, d3-force 3.0.0, zustand 4.5.7 |
| Diff hygiene | `git diff --check 5ef5330..HEAD` and `git diff --check` | PASS |
| Web export | `npx expo export --platform web --output-dir /private/tmp/godiscover-final-fix-web --clear` | PASS — 2.55 MB JS / 15.4 kB CSS |
| iOS export | `npx expo export --platform ios --output-dir /private/tmp/godiscover-final-fix-ios --clear` | PASS — 5.01 MB Hermes bundle |
| Android export | `npx expo export --platform android --output-dir /private/tmp/godiscover-final-fix-android --clear` | PASS — 5.01 MB Hermes bundle |

Jest emits only Node's dependency-level `punycode` deprecation warning from the jsdom stack.

## Production browser matrix

Each input contract runs in a fresh headless Chrome profile against the exported web bundle. Mouse, keyboard, and touch each select an artwork, exit through the responsive surface's real contract, compare the exact pre-selection transform, and require cleared selected/orbit state. Pan runs separately. Every run reported zero runtime exceptions.

| Viewport | Surface | Exact overview transform | Mouse | Keyboard | Touch | Pan |
| --- | --- | --- | --- | --- | --- | --- |
| 375×844 | Sheet | `translate(-84.6307px, 74.5419px) scale(0.35)` | PASS | PASS | PASS | PASS |
| 768×1024 | Drawer | `translate(-117.318px, 50.6681px) scale(0.646055)` | PASS | PASS | PASS | PASS |
| 1024×768 | Rail | `translate(-139.236px, -153.82px) scale(0.837585)` | PASS | PASS | PASS | PASS |
| 1440×900 | Rail | `translate(-79.4854px, -189.852px) scale(1.02826)` | PASS | PASS | PASS | PASS |

Screenshots are in `/private/tmp` with the prefix `saved-atlas-final-`.

## Commits

- `2b27d3a fix: isolate and synchronize saved atlas ownership`
- `15e167d fix: enrich and stabilize atlas recommendations`
- `8570efa fix: settle permanent atlas with d3 force`
- `5e06a05 fix: unify atlas orbit and restoration state`
- The final verification commit contains the sparse/dense browser closure and this report.

## Limitation

No live Supabase migration or two-account production-project mutation was performed because disposable project credentials were not supplied and applying a live migration was outside scope. Static RLS review and owner-isolation/sync tests remain green.
