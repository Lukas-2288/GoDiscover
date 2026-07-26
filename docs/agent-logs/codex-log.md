# Codex — session log

Newest entries first. Format is defined in `AGENTS.md`.

<!-- Entries appended below -->

## 2026-07-25 — Saved Atlas implementation (reconstructed)

> Reconstructed by Claude Code on 2026-07-26 from branch history and the
> committed reports on `feature/playful-discovery-deck`, because the log files
> did not exist yet. Not written by Codex itself — treat details outside the
> commit record as secondhand.

**Did:** Built the Digital Arcade web experience and the Saved Atlas map across
~75 commits on `feature/playful-discovery-deck` (head `e1311c2`). Specifically:

- Swipeable discovery deck (`components/discovery/`) with its own controller and
  reduced-motion support, replacing the old button/results layout on web.
- Saved Atlas map with two modes — `atlas` (calm overview of the saved universe)
  and `orbit` (focus one item and its discovery trails). Rendered with
  `@xyflow/react` 12.11.2 + `d3-force` 3.0.0, web-only.
- Append-only trail-event model (`lib/storage/discoveryMap.ts`): permanent paths
  represent discoveries the user actually followed; suggested paths stay transient.
- Deterministic metadata-first cross-media recommendations
  (`lib/discovery/culturalProfile.ts`, `mapRecommendations.ts`) — no AI service,
  reason labels derived only from evidence the provider query actually used.
- Supabase sync via `supabase/migrations/202607240001_discovery_trail_events.sql`,
  append-only with owner-only RLS.
- First real test infrastructure in the repo: Jest + jest-expo, 41 suites / 282
  tests, a `typecheck` script, and a Chrome-CDP browser smoke harness.

**Why:** The user wanted the saved collection to read as a "cultural atlas" rather
than a list — see `docs/superpowers/specs/` and the
`docs/superpowers/plans/2026-07-24-saved-atlas.md` plan. Aesthetic direction was
settled as "after-hours digital museum": artwork-first nodes, restrained category
color, motion only on deliberate user action.

**Files:** 139 files on the branch. Entry points are `app/index.web.tsx`,
`components/web/map/`, `lib/discovery/`, `lib/storage/`.

**Follow-ups:**

- Three residual blockers documented in
  `docs/superpowers/plans/2026-07-25-saved-atlas-residuals.md`. Not merge-ready
  until they are fixed and re-reviewed.
- **Local work never pushed.** The session ended on a usage limit with local
  commit `f11568d` plus 4 uncommitted files (reportedly 298 tests passing) in the
  worktree at `/Users/lukassagmani/GoDiscover/.worktrees/playful-discovery-deck`.
  GitHub remains at `e1311c2`. Per the session transcript, that unpushed work
  covers residual blockers #1 and #2. **Do not delete that worktree** until it is
  pushed.
- Live two-account Supabase RLS/sync verification never ran — no disposable
  project credentials were available. Still a manual gate.
- The branch was never merged to `main`, which still sits at pre-Atlas `019e8ae`.
