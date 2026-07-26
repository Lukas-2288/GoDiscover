# Saved Atlas Residual Correction Plan

**Branch checkpoint:** `feature/playful-discovery-deck` at `d9aefee`

The main Saved Atlas implementation and eight of the ten whole-branch findings
are addressed. Do not merge until the three residual blockers below are fixed
and re-reviewed.

## 1. Bind every saved-item operation to its initiating owner

- Capture an immutable owner token before list, add, remove, commit, and Undo.
- Revalidate the token after every awaited storage or Supabase boundary.
- Prevent `useDiscoveryController` callbacks from publishing authoritative
  owner-A results after the app has switched to owner B.
- Prevent Undo created under A from deleting a matching B item.
- Recheck authentication during `listSavedForOwner` anonymous upload and cloud
  read; never write a response into a bucket whose active owner changed.
- Serialize or otherwise single-claim the anonymous saved bucket so overlapping
  A/B hydrations cannot upload it to both accounts.
- Add real-controller, real-storage deferred tests for A→B during hydrate,
  add/commit, remove, and Undo.

## 2. Atomically claim anonymous trail events

- Associate a claim with one immutable authenticated owner before cloud I/O.
- Ensure overlapping A/B syncs cannot both upload the same anonymous event.
- Revalidate owner identity after every cloud await and before applying the
  final serialized local merge.
- Preserve the anonymous event when a claim or upload fails.
- Add deferred overlapping A/B synchronization tests using the real local
  event store and synchronization adapter.

## 3. Restore the exact user-panned viewport

- Reproduce the 375×844 sequence: open atlas → pan → select with mouse or touch
  → exit orbit.
- Capture the viewport immediately before orbit entry, after the pan has
  settled, and restore that exact `{x, y, zoom}` for Back, Escape, sheet close,
  drawer close, and View whole atlas.
- Ensure no focus/fit-view effect overwrites the captured panned viewport.
- Extend the production CDP matrix so pan and orbit interaction occur in the
  same fresh profile for mouse, keyboard, and touch at all four breakpoints.
- Assert exact transform restoration, cleared selection/orbit state, correct
  responsive surface, and zero runtime exceptions.

## Final gates

1. Full Jest and TypeScript.
2. Production web, iOS, and Android exports.
3. Four-breakpoint isolated and combined pan→orbit browser matrix.
4. Owner-partition and anonymous-claim concurrency suites.
5. One scoped review of these residual fixes, followed by a final whole-branch
   Ready/Not Ready decision.
6. Live two-account Supabase policy/synchronization verification remains a
   separate manual gate unless disposable project credentials are provided.
