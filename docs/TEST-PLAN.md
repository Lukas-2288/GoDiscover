# Test plan

What this app is tested for, what it is not, and what to add next.

The organising question is the one that prompted this document: **"if we hit
recommend me a different book it has to make sense."** Most of the suite proves
mechanism — that a request was built correctly, that state advanced, that a
button is reachable. Very little proves *quality*, and quality is what a
discovery app lives or dies by. The gaps below are ordered by how likely each
is to produce a visibly bad recommendation.

---

## The layers

| Layer | What it proves | Needs network | Where |
| --- | --- | --- | --- |
| Unit | A pure function is correct | No | `lib/**/__tests__/*.test.ts` |
| Provider adapter | The right query was built, the response parsed | No (fixtures) | `lib/api/__tests__/` |
| Reducer | State advances correctly | No | `lib/discovery/__tests__/deckState.test.ts` |
| Component | A control renders, is reachable, and calls back | No | `components/**/__tests__/` |
| Integration | Controller + reducer + providers agree | No | `discoveryFlow.integration.test.tsx` |
| Acceptance | The built app works in a real browser | No | `scripts/run-responsive-audit.mjs` |
| Live probe | The real providers behave | **Yes** | `liveProviders.test.ts` (`LIVE_API_PROBE=1`) |

Current state: **431 passing, 12 skipped, 0 failing.**

### Recording fixtures

Provider tests run offline against recorded responses:

```bash
node scripts/record-fixtures.mjs      # once, with a populated .env
```

Real responses, committed, no credentials in them. Hand-written mocks prove the
parser handles what the author imagined; recordings prove it handles what the
provider actually sends.

---

## Output quality

The standard: **a Similar result shares a genre or subject with its seed.**

### Already guaranteed

Music similarity is the best-tested path in the app, because it is the one that
visibly broke — Chappell Roan's 2025 single returned a 1975 trucker album.

- **Era proximity** — `eraNeighbourhood` brackets the seed's year, never asks
  for future years, and omits the window entirely when the seed is undated
  (`musicSimilarity.test.ts`).
- **Trait precision** — the seed's *style* is sent alone rather than style plus
  its broad genre, which is what made "Country" match everything country.
- **Progressive widening** — one rung at a time, and only when the narrower
  search came back empty (`similarTiers.test.ts`).
- **Never the seed itself**, and never anything already seen — including the
  seed under a different spelling that autocorrect returned.
- **Live median check** — a 2025 seed's neighbours have a median year within 25
  of it (`liveProviders.test.ts`).
- **Rejection damping** — a genre rejected enough times stops arriving, at the
  provider query where the API supports it and by post-filter where it does not
  (`discoveryContext.test.ts`, `discoveryFlow.integration.test.tsx`).
- **Era spread of randomise** — equal weight per decade from a per-category
  floor, so no era is quietly favoured (`discogsEra.test.ts`).

### Closed, and what the fixtures showed

**Books now guarantee subject overlap** (`openlibrary.test.ts`, 20 tests). Two
real defects, both found by recording what Open Library actually returns:

- **The query led with "Fiction".** `getSimilarBooks` took the first three
  subjects the API listed, and for Kindred that opens with `Fiction` — so it
  asked for every novel ever catalogued. Broad subjects are now skipped, and
  Kindred searches `slaves`, `african american women`, `slaveholders` instead.
- **`subject:` matching is fuzzy.** A search for science fiction genuinely
  returns *The Two Towers*, whose record carries no such subject. Results are
  now verified against the subjects actually searched for, falling back to the
  raw results rather than to an empty deck.

Subject comparison had to survive free-text cataloguing — the same idea is
filed as `Science fiction`, `science-fiction` and `Science fiction, American`
across three records — without letting a broad term like `Fiction` swallow
everything. That tension is the whole difficulty, and it is why the repo
already uses exact matching for traits.

**Films were already fine.** All twenty of TMDB's recorded suggestions for
*Dune: Part Two* share a genre with it, so no post-filter is warranted; the
behaviour is now pinned rather than assumed (`tmdb.test.ts`, 8 tests).

**Filters are now proven to be honoured** (`filterHonouring.test.ts`, 19 tests,
plus the first tests `filterSelection.ts` has ever had). The live probe only
ever proved a filtered deck *paged*; two real defects sat in the gap, both on
the music path and both invisible from the UI:

- **Only the first genre counted.** `resolveGenreStyle` returned on the first
  label it recognised, so Jazz + Metal + Reggae searched Jazz alone while all
  three chips stayed lit. Discogs' search takes one `genre` and has no OR, so
  honouring a multi-select means several requests — it was making one. Now it
  fans out, capped at three, and interleaves the results so one genre cannot
  fill the deck.
