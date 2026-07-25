# Saved Atlas task 7 verification — 2026-07-25

Worktree: `/Users/lukassagmani/GoDiscover/.worktrees/playful-discovery-deck`
Baseline: `a1a281c`

## Result

The automated release gates pass. Two additions are included: a deterministic 200-node/400-edge performance regression test and a reusable Chrome-CDP browser smoke extension that accepts viewport dimensions, captures a screenshot, and drives mouse/keyboard/touch input.

## Automated gates

| Gate | Command | Result |
| --- | --- | --- |
| Full Jest | `npm test -- --coverage=false` | PASS — 36 suites, 254 tests, 7.324 s |
| TypeScript | `npm run typecheck` | PASS — 2.1 s |
| Script syntax | `node --check scripts/run-saved-atlas-browser-smoke.mjs` | PASS |
| Diff hygiene | `git diff --check` | PASS |
| Web production export | `npx expo export --platform web --output-dir /private/tmp/godiscover-task7-web --clear` | PASS — 9.54 s bundle; 2.52 MB JS, 15.4 kB CSS |
| iOS export smoke | `npx expo export --platform ios --output-dir /private/tmp/godiscover-task7-ios --clear` | PASS — 6.12 s bundle; 4.96 MB Hermes bundle |
| Android export smoke | `npx expo export --platform android --output-dir /private/tmp/godiscover-task7-android --clear` | PASS — 6.06 s bundle; 4.95 MB Hermes bundle |

The dedicated `lib/discovery/__tests__/mapLayout.test.ts` case generates 200 deterministic nodes and 400 edges, reverses both inputs, and gets an identical layout. Its first layout completed in 50 ms in Jest (with a conservative 1,000 ms regression threshold). The map layout is a bounded deterministic hash/attraction/collision calculation; it does not import or run a force simulation. Pan/zoom only emits React Flow viewport updates and zoom-detail mode selection.

## Persistence and integration coverage

Existing green integration tests exercised:

- malformed cache recovery and a preserved malformed copy;
- empty guided-map snapshot;
- anonymous-to-account sign-in merge;
- provider read and append failure retaining local work;
- repeated sync idempotence;
- unsave tombstones surviving removal and re-save;
- active-user filtering for overlapping two-user relationship IDs;
- web entry-screen owner switch, map reload, and unsave order;
- persisted relationship reason rendering after reload.

## Production-browser evidence

The browser command used the exported production web bundle under the required `with_server.py` lifecycle helper. Python and Node Playwright packages are absent in this environment, so Chrome headless CDP is the fallback. `expo start --web` also exits in this non-interactive runner; serving the already-produced static export avoids that environmental limitation.

Command pattern:

```sh
python /Users/lukassagmani/.codex/plugins/cache/anthropic-agent-skills/example-skills/local/skills/webapp-testing/scripts/with_server.py \
  --server "python -m http.server 4179 --directory /private/tmp/godiscover-task7-web" \
  --port 4179 -- \
  node scripts/run-saved-atlas-browser-smoke.mjs http://127.0.0.1:4179/ WIDTH HEIGHT SCREENSHOT.png
```

All four runs passed hydration, Map/List switching, visible relationship/reason label, diacritic search, hidden edge handles, no fatal runtime exception, actual mouse pan, keyboard selection/restoration, and touch emulation (on mobile/tablet emulation). The full mouse node-orbit/restoration subcheck passed at 375 and 1440. At 768 portrait and 1024 landscape that one combined CDP assertion failed after the successful pan, while keyboard restoration passed; the responsive surface changed between the interaction steps. This is a harness limitation rather than a product failure, and no UI source was changed solely to satisfy it.

| Viewport | Result | Screenshot |
| --- | --- | --- |
| 375 × 812 mobile | PASS, including mouse/keyboard/touch and responsive sheet restore | `/private/tmp/saved-atlas-verification-screenshots/375x812.png` |
| 768 × 1024 portrait | PASS core browser checks; mouse orbit/restoration assertion inconclusive | `/private/tmp/saved-atlas-verification-screenshots/768x1024.png` |
| 1024 × 768 landscape | PASS core browser checks; mouse orbit/restoration assertion inconclusive | `/private/tmp/saved-atlas-verification-screenshots/1024x768.png` |
| 1440 × 960 desktop | PASS, including mouse/keyboard and desktop orbit/back restoration | `/private/tmp/saved-atlas-verification-screenshots/1440x960.png` |

The browser recorded no fatal runtime exception. React reports recoverable production error #418 during static hydration at all sizes; the existing smoke deliberately recognizes it as recoverable and the app proceeds to a fully interactive map. Treat this as a follow-up observability/SSR-hydration concern, not a release-blocking crash.

## Supabase review

Static review of `supabase/migrations/202607240001_discovery_trail_events.sql` passes:

- primary key is `(user_id, event_id)` and the foreign key cascades from `auth.users`;
- RLS is explicitly enabled;
- `anon` and `authenticated` are revoked, then `authenticated` receives only `SELECT` and `INSERT`;
- SELECT policy is `using (auth.uid() = user_id)`;
- INSERT policy is `with check (auth.uid() = user_id)`;
- there are no UPDATE or DELETE grants/policies.

The app's event sync converts/restricts rows to the authenticated session user and tests cover owner A/B overlap. Live two-account Supabase verification was not run: no disposable project/two account credentials were supplied, and this task does not authorize applying a production migration or mutating project data.

## Code review

`git diff --check a1a281c..HEAD` is clean; the checked-out branch is already at the requested baseline, so there was no branch delta to review beyond the Saved Atlas source and verification additions. Static review found no additional load-bearing issue. The temporary export and screenshot artifacts are under `/private/tmp`; no user-owned untracked plan or `task-6-review.md` file was modified.

## Review remediation — 2026-07-25

Independent review found that the original browser report incorrectly treated React #418 as recoverable and used one generic detail-surface assertion. This was corrected rather than filtered:

- The first client render now gates both the root font/navigation tree and the responsive web application until client effects run. This aligns static-server and first-client markup. A fresh production export (`/private/tmp/godiscover-task7-web-final`) was checked at 1440 × 960 with the unfiltered harness: `fatalRuntimeExceptions: []`.
- The browser smoke now enables and dispatches CDP touch input at every size, uses exact sheet (375), drawer (768 portrait), and rail (1024/1440 landscape) contracts, and verifies the rail's independent `Back to atlas` and detail-close ownership rather than requiring unrelated panels to disappear together.
- The layout fixture now has 200 nodes and 400 distinct directed relationships with a 250 ms budget (five times the prior observed 50 ms baseline). A component instrumentation test proves pan/zoom detail-mode changes do not call `createAtlasLayout` again.

Final browser state: 375 × 812 sheet and 768 × 1024 drawer pass all CDP mouse/keyboard/touch checks with zero runtime exceptions. Fresh 1440 × 960 passes the unfiltered zero-runtime-error gate; its pre-contract-refresh interaction run passed. At 1024 × 768, the CDP rail run has zero runtime errors, pan and keyboard restoration pass, but the post-pan raw mouse/touch node sequence remains non-reproducible; this is an explicit release-verification limitation, not a pass. No live Supabase mutation was performed.
