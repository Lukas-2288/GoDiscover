# Claude Code — session log

Newest entries first. Format is defined in `AGENTS.md`.

<!-- Entries appended below -->

## 2026-07-27 — Overnight: integration tests, a damping hazard, and the website UI

**Did:** Continued unsupervised after the seven fixes landed. Two things found by
testing rather than reading, and one by actually looking at the site.

- **Damping could re-create the dead end.** Writing an end-to-end test surfaced
  it: books are frequently tagged only "Fiction", so rejecting three crossed the
  threshold and excluded the whole category. `MAX_DAMPED_TRAITS` capped how many
  traits were damped; nothing capped what damping could *cost*. Damping is now a
  preference, not a filter — `applyDiscoveryContext` prefers undamped items but
  returns the damped ones over nothing, and Randomize/Filter repeat the request
  undamped when the damped one comes back empty. The second half matters because
  TMDB excludes in the query itself, so no post-filter can recover it.
- **New `discoveryFlow.integration.test.tsx`** exercises the real controller,
  reducer, `loadDiscovery`, similarity ladder and rejection storage together —
  only the provider is faked. Fifteen consecutive skips, damping after three
  rejections, a rejected title never returning, undo restoring *and* un-damping,
  Similar widening, honest exhaustion.
- **The website never had the undo or save-intent bar.** They were wired only
  into `app/index.tsx`, the *native* screen. The site renders `WebHomeScreen`,
  which had neither — while its keyboard hint promised "U TO UNDO". Now wired,
  pinned on desktop (it rendered at 904px against a 900px viewport), in flow on
  mobile where pinning collided with the actions.
- **"THE CABINET IS QUIET"** — the copy from the original report — showed
  whenever the queue was briefly empty. Now reserved for genuine exhaustion.
- **Three pre-existing mobile defects**, all content rendering outside a 390px
  viewport: a 469px heading in a 322px box, the portal tag at x=572 because the
  header never wrapped, and four nav items on four rows beside a non-shrinking
  wordmark. The browser was zooming out to 572px; it now reports 390 with no
  overflow and the deck actions are reachable without scrolling.

**Why:** User asked me to keep going overnight. Chose test-and-verify work over
the risky native-bundle refactor.

**Files:** `lib/discovery/loadDiscovery.ts`,
`components/discovery/__tests__/discoveryFlow.integration.test.tsx`,
`components/web/WebHomeScreen.tsx`, `app/index.web.tsx`, `AGENTS.md`.

**Verification:** 353 tests / 352 passing, typecheck clean, web+iOS+Android
exports, atlas browser matrix 12/12, plus real-browser screenshots of the deck,
skip-undo and save-intent states at 390×844 and 1440×900.

**Follow-ups:**

- Native bundle bloat now has a precise root cause in `AGENTS.md`
  (`expo-router/_ctx.ios.js` matches an *optional* `.web` group). Deferred: dead
  weight, not a runtime bug, and the fix is a structural refactor of two large
  files touching the build. Wanted a human call before doing it.
- On mobile the follow-up bar sits below the fold in flow. Reachable, but a
  bottom-sheet treatment would be better — that is a design call, not a defect.
- `mapLayout`'s 200-node budget still the only failing test; hardware-dependent.
- The visual driver stubs `fetch` because there are no API keys here. Real
  provider behaviour — especially the Discogs era spread — is still unverified
  against live data.

## 2026-07-26 — Discovery quality: deck memory, depth, undo, accent blue

**Did:** Seven issues the user hit while using the site. Three shared one root —
**the deck had no memory and no depth**. Every provider ended in `.slice(0, 5)`,
nothing refilled the queue, and `grep` for `exclude|seen|rejected` across `lib/`
returned no hits.

- **Deck ran dry after ~5 skips.** `DeckState` gained a cursor; the controller
  tops up in the background at two cards remaining. Crucially `exhausted` is set
  only when a top-up actually returns nothing — an empty queue previously could
  not be distinguished from "nobody asked for more yet". Two traps found by the
  suite: a persistently failing provider retried forever (the failure cleared
  `toppingUp`, re-arming the condition that started it → `topUpBlocked`), and
  AsyncStorage leaked rejections between tests.
- **"Not for me" did nothing.** `skipCurrent` popped the card and recorded
  nothing, so the next randomize hit `popularity.desc` and returned the same
  blockbusters. New `lib/storage/rejections.ts`: the item never returns, and a
  trait rejected past a threshold inside a window stops being offered, capped so
  a category can still fill a deck. TMDB takes it as `without_genres`; elsewhere
  a post-filter. Search and Similar are exempt by design.
- **Artists/Albums skewed 80s–90s.** `randomAlbums`/`randomArtists` passed **no
  `year` at all**, leaving ordering to Discogs — a vinyl-collector catalogue.
  `randomArtists` was worse: it parses artist names out of master-release
  titles, inheriting the skew directly. Both now pick a weighted decade window.
- **Similar repeated itself.** It asked for page 1 and took the top ten, every
  time. New `similarTiers.ts` ladder: close → adjacent → loose → wander, each
  paged before falling through, rung shown on the card, and an honest terminal
  message instead of looping.
- **Saving produced near-clones.** Provider-native similars score 0.9 vs
  0.66–0.68 for traits, so they took every orbit slot. Both surfaces now offer
  "More like this" / "Something different", remembered per category.
