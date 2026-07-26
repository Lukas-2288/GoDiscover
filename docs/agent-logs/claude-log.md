# Claude Code — session log

Newest entries first. Format is defined in `AGENTS.md`.

<!-- Entries appended below -->

## 2026-07-26 — Saved Atlas residual blocker 3, security port, handoff scaffolding

**Did:**

- Created this scaffolding. `AGENTS.md`, `docs/agent-logs/{claude,codex}-log.md`.
  None of it existed on any branch, so every new agent session started blind —
  including this one, which initially could not find the work the user was
  describing because `main` still sits at pre-Atlas `019e8ae`.
- Fixed typecheck reproducibility. `npm run typecheck` failed with 3 TS2345
  errors from a clean `git clone && npm ci`, despite the Codex fix report
  recording it as passing. Cause: `expo/types/react-native-web.d.ts` declares the
  web-only style properties, but it is only referenced from `expo-env.d.ts`,
  which Expo generates and `.gitignore`s. Local machines had it; a fresh clone
  did not. Added `types/expo-web.d.ts` carrying the reference (named to dodge the
  `expo-env.d.ts` basename ignore pattern).
- Ported security fixes from the never-merged `claude/code-phone-first-time-JFQOs`.
  `lib/auth/oauth.ts` logged the full WebBrowser result, whose URL carries the
  PKCE `code` or `access_token`/`refresh_token`. Removed, with
  `lib/auth/__tests__/oauth.test.ts` asserting silence across all three paths —
  it failed with the tokens visible in the assertion diff first. Same treatment
  for `handleSignOut` in `app/index.tsx`. Added `supabase/rls.sql` for
  `saved_items`, made idempotent since it is applied by hand.
- **Closed residual blocker 3** (exact panned-viewport restoration).
  `captureOverviewViewport()` only recorded when its ref was empty. Fine for node
  clicks, broken when the app opens the orbit itself: `graphOrbitSeedId` turns
  truthy before `selectedId` propagates, so the `setCenter(800, 500, 1.15)` orbit
  effect moves the camera first and the later capture records the *orbit*
  camera. Exiting stranded the user there. Now the live viewport is re-read while
  in overview mode and frozen once an orbit owns the camera, and `handleMoveEnd`
  records every settled overview camera.

**Why:** User switched from Codex back to Claude mid-project and asked for the
Atlas work to be understood and continued. They chose: finish the three residual
blockers, port security fixes only, and push their local work first.

**Files:** `AGENTS.md`, `docs/agent-logs/*`, `types/expo-web.d.ts`,
`lib/auth/oauth.ts`, `lib/auth/__tests__/oauth.test.ts`, `app/index.tsx`,
`supabase/rls.sql`, `components/web/map/SavedAtlas.web.tsx`,
`components/web/map/__tests__/SavedAtlas.web.test.tsx`,
`scripts/run-saved-atlas-browser-smoke.mjs`.

**Verification:** 287 tests (285 pass), typecheck clean, web/iOS/Android exports
pass, browser matrix 12/12 across 375×844, 768×1024, 1024×768, 1440×900 for
mouse, keyboard and touch — each panning and entering orbit in one fresh
profile, every cell restoring the exact panned transform.

**Follow-ups:**

- **Blockers 1 and 2 are NOT done.** Owner-bound saved-item operations and
  atomic anonymous trail claiming. Deliberately left alone: the user's local
  `f11568d` reportedly already covers them and was still unpushed at the end of
  this session, so implementing them here would have created conflicting work.
  Confirmed anchors if they must be redone from `e1311c2`:
  `lib/storage/savedMutations.ts` threads no owner token and the `addSaved`/
  `removeSaved` beneath it resolve `getUserId()` at call time;
  `syncDiscoveryTrailEvents()` in `lib/storage/discoveryTrailSync.ts` checks the
  owner once at entry and never revalidates across its cloud read, upsert, and
  final merge.
- **Two pre-existing test failures**, present before any change this session:
  `app/__tests__/index.test.tsx` "labels a temporary Similar deck and resets to
  unbiased Surprise Me" — the "Similar to Arrival" label survives the reset
  (real native bug, Codex knew of it); and `mapLayout.test.ts`'s 200-node
  settle-time budget, which asserts <750 ms and takes ~1620 ms in this container.
  The budget is hardware-dependent — it passed at 701 ms on the user's Mac. Left
  alone rather than loosened, since relaxing a perf gate to make it green is not
  a fix.
- **Map code ships in native bundles.** `saved-atlas-flow`, a string that exists
  only in `SavedAtlas.web.tsx`, appears 11 times in the iOS Hermes bundle, so
  `@xyflow/react` and `d3-force` reach native through Expo Router's route
  enumeration despite the `.web` suffix. Harmless at runtime, but it is dead
  weight and contradicts the stated architecture.
- `app.json` still exports `output: "static"`. If deploying to Netlify, compare
  against the `output: "single"` decision on `claude/code-phone-first-time-JFQOs`.
- `supabase/rls.sql` and the trail-events migration are executable
  documentation. Neither has been applied to a live project, and two-account
  isolation remains unverified.
