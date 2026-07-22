# Playful Discovery Deck Completion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the final review and verification gates for the already implemented playful discovery deck, then hand the pushed feature branch to the user for merge or pull-request integration.

**Architecture:** Continue from the existing linked worktree and pushed feature branch; do not reimplement completed tasks. The only remaining work is read-only re-review of the final accessibility commit, fresh verification of the full branch, durable ledger bookkeeping, and the user's chosen integration action.

**Tech Stack:** Expo Router, React Native, React Native Web, TypeScript, Jest, Git/GitHub.

## Global Constraints

- Worktree: `/Users/lukassagmani/GoDiscover/.worktrees/playful-discovery-deck`.
- Branch: `feature/playful-discovery-deck`.
- Pushed remote head at handoff: `edd206da23197e61df3e08a971a95c244973d844`.
- Do not include the unrelated main-checkout file `docs/superpowers/plans/2026-07-20-discogs-auth-recovery.md`.
- Do not rewrite, reset, force-push, merge, or delete the branch without explicit user direction.
- Preserve existing API keys and `.env`; never print or commit secrets.
- Live Android/TalkBack smoke testing is unavailable because this machine has no Android SDK, `adb`, emulator, or attached device.

---

### Task 1: Re-review the final accessibility fix

**Files:**
- Review: `app/index.tsx`
- Review: `app/__tests__/index.test.tsx`
- Review: `.superpowers/sdd/task-11-report.md` (ignored local evidence)

**Interfaces:**
- Consumes: commit `edd206da23197e61df3e08a971a95c244973d844`, which adds modal/auth saved-mutation announcements.
- Produces: a clean reviewer verdict with no Critical or Important findings.

- [ ] **Step 1: Generate the exact review package**

Run:

```bash
/Users/lukassagmani/.codex/plugins/cache/superpowers-marketplace/superpowers/6.1.1/skills/subagent-driven-development/scripts/review-package 11593e8 edd206d
```

Expected: one review-package path covering exactly the final commit.

- [ ] **Step 2: Re-dispatch the existing final reviewer read-only**

Ask the reviewer to confirm that:

- Saved, stored-detail, and Account modal failures remain visible inside the active modal.
- Each safe failure is announced exactly once on iOS through `DiscoveryAnnouncer.native`.
- Android/web retain live-region feedback without duplicate iOS announcements.
- Operation-ID stale-result guards, lifecycle clearing, shared mutation serialization, and deck Undo decoupling remain intact.
- No new Critical or Important findings were introduced.

- [ ] **Step 3: Handle review findings**

If Critical or Important findings exist, use one focused TDD fix loop and re-review. Record Minor findings in `.superpowers/sdd/progress.md`.

### Task 2: Run fresh independent verification

**Files:**
- Verify: all production and test files on `feature/playful-discovery-deck`.

**Interfaces:**
- Consumes: reviewer-approved branch head.
- Produces: fresh tests, typecheck, platform export, and clean Git evidence.

- [ ] **Step 1: Run the full test suite**

Run:

```bash
npm test -- --runInBand
```

Expected at current head: 21 suites and 123 tests pass with zero failures.

- [ ] **Step 2: Run TypeScript verification**

Run:

```bash
npm run typecheck
```

Expected: exit code 0.

- [ ] **Step 3: Export every platform**

Run from the feature worktree with the existing main-checkout `.env` loaded without printing it:

```bash
set -a; source /Users/lukassagmani/GoDiscover/.env; set +a; npx expo export --platform all --output-dir /tmp/godiscover-deck-export-final-resume
```

Expected: iOS HBC, Android HBC, web JavaScript, and four static routes (`/`, `/modal`, `/_sitemap`, `/+not-found`).

- [ ] **Step 4: Verify Git integrity**

Run:

```bash
git diff --check
git diff main...HEAD --check
git status --short
git log -8 --oneline
```

Expected: both diff checks exit 0, status is clean, and HEAD is `edd206d` or a later reviewed fix commit.

### Task 3: Close the durable implementation ledger

**Files:**
- Modify: `.superpowers/sdd/progress.md` (ignored local ledger)
- Review: `.superpowers/sdd/task-11-report.md` (ignored local evidence)

**Interfaces:**
- Consumes: clean final review and fresh verification evidence.
- Produces: Task 11 marked complete without re-dispatching earlier tasks.

- [ ] **Step 1: Mark Task 11 complete**

Replace `Task 11: pending` with a line naming commits `0cb40c9`, `40917b5`, `f596208`, `11593e8`, and `edd206d`, the clean final review, 21/123 tests, typecheck/export evidence, and the Android live-device limitation.

- [ ] **Step 2: Confirm the ignored report contains the final RED/GREEN evidence**

Verify that `.superpowers/sdd/task-11-report.md` includes the native modal/auth announcement follow-up, including:

- RED: 3 route regressions failed and 14 passed.
- Focused GREEN: 2 suites and 18 tests passed.
- Full GREEN: 21 suites and 123 tests passed.
- Commit: `edd206d`.

### Task 4: Present integration choices

**Files:**
- No code changes required.

**Interfaces:**
- Consumes: clean pushed branch and completed verification.
- Produces: the user's explicit choice of local merge, pull request, keep-as-is, or discard.

- [ ] **Step 1: Confirm remote state**

Run:

```bash
git status -sb
git log -1 --oneline origin/feature/playful-discovery-deck
```

Expected: local branch tracks `origin/feature/playful-discovery-deck` and the remote includes `edd206d` or a later reviewed fix.

- [ ] **Step 2: Offer the four branch-finishing options**

Present exactly:

1. Merge back to `main` locally
2. Push and create a Pull Request
3. Keep the branch as-is
4. Discard this work

Do not merge, open a PR, remove the worktree, or delete the branch without the user's choice. Option 4 requires the user to type `discard` exactly.

## Handoff Snapshot

- Remote branch is already pushed: `origin/feature/playful-discovery-deck`.
- Latest pushed commit: `edd206d fix: announce modal saved failures`.
- Latest worker evidence: focused 2 suites/18 tests; full 21 suites/123 tests; typecheck and diff checks passed; worktree clean.
- Earlier manual smoke evidence: responsive web passed; iPhone 16 Plus iOS 18.6 core flow passed; live Android unavailable.
- The only known verification caveat at this snapshot is that live VoiceOver navigation was not manually exercised; automated iOS announcement coverage verifies one safe announcement.
