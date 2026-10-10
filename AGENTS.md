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
  Known gap: the web tree is *intended* to be shaken out of native bundles, but
  is not. Markers unique to `app/index.web.tsx` ("Removed from saved atlas"),
  `components/web/WebHomeScreen.tsx` ("Collapse detail drawer") and
  `SavedAtlas.web.tsx` ("saved-atlas-flow", ×11) all appear in the iOS Hermes
  bundle, so `@xyflow/react` and `d3-force` ship to native too.

  **Root cause** — `node_modules/expo-router/_ctx.ios.js` builds its route
  context with:

  ```
  .*(?:\.android|\.web)?\.[tj]sx?$
  ```

  The `(?:\.web)?` group is *optional*, so `./index.web.tsx` matches the native
  route context and is bundled. Expo Router dedupes it by route name at
  runtime, so nothing renders — but the module is already in the bundle.

  **Fix** — keep exactly one route file per route and platform-split *below*
  `app/`: `app/index.tsx` becomes a re-export of `../components/home`, with
  `home.tsx` and `home.web.tsx` beside each other. Metro's platform resolution
  does apply to ordinary imports, so native never reaches the web variant.
  Editing the regex is not an option (it lives in `node_modules`), and stubbing
  `.web.tsx` to an empty module via `resolveRequest` risks Expo Router
  registering a route with no default export.

  Not a runtime bug — dead weight only. Deferred as a refactor of two large
  files that touches the build; see the 2026-07-27 claude-log entry.
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

# Layout across the device matrix. Must report "PASS — 24 cells clean";
# exits non-zero on any finding. Run against a web export, not a dev server.
CHROME_BIN=<chromium> node scripts/run-responsive-audit.mjs /tmp/gd-web
```

**Any change touching web layout must re-run the responsive audit.** The web
build disables body scrolling (`ScrollViewStyleReset` in `app/+html.tsx` emits
`body{overflow:hidden}`), so a section without a `ScrollView` cannot be scrolled
at all and anything past the fold is unreachable rather than merely awkward.
That failure is invisible in a desktop browser and total on a phone. Components
must ask `useIsMobileLayout()` rather than testing `width < 700` themselves, or
the shell, the deck and the detail panel end up disagreeing about whether they
are on a phone.

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
