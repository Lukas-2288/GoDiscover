# AGENTS.md

Standing instructions for AI agents (Claude Code, Codex, or anything else)
working in this repository. Read this first, every session.

## What GoDiscover is

A cross-platform discovery app for Movies, Books, Artists, and Albums. Built with
Expo (React Native) + TypeScript + Supabase, shipping to iOS, Android, and web
from one codebase.

The web experience has diverged deliberately from native: web gets the **Digital
Arcade** discovery deck and the **Saved Atlas** map. Native iOS/Android keep the
simpler original UI. Platform splitting is by file suffix — `app/index.tsx` is
native, `app/index.web.tsx` is web.

## Read these before starting work

1. This file.
2. The most recent entries in `docs/agent-logs/` — `claude-log.md` and
   `codex-log.md`. They tell you what the last session actually did.
3. `docs/superpowers/plans/` and `docs/superpowers/specs/` — the design and
   implementation plans currently in progress. The newest dated file is the
   live one.

## Branch map

Check this with `git ls-remote --heads origin` before assuming anything — it goes
stale fast.

| Branch | What it is |
| --- | --- |
| `main` | Currently **behind**. Sits at the pre-Atlas commit `019e8ae`. Do not assume it reflects the app. |
| `feature/playful-discovery-deck` | The real work. Digital Arcade + Saved Atlas, ~75 commits ahead of main. |
| `claude/code-phone-first-time-JFQOs` | Earlier security/deploy work. Partially ported; not merged. |

**Work is often not on `main`.** If the repo looks like it's missing features the
user describes, you are probably on the wrong branch. Check the other branches
before concluding something doesn't exist.

## Ground rules

- **Test-first.** Every production behavior change starts with a focused failing
  test. This repo has a real Jest suite — use it.
- **Never break native.** The map is web-only (`app/index.web.tsx`,
  `components/web/map/`). Native must keep exporting cleanly — verify with
  `npx expo export --platform ios`.
  Known gap: the map code is *intended* to be shaken out of native bundles, but
  is not. `saved-atlas-flow` — a string that exists only in
  `SavedAtlas.web.tsx` — appears 11 times in the iOS Hermes bundle, so
  `@xyflow/react` and `d3-force` are being pulled in through Expo Router's
  route enumeration. Harmless at runtime (the router never renders the `.web`
  route on native) but it is dead weight. Unresolved; see the 2026-07-26
  claude-log entry.
- **Don't widen scope.** Finish what was asked. If you find an adjacent problem,
  note it in your log entry's Follow-ups rather than fixing it uninvited.
- **Report honestly.** If tests fail, say so with the output. If you skipped a
  step, say that. Don't call something done that isn't.
- **Secrets.** Everything prefixed `EXPO_PUBLIC_` ships to the client and is
  readable by anyone. Never log OAuth callback URLs or session tokens — they
  contain access and refresh tokens.

## Verification gates

Before claiming work is complete:

```bash
npm test -- --coverage=false      # Jest suite
npm run typecheck                 # tsc --noEmit
node --check scripts/run-saved-atlas-browser-smoke.mjs
npx expo export --platform web     --output-dir /tmp/gd-web     --clear
npx expo export --platform ios     --output-dir /tmp/gd-ios     --clear
npx expo export --platform android --output-dir /tmp/gd-android --clear
git diff --check
```

Supabase row-level security cannot be verified from code. Migrations and
`supabase/rls.sql` are executable documentation — a human must apply them in the
Supabase SQL Editor and check isolation with two real accounts.

## Session log format

At the end of every session, append a dated entry to **your own** log file in
`docs/agent-logs/` — Claude Code writes `claude-log.md`, Codex writes
`codex-log.md`. Newest entries go at the top, under the heading.

```markdown
## YYYY-MM-DD — Short title

**Did:** What you actually changed or produced.

**Why:** The reason, and any decision the user made that shaped it.

**Files:** The files touched, as a list.

**Follow-ups:** What's left, what's blocked, what you deliberately didn't do.
```

Be specific enough that the next agent — which may be a different model with no
memory of this session — can pick up without re-deriving your context. Record
what you *didn't* finish as carefully as what you did.