- **No undo for a mis-tap.** `undoSkip` reuses the existing `restore()`, and
  deletes the rejection — otherwise the card returns while its exclusion keeps
  steering.
- **The blue.** There was none in `webPalette`; it was four unrelated
  `CATEGORY_THEMES[*].secondary` values. Measured: `#0095D8` is 5.52:1 on dark
  but 2.96:1 on the cream card; `#006FA3` is 5.52:1 on white and 4.90:1 on cream
  but 3.36:1 on dark. Neither works alone, so it is a light/dark pair with the
  contrast floors asserted per surface.

**Why:** User-reported issues after using the deployed site. Decisions taken:
seamless top-up, exclude *and* damp, persist per account, use both blues.

**Files:** `lib/storage/{rejections,owner}.ts`,
`lib/discovery/{similarTiers,saveIntent,deckState,loadDiscovery,categoryThemes}.ts`,
`lib/api/{tmdb,openlibrary,discogs}.ts`, `types/content.ts`,
`components/discovery/{useDiscoveryController,UndoNotice,DetailSheet,DiscoveryCard}`,
`components/web/map/SavedAtlas.web.tsx`, `app/index.tsx`, `app/index.web.tsx`.

**Verification:** 344 tests / 343 passing, typecheck clean, web+iOS+Android
exports pass, browser matrix 12/12.

**Correction to the entry below:** I recorded the native "Similar to Arrival"
reset failure as a real bug. It was not. Instrumenting it showed the label does
clear; the test asserted through a promise chain not flushed inside `act()`, so
`waitFor` polled a tree that had not re-rendered. Fixed, and that suite is green.

**Follow-ups:**

- `mapLayout`'s 200-node settle budget is the only failing test: asserts <750 ms,
  takes ~1620 ms in this container against 701 ms on the user's Mac. Hardware,
  not regression. Left alone rather than loosened.
- Genre damping depends on `ResultItem.traits`, which providers fill only where
  the API gives it away. Open Library subject matching is exact-after-normalise
  via an alias table, so it under-tags rather than mis-tags; the alias list is
  worth extending as real subjects are observed.
- The era spread was reasoned structurally, not verified against the live
  Discogs API — no token in this environment. Worth eyeballing once deployed.

---

## 2026-07-26 — All three Saved Atlas residual blockers closed

**Did:** Closed residual blockers 1 and 2 after the user chose to proceed from
`e1311c2` rather than wait for the unpushed local work. Blocker 3, the security
port, and the scaffolding are in the entry below.

- **Blocker 1 — owner-bound saved operations.** `addSaved`/`removeSaved`
  resolved `getUserId()` at call time and never revalidated, leaving every
  later await open to an account switch. Worst case was Undo, which resolved
  the owner when Undo *fired* rather than when the save happened, so undoing a
  save made under account A after switching to B deleted B's copy of the same
  item id. Added `addSavedForOwner`/`removeSavedForOwner` that take a bound
  owner and revalidate after every await — including after the cloud write, so
  a late response is not published — raising `SavedOwnerChangedError` instead
  of completing against the wrong account. The anonymous bucket is now read,
  uploaded, and retired inside a serialized claim; previously two overlapping
  hydrations both read and both uploaded it, landing one signed-out user's
  saves in two accounts. `SaveOperation` carries its `ownerId` and `undo()`
  refuses on mismatch. Both entry points pass the signed-in owner into
  `useDiscoveryController`.
- **Blocker 2 — atomic anonymous trail claiming.** `syncDiscoveryTrailEvents`
  checked the owner once on entry, then ran a cloud read, an upsert, and a
  final merge without rechecking, and converted anonymous events to
  account-owned only in memory. The new test proved two overlapping syncs
  uploaded the same event to both `user-a` and `user-b`. Syncs are now
  serialized, the claim is written to the local store before any cloud call so
  a later sync sees those events as owned, the owner is revalidated after the
  read and after the upsert, and every abandoned path releases the claim —
  otherwise a failed sync strands events owned by an account that never
  uploaded them and no longer anonymous for anyone else.

**Why:** User chose "go ahead without it" when the local `f11568d` still had
not reached GitHub after blocker 3 was finished.

**Files:** `lib/storage/saved.ts`, `lib/storage/savedMutations.ts`,
`lib/storage/discoveryTrailSync.ts`, `lib/discovery/deckState.ts`,
`components/discovery/useDiscoveryController.ts`, `app/index.tsx`,
`app/index.web.tsx`, plus `lib/storage/__tests__/savedOwnership.test.ts` and
additions to the trail-sync, controller, and web-app suites.

**Verification:** 295 tests (293 pass — the two failures are the pre-existing
ones described below), typecheck clean, web/iOS/Android exports pass, browser
matrix 12/12 on the shipped export.

**Follow-ups:**

- **`f11568d` is still unpushed and now genuinely divergent.** Blockers 1 and 2
  are implemented here independently. Whoever reconciles the two should expect
  real conflicts in `savedMutations.ts`, `discoveryTrailSync.ts`, and
  `useDiscoveryController.ts`, and should treat them as competing
  implementations of the same contract rather than merging both.
- Everything in the entry below still stands: two pre-existing test failures,
  map code in native bundles, unapplied Supabase policies, and the `output`
  mode question.

---

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