- **The era was silently abandoned.** `filterAlbums` retried *without* the year
  when a page came back empty, so a request for the 80s could answer with 2015
  records and say nothing — the same silent widening that once answered a 2025
  single with a 1975 album. It now retries page one of the same era instead:
  fewer results, still the right decade. `filterArtists` never had this bug,
  which is how the inconsistency surfaced.

Both fixes were mutation-tested: reverting either makes the new tests fail.

### The gaps, worst first

1. **Diversity within a deck is unmeasured.** Ten books by one author, or ten
   albums from one year, would pass every test here. Standard beyond-accuracy
   evaluation treats diversity, novelty and coverage as separate axes from
   accuracy precisely because accuracy alone does not predict satisfaction.
   → *Add*: a deck of ten has at least N distinct authors/artists/years. The
   recorded science-fiction search shows the shape of it — ten results, but
   Douglas Adams twice and Andy Weir twice.
2. **Cross-top-up duplicates.** The reducer dedupes by id, and `presentIds`
   keeps a top-up from repeating. Neither catches the same work arriving twice
   under different provider ids — a real Discogs and Open Library failure mode.
   → *Add*: near-duplicate detection on title + creator.
3. **Untested modules**: `lib/storage/recents.ts`, `lib/discovery/emptyState.ts`
   (partly covered via `browseModes.test.ts`).

---

## Performance

**Express budgets as work done, not milliseconds.** The repo already leans this
way and it is the right instinct — call-count assertions are machine
independent and never flake, where wall-clock assertions on a shared CI box
flake constantly. The 750 ms `mapLayout` budget was the only consistently
failing test in this repo for its whole life, and it died with the Atlas.

Existing budgets of this shape:

- Concurrent identical requests collapse into one (`requestCache.test.ts`).
- One artist lookup per distinct name, not one per release
  (`artistIdentity.test.ts`).
- No further `load` calls after exhaustion or repeated failure
  (`useDiscoveryController.test.tsx`) — an anti-thrash budget.
- Cache size stays bounded (`requestCacheSize()` against `MAX_ENTRIES`).

The two legitimate wall-clock assertions both guard a real user-facing timeout
rather than a performance ideal: Underground must finish inside 15 s against
the 20 s discovery budget (`liveProviders.test.ts`), because it is inherently
N+1 — no Last.fm endpoint returns listener counts in a listing.

### To add

- **Requests per deck load.** Pin the number of provider calls one Surprise Me
  makes. A regression here is invisible until someone's API quota runs out.
- **Cache hit rate.** Currently only inferable by counting `fetch` mocks —
  `requestCache.ts` exposes size but no hit/miss counters. Add them.
- **Bounded rendering.** `SavedList` uses `SectionList`, so a collection of any
  size should mount a bounded number of rows. Assert that directly, since the
  `ScrollView` + `.map()` it replaced did not.
- **Bundle size ceiling.** `expo export` reports it; a threshold would catch a
  dependency creeping back in. (Removing the Atlas dropped `@xyflow/react` and
  `d3-force` entirely.)

---

## Acceptance

`scripts/run-responsive-audit.mjs` is the model: plain Node, no dependencies,
driving headless Chromium over the real web export via CDP. It walks 4 sections
× 6 viewports and reports overflow, unreachable content, sub-44pt touch targets
and iOS zoom-triggering inputs — 24 cells, non-zero exit on any failure.

Its most valuable trick is distinguishing *below the fold but scrollable* from
*genuinely unreachable*, which matters because the web build sets
`body{overflow:hidden}`.

To write a sibling harness, reuse its server, browser launch and CDP plumbing
and replace only the in-page probe. Worth building:

- **Deck latency** — time from pressing Surprise Me to a card being present.
- **Recommendation sanity** — press Similar on a known seed and assert the
  results share a trait with it, end to end through the real UI.

---

## Running things

```bash
npm test                                             # everything offline
npm run typecheck
LIVE_API_PROBE=1 npx jest liveProviders --coverage=false   # real providers
npm run export:web && node scripts/run-responsive-audit.mjs dist
node scripts/record-fixtures.mjs                     # refresh fixtures
```

The responsive audit needs a populated `.env` — without it `lib/supabase.ts`
throws at import, React never mounts, and the audit reports a misleading
"could not reach the tab". Export with `--clear` after any `.env` change:
`EXPO_PUBLIC_*` values are inlined at transform time and Metro caches
transforms, so a stale bundle can carry the previous key.

---

## Known and deliberate

- **`traits[]` never reaches Supabase.** `DbRow` in `lib/storage/saved.ts` has
  no traits column, so traits survive locally and vanish on a cloud round-trip
   — silently weakening damping and similarity for signed-in users. A real bug
  needing a migration; tracked separately.
- **No 429 handling anywhere.** Underground is the only path that fans out
  hard, and it is bounded by `UNDERGROUND_MAX_LOOKUPS` and a concurrency of
  four rather than by backoff.
- **No property-based testing** (`fast-check`) and **no coverage thresholds**.
  Both worth having, after the quality gaps above are closed.
