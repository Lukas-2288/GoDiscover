# Playful Discovery Deck Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace GoDiscover's results-grid emphasis with a playful, accessible, category-themed swipe deck while preserving its working providers, authentication, saved items, recents, and native-first web support.

**Architecture:** Keep `app/index.tsx` as the route and high-level composition layer, but move provider routing, per-category deck state, card interactions, category presentation, and detail presentation into focused modules. A pure reducer owns all category sessions and action transitions; a controller hook connects that reducer to provider and storage side effects; presentational components invoke the same controller actions for swipe, button, keyboard, and detail-sheet input.

**Tech Stack:** Expo 54, React 19, React Native 0.81, TypeScript 5.9 strict mode, Expo Router 6, React Native `Animated`/`PanResponder`, Expo Linear Gradient, AsyncStorage, Supabase, Jest 29 with `jest-expo`.

## Global Constraints

- iOS and Android are the priority platforms; web must remain supported and server-render safe.
- Surprise Me is the primary action; Search and Filter remain optional secondary tools.
- The only deck decisions are Save, Not for me, and explicit Similar.
- Saves, skips, searches, and Similar requests must never personalize later Surprise Me requests.
- Purple remains the shared brand anchor; Movies, Books, Artists, and Albums each receive their approved distinct visual personality.
- Save is swipe right, Not for me is swipe left, and every gesture has an always-visible labeled button equivalent.
- Similar always creates a visibly labeled temporary context and is never prefetched automatically.
- Detail and card transitions should normally complete within 200-300 milliseconds.
- Native interactive targets must be at least 44 by 44 points; web controls must meet WCAG 2.2 target-size and focus-appearance requirements.
- Text must wrap or grow under Dynamic Type and browser zoom; color and motion cannot carry essential meaning.
- Reduced-motion mode removes flight, tilt, scale, parallax, expanding artwork, and repeated skeleton animation.
- User-visible failures must be stable application copy, never raw provider response bodies or token messages.
- Existing provider clients, auth flow, saved-item schema, recent-item schema, and Supabase configuration remain authoritative.
- Do not add a recommendation system, database migration, bottom-tab shell, social feature, or new animation framework.
- Preserve the unrelated untracked file `docs/superpowers/plans/2026-07-20-discogs-auth-recovery.md` unless the user separately asks to commit it.

## File Structure

### Create

- `lib/discovery/types.ts` — request modes, request snapshots, Similar context, and provider-neutral discovery types.
- `lib/discovery/categoryThemes.ts` — typed category labels, icons, colors, patterns, and accessible foreground pairs.
- `lib/discovery/loadDiscovery.ts` — provider selection, filter conversion, explicit Similar loading, and safe error copy.
- `lib/discovery/deckState.ts` — queue helpers, per-category sessions, request guards, Save rollback, and Undo reducer transitions.
- `lib/discovery/loadDetail.ts` — category-tagged detail loading without automatic Similar prefetch.
- `lib/discovery/swipeDecision.ts` — pure distance/velocity decision threshold.
- `lib/discovery/motion.ts` — standard and reduced-motion timing/transform values.
- `lib/discovery/__tests__/categoryThemes.test.ts` — theme completeness and contrast tests.
- `lib/discovery/__tests__/loadDiscovery.test.ts` — provider routing, Similar, and safe-error tests.
- `lib/discovery/__tests__/deckState.test.ts` — session isolation, queue, stale request, Save, Undo, and error-preservation tests.
- `lib/discovery/__tests__/loadDetail.test.ts` — category routing and safe detail-error tests.
- `lib/discovery/__tests__/swipeDecision.test.ts` — distance, velocity, direction, and reset decisions.
- `lib/discovery/__tests__/motion.test.ts` — standard and reduced-motion specifications.
- `components/discovery/CategoryPicker.tsx` — expanded category tiles and compact active-category control.
- `components/discovery/DiscoveryControls.tsx` — secondary Search/Filter panels and primary Surprise Me control.
- `components/discovery/DiscoveryCard.tsx` — accessible themed card presentation and image fallback.
- `components/discovery/DiscoveryActions.tsx` — Save, Not for me, and Similar button row.
- `components/discovery/DiscoveryStatusCard.tsx` — retained-deck loading, empty, and retry UI.
- `components/discovery/UndoNotice.tsx` — Save success, Undo, and action-error feedback.
- `components/discovery/DiscoveryAnnouncer.native.tsx` — native screen-reader state announcements.
- `components/discovery/DiscoveryAnnouncer.web.tsx` — polite web live-region announcements.
- `components/discovery/useReducedMotion.ts` — live system reduced-motion preference.
- `components/discovery/SwipeDeck.tsx` — card stack, drag threshold, animation lock, and button/gesture parity.
- `components/discovery/DetailSheet.tsx` — responsive category-aware detail sheet and focus management.
- `components/discovery/__tests__/CategoryPicker.test.tsx` — labels, selected state, and callbacks.
- `components/discovery/__tests__/DiscoveryControls.test.tsx` — action hierarchy and accessible form behavior.
- `components/discovery/__tests__/DiscoveryCard.test.tsx` — image fallback and unclipped essential text.
- `components/discovery/__tests__/DiscoveryActions.test.tsx` — labeled action callback parity.
- `components/discovery/__tests__/DiscoveryStatusCard.test.tsx` — loading, empty, safe error, and Retry states.
- `components/discovery/__tests__/useReducedMotion.test.tsx` — live system preference subscription and cleanup.
- `components/discovery/__tests__/SwipeDeck.test.tsx` — threshold decisions, action locking, and reduced-motion behavior.
- `components/discovery/__tests__/DetailSheet.test.tsx` — focus, error, close, and detail-action behavior.
- `components/discovery/useDiscoveryController.ts` — reducer, request tracker, provider calls, storage calls, and Undo timing.
- `components/discovery/__tests__/useDiscoveryController.test.tsx` — request and persistence side-effect orchestration.
- `app/__tests__/index.test.tsx` — route-level category, deck, detail, Similar, safe-error, and accessibility flow.

### Modify

- `lib/discovery/state.ts` — re-export the new state contract so existing import paths migrate safely.
- `lib/discovery/__tests__/state.test.ts` — replace reset-on-category tests with per-category restoration expectations.
- `app/index.tsx` — compose the new controls, deck, detail sheet, and controller; remove obsolete results-grid/detail state.
- `lib/theme.ts` — add shared focus, success, warning, and failure tokens needed by accessible components.
- `app/+html.tsx` — only if final keyboard focus verification proves the existing web reset suppresses focus; otherwise leave unchanged.
- `README.md` — document the new interaction model and cross-platform verification commands.

---

### Task 1: Establish Category Theme Tokens

**Files:**
- Create: `lib/discovery/categoryThemes.ts`
- Create: `lib/discovery/__tests__/categoryThemes.test.ts`
- Modify: `lib/theme.ts`

**Interfaces:**
- Consumes: `ContentCategory` from `types/content.ts` and `Palette` from `lib/theme.ts`.
- Produces: `CATEGORY_ORDER`, `CATEGORY_THEMES`, `CategoryTheme`, `CategoryPattern`, and `getCategoryTheme(category)`.

- [ ] **Step 1: Record the clean baseline**

Run:

```bash
npm test
npm run typecheck
```

Expected: all 11 existing tests pass and TypeScript exits with code 0. If either command fails, stop and diagnose the baseline before changing files.

- [ ] **Step 2: Write the failing completeness and contrast tests**

Create `lib/discovery/__tests__/categoryThemes.test.ts`:

```ts
import type { ContentCategory } from "../../../types/content";
import {
  CATEGORY_ORDER,
  CATEGORY_THEMES,
  getCategoryTheme,
} from "../categoryThemes";

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.03928
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("category themes", () => {
  it("defines one complete theme for every category", () => {
    const expected: ContentCategory[] = ["artists", "albums", "books", "movies"];
    expect(CATEGORY_ORDER).toEqual(expected);
    expect(Object.keys(CATEGORY_THEMES).sort()).toEqual([...expected].sort());
    for (const category of expected) {
      expect(getCategoryTheme(category).label.length).toBeGreaterThan(0);
      expect(getCategoryTheme(category).badge.length).toBeGreaterThan(0);
    }
  });

  it("keeps text on category accents at WCAG AA contrast", () => {
    for (const category of CATEGORY_ORDER) {
      const theme = getCategoryTheme(category);
      expect(contrast(theme.accent, theme.onAccent)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
```

- [ ] **Step 3: Run the new test and confirm the missing-module failure**

Run:

```bash
npm test -- --runTestsByPath lib/discovery/__tests__/categoryThemes.test.ts
```

Expected: FAIL because `../categoryThemes` does not exist.

- [ ] **Step 4: Implement the typed category token map**

Create `lib/discovery/categoryThemes.ts` with this public shape and approved values:

```ts
import type { ContentCategory } from "../../types/content";

export type CategoryPattern = "backstage" | "record" | "paper" | "ticket";

export type CategoryTheme = {
  label: string;
  singular: string;
  icon: "microphone" | "music" | "book" | "film";
  badge: string;
  accent: string;
  secondary: string;
  onAccent: string;
  softLight: string;
  softDark: string;
  pattern: CategoryPattern;
};

export const CATEGORY_ORDER: ContentCategory[] = [
  "artists",
  "albums",
  "books",
  "movies",
];

export const CATEGORY_THEMES: Record<ContentCategory, CategoryTheme> = {
  artists: {
    label: "Artists",
    singular: "artist",
    icon: "microphone",
    badge: "BACKSTAGE PICK",
    accent: "#8BEA4A",
    secondary: "#315BFF",
    onAccent: "#0C1B05",
    softLight: "#E9FFD9",
    softDark: "#18300E",
    pattern: "backstage",
  },
  albums: {
    label: "Albums",
    singular: "album",
    icon: "music",
    badge: "FRESH PRESSING",
    accent: "#FF8A4C",
    secondary: "#32D7D2",
    onAccent: "#1D0900",
    softLight: "#FFF0E8",
    softDark: "#35190E",
    pattern: "record",
  },
  books: {
    label: "Books",
    singular: "book",
    icon: "book",
    badge: "MARGIN NOTE",
    accent: "#FFD84D",
    secondary: "#5B2BE0",
    onAccent: "#201500",
    softLight: "#FFF8D8",
    softDark: "#332B0F",
    pattern: "paper",
  },
  movies: {
    label: "Movies",
    singular: "movie",
    icon: "film",
    badge: "TONIGHT'S FEATURE",
    accent: "#FF5CA8",
    secondary: "#3F78FF",
    onAccent: "#19000C",
    softLight: "#FFE3F0",
    softDark: "#351124",
    pattern: "ticket",
  },
};

export function getCategoryTheme(category: ContentCategory): CategoryTheme {
  return CATEGORY_THEMES[category];
}
```

Extend `Palette` in `lib/theme.ts` with `isDark`, `focus`, `success`, `warning`, and `danger`. Set `isDark: true` for `darkPalette` and `false` for `lightPalette`; components use it to select `softDark` or `softLight` category surfaces. Use `#B783FF`, `#4CD97B`, `#FFD166`, and `#FF6B7A` in dark mode and `#6D28D9`, `#187A3D`, `#8A5A00`, and `#B42335` in light mode.

- [ ] **Step 5: Run focused and regression tests**

Run:

```bash
npm test -- --runTestsByPath lib/discovery/__tests__/categoryThemes.test.ts
npm test
npm run typecheck
```

Expected: the theme test passes, all existing tests pass, and TypeScript exits 0.

- [ ] **Step 6: Commit the theme foundation**

```bash
git add lib/discovery/categoryThemes.ts lib/discovery/__tests__/categoryThemes.test.ts lib/theme.ts
git commit -m "feat: add playful category theme tokens"
```

### Task 2: Extract Provider-Neutral Discovery Loading

**Files:**
- Create: `lib/discovery/types.ts`
- Create: `lib/discovery/loadDiscovery.ts`
- Create: `lib/discovery/__tests__/loadDiscovery.test.ts`

**Interfaces:**
- Consumes: existing search, random, filter, and similar functions from `lib/api/tmdb.ts`, `lib/api/openlibrary.ts`, and `lib/api/discogs.ts`.
- Produces: `DiscoveryMode`, `DiscoveryLoadInput`, `DiscoveryProvider`, `DiscoveryProviderRegistry`, `loadDiscovery(input, providers?)`, and `toDiscoveryError(category)`.

- [ ] **Step 1: Write failing routing, Similar, validation, and safe-copy tests**

Create `lib/discovery/__tests__/loadDiscovery.test.ts`:

```ts
import type { ResultItem } from "../../../types/content";
import {
  loadDiscovery,
  toDiscoveryError,
  type DiscoveryProviderRegistry,
} from "../loadDiscovery";
import type { DiscoveryLoadInput } from "../types";

const item: ResultItem = { id: "1", title: "Arrival", subtitle: "2016", meta: "" };

function providers(): DiscoveryProviderRegistry {
  const provider = () => ({
    search: jest.fn(async () => [item]),
    random: jest.fn(async () => [item]),
    filter: jest.fn(async () => [item]),
    similar: jest.fn(async () => [item]),
  });
  return {
    movies: provider(),
    books: provider(),
    artists: provider(),
    albums: provider(),
  };
}

describe("loadDiscovery", () => {
  it("routes random discovery only to the selected category", async () => {
    const registry = providers();
    await expect(
      loadDiscovery({ category: "movies", mode: "randomize" }, registry)
    ).resolves.toEqual([item]);
    expect(registry.movies.random).toHaveBeenCalledTimes(1);
    expect(registry.books.random).not.toHaveBeenCalled();
  });

  it("requires an explicit source item for Similar", async () => {
    const registry = providers();
    await expect(
      loadDiscovery(
        { category: "movies", mode: "similar" } as unknown as DiscoveryLoadInput,
        registry
      )
    ).rejects.toThrow("Similar requires a source item");
    expect(registry.movies.similar).not.toHaveBeenCalled();
  });

  it("passes the source only after an explicit Similar request", async () => {
    const registry = providers();
    await loadDiscovery(
      { category: "movies", mode: "similar", seed: item },
      registry
    );
    expect(registry.movies.similar).toHaveBeenCalledWith(item);
  });

  it("never exposes a provider token response in user copy", () => {
    const message = toDiscoveryError("albums");
    expect(message).toBe("Couldn't load albums. Check your connection and try again.");
    expect(message).not.toMatch(/Discogs|401|token/i);
  });
});
```

- [ ] **Step 2: Run the test and verify the missing-module failure**

Run:

```bash
npm test -- --runTestsByPath lib/discovery/__tests__/loadDiscovery.test.ts
```

Expected: FAIL because `loadDiscovery.ts` does not exist.

- [ ] **Step 3: Define the request contract**

Create `lib/discovery/types.ts`:

```ts
import type { ContentCategory, ResultItem } from "../../types/content";

export type DiscoveryActionMode = "search" | "filter" | "randomize";
export type DiscoveryMode = DiscoveryActionMode | "similar";

export type DiscoveryRequestIdentity = {
  id: number;
  category: ContentCategory;
};

export type DiscoveryLoadInput =
  | { category: ContentCategory; mode: "randomize" }
  | { category: ContentCategory; mode: "search"; query: string }
  | { category: ContentCategory; mode: "filter"; filters: readonly string[] }
  | { category: ContentCategory; mode: "similar"; seed: ResultItem };

export type SimilarContext = {
  sourceId: string;
  sourceTitle: string;
};
```

- [ ] **Step 4: Implement provider adapters and the public loader**

Create `lib/discovery/loadDiscovery.ts`. Move the exact filter conversion currently inside `app/index.tsx:637-722` into the category adapters; do not alter the existing API functions. The public portion must be:

```ts
import type { ContentCategory, ResultItem } from "../../types/content";
import type { DiscoveryLoadInput } from "./types";

export type DiscoveryProvider = {
  search(query: string): Promise<ResultItem[]>;
  random(): Promise<ResultItem[]>;
  filter(filters: readonly string[]): Promise<ResultItem[]>;
  similar(item: ResultItem): Promise<ResultItem[]>;
};

export type DiscoveryProviderRegistry = Record<ContentCategory, DiscoveryProvider>;

export async function loadDiscovery(
  input: DiscoveryLoadInput,
  providers: DiscoveryProviderRegistry = defaultDiscoveryProviders
): Promise<ResultItem[]> {
  const provider = providers[input.category];
  if (input.mode === "search") {
    if (!input.query.trim()) throw new Error("Search requires a query");
    return provider.search(input.query.trim());
  }
  if (input.mode === "filter") return provider.filter([...input.filters]);
  if (input.mode === "randomize") return provider.random();
  if (!("seed" in input)) throw new Error("Similar requires a source item");
  return provider.similar(input.seed);
}

export function toDiscoveryError(category: ContentCategory): string {
  const label: Record<ContentCategory, string> = {
    movies: "movies",
    books: "books",
    artists: "artists",
    albums: "albums",
  };
  return `Couldn't load ${label[category]}. Check your connection and try again.`;
}
```

Add the existing API imports and implement the default adapters exactly as follows:

```ts
function yearRange(filters: readonly string[]) {
  const decade = filters.find((filter) => /^\d{2}s$/.test(filter));
  return decade ? decadeToYearRange(decade) : null;
}

function minimumRating(filters: readonly string[]): number | undefined {
  const label = filters.find((filter) => /^\d(\.\d)?\+$/.test(filter));
  return label ? Number.parseFloat(label) : undefined;
}

const defaultDiscoveryProviders: DiscoveryProviderRegistry = {
  movies: {
    search: searchMovies,
    random: randomMovies,
    filter: (filters) => {
      const range = yearRange(filters);
      const genreIds = filters
        .map((filter) => TMDB_GENRES[filter])
        .filter((value): value is number => typeof value === "number");
      return filterMovies({
        genreIds: genreIds.length ? genreIds : undefined,
        yearFrom: range?.yearFrom,
        yearTo: range?.yearTo,
        minRating: minimumRating(filters),
      });
    },
    similar: (item) => getSimilarMovies(item.id),
  },
  books: {
    search: searchBooks,
    random: randomBooks,
    filter: (filters) => {
      const range = yearRange(filters);
      const subjects = filters
        .map((filter) => OL_SUBJECTS[filter])
        .filter((value): value is string => typeof value === "string");
      return filterBooks({
        subjects: subjects.length ? subjects : undefined,
        yearFrom: range?.yearFrom,
        yearTo: range?.yearTo,
        minRating: minimumRating(filters),
      });
    },
    similar: (item) => getSimilarBooks(item.id),
  },
  artists: {
    search: searchArtists,
    random: randomArtists,
    filter: (filters) => {
      const range = yearRange(filters);
      const genres = filters
        .map((filter) => SPOTIFY_GENRE_MAP[filter])
        .filter((value): value is string => typeof value === "string");
      return filterArtists({
        genres: genres.length ? genres : undefined,
        yearFrom: range?.yearFrom,
        yearTo: range?.yearTo,
      });
    },
    similar: (item) => getSimilarArtists(item.id),
  },
  albums: {
    search: searchAlbums,
    random: randomAlbums,
    filter: (filters) => {
      const range = yearRange(filters);
      const genres = filters
        .map((filter) => SPOTIFY_GENRE_MAP[filter])
        .filter((value): value is string => typeof value === "string");
      return filterAlbums({
        genres: genres.length ? genres : undefined,
        yearFrom: range?.yearFrom,
        yearTo: range?.yearTo,
      });
    },
    similar: (item) => getSimilarAlbums(item.id),
  },
};
```

Import each named function and map from the current three provider modules. Keep `defaultDiscoveryProviders` module-private; production callers use it through the default parameter and tests inject their registry.

- [ ] **Step 5: Run loader tests and the full baseline**

Run:

```bash
npm test -- --runTestsByPath lib/discovery/__tests__/loadDiscovery.test.ts
npm test
npm run typecheck
```

Expected: all commands pass. No provider request occurs during the unit test because the registry is injected.

- [ ] **Step 6: Commit the provider boundary**

```bash
git add lib/discovery/types.ts lib/discovery/loadDiscovery.ts lib/discovery/__tests__/loadDiscovery.test.ts
git commit -m "refactor: isolate discovery provider loading"
```

### Task 3: Add Per-Category Deck and Request State

**Files:**
- Create: `lib/discovery/deckState.ts`
- Create: `lib/discovery/__tests__/deckState.test.ts`

**Interfaces:**
- Consumes: `DiscoveryActionMode`, `DiscoveryLoadInput`, `DiscoveryRequestIdentity`, and `SimilarContext` from `lib/discovery/types.ts`.
- Produces: `DeckState`, `CategoryDiscoverySession`, `DiscoveryDeckState`, `SaveOperation`, `createInitialDiscoveryDeckState()`, `activeDeckItem(deck)`, and `discoveryDeckReducer(state, action)`.

- [ ] **Step 1: Write the failing reducer tests**

Create `lib/discovery/__tests__/deckState.test.ts` with fixtures for one movie and one book, then cover these exact transitions:

```ts
import type { ResultItem } from "../../../types/content";
import {
  activeDeckItem,
  createInitialDiscoveryDeckState,
  discoveryDeckReducer,
} from "../deckState";

const movie: ResultItem = { id: "m1", title: "Arrival", subtitle: "2016", meta: "" };
const book: ResultItem = { id: "b1", title: "Dune", subtitle: "Frank Herbert", meta: "" };

describe("discoveryDeckReducer", () => {
  it("restores a completed category deck after switching away and back", () => {
    let state = createInitialDiscoveryDeckState();
    state = discoveryDeckReducer(state, { type: "selectCategory", category: "movies" });
    state = discoveryDeckReducer(state, {
      type: "requestStarted",
      request: { id: 1, category: "movies" },
      input: { category: "movies", mode: "randomize" },
    });
    state = discoveryDeckReducer(state, {
      type: "requestSucceeded",
      request: { id: 1, category: "movies" },
      input: { category: "movies", mode: "randomize" },
      items: [movie],
    });
    state = discoveryDeckReducer(state, { type: "selectCategory", category: "books" });
    state = discoveryDeckReducer(state, { type: "selectCategory", category: "movies" });
    expect(activeDeckItem(state.sessions.movies.deck)).toEqual(movie);
  });

  it("ignores a stale completion and keeps the previous queue visible", () => {
    let state = createInitialDiscoveryDeckState();
    state = discoveryDeckReducer(state, {
      type: "requestStarted",
      request: { id: 2, category: "movies" },
      input: { category: "movies", mode: "randomize" },
    });
    const next = discoveryDeckReducer(state, {
      type: "requestSucceeded",
      request: { id: 1, category: "movies" },
      input: { category: "movies", mode: "randomize" },
      items: [movie],
    });
    expect(next).toBe(state);
  });

  it("ends a departing request without erasing its completed queue", () => {
    const base = createInitialDiscoveryDeckState({ movies: [movie] });
    const selected = discoveryDeckReducer(base, {
      type: "selectCategory",
      category: "movies",
    });
    const started = discoveryDeckReducer(selected, {
      type: "requestStarted",
      request: { id: 9, category: "movies" },
      input: { category: "movies", mode: "randomize" },
    });
    const switched = discoveryDeckReducer(started, {
      type: "selectCategory",
      category: "books",
    });
    expect(switched.sessions.movies.activeRequest).toBeNull();
    expect(switched.sessions.movies.status).toBe("ready");
    expect(activeDeckItem(switched.sessions.movies.deck)).toEqual(movie);
  });

  it("keeps the old queue when a replacement request fails", () => {
    const base = createInitialDiscoveryDeckState({ movies: [movie] });
    const started = discoveryDeckReducer(base, {
      type: "requestStarted",
      request: { id: 3, category: "movies" },
      input: { category: "movies", mode: "search", query: "space" },
    });
    const failed = discoveryDeckReducer(started, {
      type: "requestFailed",
      request: { id: 3, category: "movies" },
      message: "Couldn't load movies. Check your connection and try again.",
    });
    expect(activeDeckItem(failed.sessions.movies.deck)).toEqual(movie);
    expect(failed.sessions.movies.status).toBe("error");
  });

  it("skips without storing a preference", () => {
    const base = createInitialDiscoveryDeckState({ movies: [movie] });
    const next = discoveryDeckReducer(base, {
      type: "skipCurrent",
      category: "movies",
      itemId: movie.id,
    });
    expect(activeDeckItem(next.sessions.movies.deck)).toBeNull();
    expect(next).not.toHaveProperty("preferences");
  });

  it("rolls a failed Save back to the front", () => {
    const operation = { id: 7, category: "movies" as const, item: movie };
    let state = createInitialDiscoveryDeckState({ movies: [movie] });
    state = discoveryDeckReducer(state, { type: "saveStarted", operation });
    expect(activeDeckItem(state.sessions.movies.deck)).toBeNull();
    state = discoveryDeckReducer(state, {
      type: "saveFailed",
      operationId: 7,
      message: "Couldn't save that one. It's back in your deck.",
    });
    expect(activeDeckItem(state.sessions.movies.deck)).toEqual(movie);
  });

  it("makes only a completed Save undoable", () => {
    const operation = { id: 8, category: "books" as const, item: book };
    let state = createInitialDiscoveryDeckState({ books: [book] });
    state = discoveryDeckReducer(state, { type: "saveStarted", operation });
    expect(state.lastSave).toBeNull();
    state = discoveryDeckReducer(state, { type: "saveSucceeded", operationId: 8 });
    expect(state.lastSave).toEqual(operation);
    state = discoveryDeckReducer(state, { type: "undoSave", operationId: 8 });
    expect(activeDeckItem(state.sessions.books.deck)).toEqual(book);
    expect(state.lastSave).toBeNull();
  });
});
```

- [ ] **Step 2: Run the reducer test and confirm the missing-module failure**

Run:

```bash
npm test -- --runTestsByPath lib/discovery/__tests__/deckState.test.ts
```

Expected: FAIL because `deckState.ts` does not exist.

- [ ] **Step 3: Implement queue helpers and the per-category reducer**

Create `lib/discovery/deckState.ts`. Use a queue whose first element is the active card, so restoring an undone item is deterministic even if another category was viewed in between:

```ts
import type { ContentCategory, ResultItem } from "../../types/content";
import type {
  DiscoveryActionMode,
  DiscoveryLoadInput,
  DiscoveryRequestIdentity,
  SimilarContext,
} from "./types";

export type DeckState = {
  queue: ResultItem[];
  seenCount: number;
  similarContext: SimilarContext | null;
};

export type CategoryDiscoverySession = {
  activeAction: DiscoveryActionMode | null;
  searchQuery: string;
  openSection: string | null;
  selectedFilters: string[];
  deck: DeckState;
  status: "idle" | "loading" | "ready" | "empty" | "error";
  requestError: string | null;
  activeRequest: DiscoveryRequestIdentity | null;
  retryInput: DiscoveryLoadInput | null;
};

export type SaveOperation = {
  id: number;
  category: ContentCategory;
  item: ResultItem;
};

export type DiscoveryDeckState = {
  selected: ContentCategory | null;
  sessions: Record<ContentCategory, CategoryDiscoverySession>;
  pendingSaves: SaveOperation[];
  lastSave: SaveOperation | null;
  actionError: string | null;
};

export type DiscoveryDeckAction =
  | { type: "selectCategory"; category: ContentCategory }
  | { type: "setActiveAction"; category: ContentCategory; action: DiscoveryActionMode }
  | { type: "setSearchQuery"; category: ContentCategory; query: string }
  | { type: "setOpenSection"; category: ContentCategory; section: string | null }
  | { type: "toggleFilter"; category: ContentCategory; value: string }
  | { type: "clearFilters"; category: ContentCategory }
  | {
      type: "requestStarted";
      request: DiscoveryRequestIdentity;
      input: DiscoveryLoadInput;
    }
  | {
      type: "requestSucceeded";
      request: DiscoveryRequestIdentity;
      input: DiscoveryLoadInput;
      items: ResultItem[];
    }
  | { type: "requestFailed"; request: DiscoveryRequestIdentity; message: string }
  | { type: "skipCurrent"; category: ContentCategory; itemId: string }
  | { type: "saveStarted"; operation: SaveOperation }
  | { type: "saveSucceeded"; operationId: number }
  | { type: "saveFailed"; operationId: number; message: string }
  | { type: "undoSave"; operationId: number }
  | { type: "clearUndo"; operationId: number }
  | { type: "clearActionError" };

export function activeDeckItem(deck: DeckState): ResultItem | null {
  return deck.queue[0] ?? null;
}

function replaceDeck(
  deck: DeckState,
  items: ResultItem[],
  similarContext: SimilarContext | null
): DeckState {
  const seen = new Set<string>();
  const queue: ResultItem[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    queue.push(item);
  }
  return {
    queue,
    seenCount: 0,
    similarContext,
  };
}

function dismiss(deck: DeckState, itemId: string): DeckState {
  if (deck.queue[0]?.id !== itemId) return deck;
  return { ...deck, queue: deck.queue.slice(1), seenCount: deck.seenCount + 1 };
}

function restore(deck: DeckState, item: ResultItem): DeckState {
  return {
    ...deck,
    queue: [item, ...deck.queue.filter((candidate) => candidate.id !== item.id)],
    seenCount: Math.max(0, deck.seenCount - 1),
  };
}
```

Add `createSession(items)`, an `updateSession(state, category, update)` helper, and factories for all four category sessions. The exported factory returns fresh arrays on every call and uses the seeded items as the category queue.

Implement `discoveryDeckReducer(state, action)` against the union above with these exact guards and outcomes:

- `selectCategory` changes `selected`; when departing a different selected category, it clears only that session's `activeRequest`, sets a retained nonempty queue to `ready` and an empty queue to `idle`, and leaves its inputs/queue untouched.
- Every form action changes only the named session. `toggleFilter` removes an existing value or appends a missing value without mutating the old array.
- `requestStarted` requires `request.category === input.category`, retains the queue, stores both request and retry snapshot, clears the session error, and sets `loading`.
- Request completion compares both ID and category to the session's `activeRequest`. A mismatch returns the original state object.
- Success calls `replaceDeck`, sets `ready` or `empty`, clears the request/error, and collapses `activeAction`. Similar sets `{sourceId: input.seed.id, sourceTitle: input.seed.title}`; every other mode sets `similarContext: null`.
- Failure retains the queue and inputs, sets `error`, clears `activeRequest`, and stores only the supplied safe message.
- Skip returns the original state unless `itemId` is the active item, then calls `dismiss` on that category only.
- `saveStarted` returns the original state unless its item is active, then dismisses it, appends the operation to `pendingSaves`, and clears `actionError`.
- Save success returns the original state when the operation is no longer pending; otherwise it removes the operation and sets it as `lastSave` only if its ID is newer.
- Save failure finds the pending operation, removes it, restores its item to that category's front, clears it from `lastSave` if necessary, and stores the supplied safe message.
- Undo acts only on the matching `lastSave`, restores the item to that category's front, and clears `lastSave`/`actionError`.
- `clearUndo` clears only a matching operation, and `clearActionError` clears only the action message.

The optional test factory input has this exact signature:

```ts
export function createInitialDiscoveryDeckState(
  seeded: Partial<Record<ContentCategory, ResultItem[]>> = {}
): DiscoveryDeckState;
```

- [ ] **Step 4: Add remaining form and request guard tests**

Extend the same test file to verify `setActiveAction`, `setSearchQuery`, `toggleFilter`, `clearFilters`, and `setOpenSection` update only their named category; success collapses the active input panel while failure leaves it open; a current empty response sets `status: "empty"`; a Similar success records `{sourceId, sourceTitle}`; a later Randomize success clears that context; and an older Save resolving after a newer Save cannot replace the newer operation in `lastSave`.

- [ ] **Step 5: Run focused tests, full tests, and typecheck**

Run:

```bash
npm test -- --runTestsByPath lib/discovery/__tests__/deckState.test.ts
npm test
npm run typecheck
```

Expected: all pass; the current app still uses its original reducer at this checkpoint.

- [ ] **Step 6: Commit the isolated state foundation**

```bash
git add lib/discovery/deckState.ts lib/discovery/__tests__/deckState.test.ts
git commit -m "feat: add isolated discovery deck state"
```

### Task 4: Build the Category Picker and Discovery Controls

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `components/discovery/CategoryPicker.tsx`
- Create: `components/discovery/DiscoveryControls.tsx`
- Create: `components/discovery/__tests__/CategoryPicker.test.tsx`
- Create: `components/discovery/__tests__/DiscoveryControls.test.tsx`

**Interfaces:**
- Consumes: `Palette`, `ContentCategory`, `DiscoveryActionMode`, `CATEGORY_ORDER`, `getCategoryTheme`, and the existing filter constants.
- Produces: `CategoryPickerProps` and `DiscoveryControlsProps`. Neither component imports an API client or mutates discovery state directly.

- [ ] **Step 1: Add the component-testing dependency**

Run:

```bash
npx expo install --dev @testing-library/react-native
```

Expected: `package.json` and `package-lock.json` add the development dependency without changing Expo, React, or React Native versions.

- [ ] **Step 2: Write the failing picker tests**

Create `components/discovery/__tests__/CategoryPicker.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import { darkPalette } from "../../../lib/theme";
import { CategoryPicker } from "../CategoryPicker";

describe("CategoryPicker", () => {
  it("labels all four choices and reports the selected category", () => {
    const onSelect = jest.fn();
    render(
      <CategoryPicker
        selected="movies"
        compact={false}
        palette={darkPalette}
        onSelect={onSelect}
      />
    );
    const movies = screen.getByRole("button", { name: "Movies" });
    expect(movies.props.accessibilityState).toEqual({ selected: true });
    fireEvent.press(screen.getByRole("button", { name: "Books" }));
    expect(onSelect).toHaveBeenCalledWith("books");
    expect(screen.getByRole("button", { name: "Artists" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Albums" })).toBeTruthy();
  });

  it("shows one active-category control in compact mode", () => {
    render(
      <CategoryPicker
        selected="albums"
        compact
        palette={darkPalette}
        onSelect={jest.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Change category. Albums selected" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Movies" })).toBeNull();
  });
});
```

- [ ] **Step 3: Run the picker test and verify the missing-module failure**

Run:

```bash
npm test -- --runTestsByPath components/discovery/__tests__/CategoryPicker.test.tsx
```

Expected: FAIL because `CategoryPicker.tsx` does not exist.

- [ ] **Step 4: Implement the responsive picker**

Create `components/discovery/CategoryPicker.tsx` with this interface:

```ts
export type CategoryPickerProps = {
  selected: ContentCategory | null;
  compact: boolean;
  palette: Palette;
  onSelect(category: ContentCategory): void;
};
```

Use `useWindowDimensions()` rather than module-level `Dimensions.get()`. Use two columns below 760 points and four columns at or above 760, with a maximum content width of 960. Render categories in `CATEGORY_ORDER`. Each expanded tile must have `accessibilityRole="button"`, `accessibilityLabel={theme.label}`, `accessibilityState={{selected: selected === category}}`, and `minHeight: 112`. Render the icon and category name as semantic content; render the approved pattern as a low-opacity `View` with `accessible={false}`, `importantForAccessibility="no-hide-descendants"`, and `aria-hidden` on web.

When `compact` is true and a category is selected, render only one 44-point-high button labeled `Change category. ${theme.label} selected`; pressing it calls `onSelect(selected)` and the parent interprets selecting the current compact category as reopening the expanded picker.

- [ ] **Step 5: Write failing discovery-control tests**

Create `components/discovery/__tests__/DiscoveryControls.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import { darkPalette } from "../../../lib/theme";
import { DiscoveryControls } from "../DiscoveryControls";

const baseProps = {
  category: "movies" as const,
  activeAction: null,
  query: "",
  filters: [] as string[],
  openSection: null as string | null,
  loading: false,
  palette: darkPalette,
  onActionChange: jest.fn(),
  onQueryChange: jest.fn(),
  onToggleFilter: jest.fn(),
  onOpenSection: jest.fn(),
  onClearFilters: jest.fn(),
  onSubmit: jest.fn(),
};

describe("DiscoveryControls", () => {
  beforeEach(() => jest.clearAllMocks());

  it("makes Surprise Me primary without hiding Search or Filter", () => {
    render(<DiscoveryControls {...baseProps} />);
    fireEvent.press(screen.getByRole("button", { name: "Surprise me with a movie" }));
    expect(baseProps.onSubmit).toHaveBeenCalledWith("randomize");
    expect(screen.getByRole("button", { name: "Search movies" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Filter movies" })).toBeTruthy();
  });

  it("submits a labeled search and keeps the input accessible", () => {
    render(<DiscoveryControls {...baseProps} activeAction="search" query="space" />);
    fireEvent.changeText(screen.getByLabelText("Search movies"), "moon");
    expect(baseProps.onQueryChange).toHaveBeenCalledWith("moon");
    fireEvent.press(screen.getByRole("button", { name: "Find movies" }));
    expect(baseProps.onSubmit).toHaveBeenCalledWith("search");
  });

  it("does not advertise unsupported album rating filters", () => {
    render(<DiscoveryControls {...baseProps} category="albums" activeAction="filter" />);
    expect(screen.queryByText("Rating")).toBeNull();
  });
});
```

- [ ] **Step 6: Implement the controlled Search, Filter, and Surprise Me UI**

Create `components/discovery/DiscoveryControls.tsx` with this exact controlled interface:

```ts
export type DiscoveryControlsProps = {
  category: ContentCategory;
  activeAction: DiscoveryActionMode | null;
  query: string;
  filters: string[];
  openSection: string | null;
  loading: boolean;
  palette: Palette;
  onActionChange(action: DiscoveryActionMode): void;
  onQueryChange(query: string): void;
  onToggleFilter(value: string): void;
  onOpenSection(section: string | null): void;
  onClearFilters(): void;
  onSubmit(action: DiscoveryActionMode): void;
};
```

Move the supported genre, era, and rating-option derivation from `app/index.tsx:797-819` into this component. Render rating filters only for Movies and Books because the current Discogs adapters do not implement album or artist rating semantics. Do not render the unused popularity controls. Search and Filter are 44-point secondary buttons. Surprise Me is always visible, uses the category accent, is labeled `Surprise me with a ${theme.singular}`, and calls `onSubmit("randomize")` directly. Search uses a single-line input labeled `Search ${theme.label.toLowerCase()}` and a 44-point Find button that is disabled when the trimmed query is empty. Filter accordions expose expanded state, chips expose selected state, and Apply calls `onSubmit("filter")`. Disable submissions while `loading`, but leave inputs readable.

- [ ] **Step 7: Run focused and full verification**

Run:

```bash
npm test -- --runTestsByPath components/discovery/__tests__/CategoryPicker.test.tsx components/discovery/__tests__/DiscoveryControls.test.tsx
npm test
npm run typecheck
```

Expected: all pass. The new components are still not mounted by the route.

- [ ] **Step 8: Commit the discovery controls**

```bash
git add package.json package-lock.json components/discovery/CategoryPicker.tsx components/discovery/DiscoveryControls.tsx components/discovery/__tests__/CategoryPicker.test.tsx components/discovery/__tests__/DiscoveryControls.test.tsx
git commit -m "feat: add playful discovery controls"
```

### Task 5: Build Accessible Cards, Actions, Status, and Announcements

**Files:**
- Create: `components/discovery/DiscoveryCard.tsx`
- Create: `components/discovery/DiscoveryActions.tsx`
- Create: `components/discovery/DiscoveryStatusCard.tsx`
- Create: `components/discovery/UndoNotice.tsx`
- Create: `components/discovery/DiscoveryAnnouncer.native.tsx`
- Create: `components/discovery/DiscoveryAnnouncer.web.tsx`
- Create: `components/discovery/__tests__/DiscoveryCard.test.tsx`
- Create: `components/discovery/__tests__/DiscoveryActions.test.tsx`
- Create: `components/discovery/__tests__/DiscoveryStatusCard.test.tsx`

**Interfaces:**
- Consumes: `ResultItem`, `ContentCategory`, `Palette`, and category theme tokens.
- Produces: presentational components with no provider, reducer, or storage imports.

- [ ] **Step 1: Write failing action-parity and status tests**

Create `components/discovery/__tests__/DiscoveryActions.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import { darkPalette } from "../../../lib/theme";
import { DiscoveryActions } from "../DiscoveryActions";

it("exposes all three decisions as labeled buttons", () => {
  const onSave = jest.fn();
  const onSkip = jest.fn();
  const onSimilar = jest.fn();
  render(
    <DiscoveryActions
      disabled={false}
      palette={darkPalette}
      accent="#FF5CA8"
      onAccent="#19000C"
      onSave={onSave}
      onSkip={onSkip}
      onSimilar={onSimilar}
    />
  );
  fireEvent.press(screen.getByRole("button", { name: "Save" }));
  fireEvent.press(screen.getByRole("button", { name: "Not for me" }));
  fireEvent.press(screen.getByRole("button", { name: "Find similar" }));
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(onSkip).toHaveBeenCalledTimes(1);
  expect(onSimilar).toHaveBeenCalledTimes(1);
});
```

Create `components/discovery/__tests__/DiscoveryStatusCard.test.tsx` and verify an error message plus Retry button, an empty state plus Shuffle again button, and a loading state with a readable label. Assert no supplied raw `Error` object is accepted by the component props.

Create `components/discovery/__tests__/DiscoveryCard.test.tsx` with a long movie title and remote `imageUrl`. Fire the image's `onError`, assert `artwork-fallback` appears, and assert title/subtitle text nodes do not set `numberOfLines`.

- [ ] **Step 2: Run the tests and confirm missing-module failures**

Run:

```bash
npm test -- --runTestsByPath components/discovery/__tests__/DiscoveryCard.test.tsx components/discovery/__tests__/DiscoveryActions.test.tsx components/discovery/__tests__/DiscoveryStatusCard.test.tsx
```

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement the action row and card presentation**

`DiscoveryActions.tsx` exports:

```ts
export type DiscoveryActionsProps = {
  disabled: boolean;
  palette: Palette;
  accent: string;
  onAccent: string;
  onSave(): void;
  onSkip(): void;
  onSimilar(): void;
};
```

Render all labels as text. Each `Pressable` has `accessibilityRole="button"`, an explicit label, disabled state, and `minWidth: 44`, `minHeight: 44`. Save receives the accent treatment; Not for me and Similar remain visually secondary.

`DiscoveryCard.tsx` uses `forwardRef` and exports:

```ts
export type DiscoveryCardHandle = {
  focus(): void;
};

export type DiscoveryCardProps = {
  category: ContentCategory;
  item: ResultItem;
  palette: Palette;
  active: boolean;
  swipeCue: "save" | "skip" | null;
  onPress(): void;
};
```

Render category badge, artwork/fallback, title, subtitle, and metadata without fixed-height text containers or `numberOfLines` on essential text. Give the remote image `testID="discovery-artwork"`; its `onError` switches to a category-themed fallback with `testID="artwork-fallback"`. The card's accessible label combines category, title, subtitle, and metadata. Save/skip cue labels include text and are hidden until `swipeCue` is non-null. Decorative tape, stamp, and pattern views are hidden from accessibility APIs.

- [ ] **Step 4: Implement status, Undo, and platform announcers**

Use a discriminated status prop so raw errors cannot enter the presentation layer:

```ts
export type DiscoveryStatusCardProps =
  | { kind: "loading"; label: string; palette: Palette; reducedMotion: boolean }
  | { kind: "empty"; label: string; actionLabel: string; onAction(): void; palette: Palette }
  | { kind: "error"; message: string; onRetry(): void; palette: Palette };

export type UndoNoticeProps = {
  message: string | null;
  canUndo: boolean;
  palette: Palette;
  onUndo(): void;
};
```

`UndoNotice` shows either `Saved <title>` with a 44-point Undo button or a stable action-error message without Undo. It never receives provider errors.

`DiscoveryAnnouncer.native.tsx` accepts `{message: string | null}` and calls `AccessibilityInfo.announceForAccessibility(message)` when the non-null message changes. `DiscoveryAnnouncer.web.tsx` renders a visually hidden `<Text role="status" aria-live="polite">` containing the message. Both files default-export `DiscoveryAnnouncer` so platform resolution keeps the import stable. Do not rely on `announceForAccessibility` on web because React Native Web does not implement the announcement.

- [ ] **Step 5: Run focused and full verification**

Run:

```bash
npm test -- --runTestsByPath components/discovery/__tests__/DiscoveryCard.test.tsx components/discovery/__tests__/DiscoveryActions.test.tsx components/discovery/__tests__/DiscoveryStatusCard.test.tsx
npm test
npm run typecheck
```

Expected: all pass.

- [ ] **Step 6: Commit the presentation primitives**

```bash
git add components/discovery/DiscoveryCard.tsx components/discovery/DiscoveryActions.tsx components/discovery/DiscoveryStatusCard.tsx components/discovery/UndoNotice.tsx components/discovery/DiscoveryAnnouncer.native.tsx components/discovery/DiscoveryAnnouncer.web.tsx components/discovery/__tests__/DiscoveryCard.test.tsx components/discovery/__tests__/DiscoveryActions.test.tsx components/discovery/__tests__/DiscoveryStatusCard.test.tsx
git commit -m "feat: add accessible discovery card primitives"
```

### Task 6: Add Swipe Decisions, Motion Preferences, and the Deck

**Files:**
- Create: `lib/discovery/swipeDecision.ts`
- Create: `lib/discovery/motion.ts`
- Create: `lib/discovery/__tests__/swipeDecision.test.ts`
- Create: `lib/discovery/__tests__/motion.test.ts`
- Create: `components/discovery/useReducedMotion.ts`
- Create: `components/discovery/SwipeDeck.tsx`
- Create: `components/discovery/__tests__/useReducedMotion.test.tsx`
- Create: `components/discovery/__tests__/SwipeDeck.test.tsx`

**Interfaces:**
- Consumes: the Task 5 card and action components plus `ResultItem` and `ContentCategory`.
- Produces: one guarded `requestCommit` path for gesture and button decisions.

- [ ] **Step 1: Write failing pure decision and motion tests**

Create `lib/discovery/__tests__/swipeDecision.test.ts`:

```ts
import { resolveSwipeDecision, shouldClaimSwipe } from "../swipeDecision";

describe("resolveSwipeDecision", () => {
  it("commits by distance", () => {
    expect(resolveSwipeDecision({ translationX: 90, velocityX: 0, cardWidth: 300 })).toBe("save");
    expect(resolveSwipeDecision({ translationX: -90, velocityX: 0, cardWidth: 300 })).toBe("skip");
  });

  it("commits a short fast flick but rejects a weak drag", () => {
    expect(resolveSwipeDecision({ translationX: 30, velocityX: 0.9, cardWidth: 300 })).toBe("save");
    expect(resolveSwipeDecision({ translationX: 30, velocityX: 0.2, cardWidth: 300 })).toBeNull();
  });

  it("claims horizontal intent without stealing vertical scroll", () => {
    expect(shouldClaimSwipe(12, 4)).toBe(true);
    expect(shouldClaimSwipe(6, 1)).toBe(false);
    expect(shouldClaimSwipe(12, 14)).toBe(false);
  });
});
```

Create `lib/discovery/__tests__/motion.test.ts` and assert standard motion returns 220ms commit, 180ms reset, 8 degrees rotation, and 0.035 scale delta; reduced motion returns zero for all four values.

- [ ] **Step 2: Run the pure tests and verify missing-module failures**

Run:

```bash
npm test -- --runTestsByPath lib/discovery/__tests__/swipeDecision.test.ts lib/discovery/__tests__/motion.test.ts
```

Expected: FAIL because both modules are missing.

- [ ] **Step 3: Implement the pure gesture and motion contracts**

Create `lib/discovery/swipeDecision.ts`:

```ts
export type CardDecision = "save" | "skip";
export type SwipeSample = {
  translationX: number;
  velocityX: number;
  cardWidth: number;
};

export function shouldClaimSwipe(translationX: number, translationY: number): boolean {
  const horizontal = Math.abs(translationX);
  return horizontal >= 8 && horizontal >= Math.abs(translationY) * 1.2;
}

export function resolveSwipeDecision(sample: SwipeSample): CardDecision | null {
  const distanceReached = Math.abs(sample.translationX) >= sample.cardWidth * 0.24;
  const velocityReached = Math.abs(sample.velocityX) >= 0.75;
  if (!distanceReached && !velocityReached) return null;
  const direction = Math.abs(sample.translationX) >= 8
    ? sample.translationX
    : sample.velocityX;
  return direction > 0 ? "save" : "skip";
}
```

Create `lib/discovery/motion.ts`:

```ts
export type MotionSpec = {
  commitDurationMs: number;
  resetDurationMs: number;
  rotateDegrees: number;
  scaleDelta: number;
};

export function getMotionSpec(reducedMotion: boolean): MotionSpec {
  return reducedMotion
    ? { commitDurationMs: 0, resetDurationMs: 0, rotateDegrees: 0, scaleDelta: 0 }
    : { commitDurationMs: 220, resetDurationMs: 180, rotateDegrees: 8, scaleDelta: 0.035 };
}
```

- [ ] **Step 4: Write the failing live reduced-motion test**

Create `components/discovery/__tests__/useReducedMotion.test.tsx`:

```tsx
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";
import { useReducedMotion } from "../useReducedMotion";

it("tracks changes and removes its subscription", async () => {
  let onChange: ((enabled: boolean) => void) | undefined;
  const remove = jest.fn();
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, "addEventListener").mockImplementation(
    ((_event: string, handler: (enabled: boolean) => void) => {
      onChange = handler;
      return { remove };
    }) as typeof AccessibilityInfo.addEventListener
  );
  const { result, unmount } = renderHook(() => useReducedMotion());
  await waitFor(() => expect(result.current).toBe(false));
  act(() => onChange?.(true));
  expect(result.current).toBe(true);
  unmount();
  expect(remove).toHaveBeenCalledTimes(1);
});
```

Run the test and expect a missing-module failure, then implement `components/discovery/useReducedMotion.ts`. It must call `AccessibilityInfo.isReduceMotionEnabled()` on mount, subscribe to `reduceMotionChanged`, update when the setting changes, and remove the subscription on unmount. Do not use a startup-only snapshot.

- [ ] **Step 5: Write the failing deck parity and lock tests**

Create `components/discovery/__tests__/SwipeDeck.test.tsx` with one movie fixture. Verify pressing Save calls `onCommit(item, "save", "button")`, pressing Not for me calls `onCommit(item, "skip", "button")`, pressing Similar calls `onSimilar(item)`, tapping the card calls `onOpenDetail(item)`, and two Save presses before the mocked animation completion produce only one commit.

- [ ] **Step 6: Implement the responsive swipe deck**

Export this exact interface from `components/discovery/SwipeDeck.tsx`:

```ts
export type SwipeDeckProps = {
  category: ContentCategory;
  items: readonly ResultItem[];
  palette: Palette;
  reducedMotion: boolean;
  disabled?: boolean;
  onCommit(item: ResultItem, decision: CardDecision, source: "gesture" | "button"): void;
  onOpenDetail(item: ResultItem): void;
  onSimilar(item: ResultItem): void;
};
```

Use `useWindowDimensions()` and cap the active card width at 440. Render at most three cards. Use React Native `Animated.ValueXY` and `PanResponder`; do not add gesture-handler or another animation framework. Use `shouldClaimSwipe(dx, dy)` from the pure decision module before claiming the responder, so the surrounding vertical `ScrollView` still works.

Both `PanResponder` release and action buttons call one synchronous `requestCommit(decision, source)` function. That function sets a ref lock before starting animation, uses `resolveSwipeDecision` for gesture input, applies `getMotionSpec(reducedMotion)`, resets the pan value after exit, releases the lock, and invokes `onCommit` once. Below-threshold release springs back to center. Similar never maps to a swipe and is disabled while the lock is held.

The active card exposes Save/Not for me cue labels as drag opacity increases. Behind cards are noninteractive and hidden from the accessibility tree. Reduced motion skips translate/rotate/scale animation and commits synchronously.

- [ ] **Step 7: Run focused and full verification**

Run:

```bash
npm test -- --runTestsByPath lib/discovery/__tests__/swipeDecision.test.ts lib/discovery/__tests__/motion.test.ts components/discovery/__tests__/useReducedMotion.test.tsx components/discovery/__tests__/SwipeDeck.test.tsx
npm test
npm run typecheck
```

Expected: all pass; web resize uses current dimensions rather than the old module-level width.

- [ ] **Step 8: Commit the gesture layer**

```bash
git add lib/discovery/swipeDecision.ts lib/discovery/motion.ts lib/discovery/__tests__/swipeDecision.test.ts lib/discovery/__tests__/motion.test.ts components/discovery/useReducedMotion.ts components/discovery/SwipeDeck.tsx components/discovery/__tests__/useReducedMotion.test.tsx components/discovery/__tests__/SwipeDeck.test.tsx
git commit -m "feat: add accessible swipe deck interactions"
```

### Task 7: Extract Detail Loading and Build the Detail Sheet

**Files:**
- Create: `lib/discovery/loadDetail.ts`
- Create: `lib/discovery/__tests__/loadDetail.test.ts`
- Create: `components/discovery/DetailSheet.tsx`
- Create: `components/discovery/__tests__/DetailSheet.test.tsx`

**Interfaces:**
- Consumes: existing category-specific detail functions and detail types.
- Produces: one category-tagged detail union and a presentation-only sheet. Similar data is deliberately absent from detail loading.

- [ ] **Step 1: Write failing detail-routing tests**

Create `lib/discovery/__tests__/loadDetail.test.ts`:

```ts
import type { MovieDetail, ResultItem } from "../../../types/content";
import { loadDetail, toDetailError, type DetailLoaderRegistry } from "../loadDetail";

const item: ResultItem = { id: "10", title: "Arrival", subtitle: "2016", meta: "" };
const movie: MovieDetail = {
  id: "10",
  title: "Arrival",
  overview: "First contact.",
  releaseYear: "2016",
  rating: 8,
  genres: ["Science Fiction"],
  language: "en",
};

it("loads and tags only the requested category detail", async () => {
  const loaders: DetailLoaderRegistry = {
    movies: jest.fn(async () => movie),
    books: jest.fn(),
    artists: jest.fn(),
    albums: jest.fn(),
  };
  await expect(loadDetail("movies", item, loaders)).resolves.toEqual({
    category: "movies",
    data: movie,
  });
  expect(loaders.movies).toHaveBeenCalledWith(item);
  expect(loaders.books).not.toHaveBeenCalled();
});

it("returns stable detail error copy", () => {
  expect(toDetailError()).toBe("Couldn't load all the details. Try again.");
});
```

- [ ] **Step 2: Run the loader test and verify the missing-module failure**

Run:

```bash
npm test -- --runTestsByPath lib/discovery/__tests__/loadDetail.test.ts
```

Expected: FAIL because `loadDetail.ts` does not exist.

- [ ] **Step 3: Implement the category-tagged detail loader**

Create `lib/discovery/loadDetail.ts` with these public types:

```ts
export type ContentDetail =
  | { category: "movies"; data: MovieDetail }
  | { category: "books"; data: BookDetail }
  | { category: "artists"; data: ArtistDetail }
  | { category: "albums"; data: AlbumDetail };

export type DetailLoaderRegistry = {
  movies(item: ResultItem): Promise<MovieDetail>;
  books(item: ResultItem): Promise<BookDetail>;
  artists(item: ResultItem): Promise<ArtistDetail>;
  albums(item: ResultItem): Promise<AlbumDetail>;
};

export async function loadDetail(
  category: ContentCategory,
  item: ResultItem,
  loaders: DetailLoaderRegistry = defaultDetailLoaders
): Promise<ContentDetail>;

export function toDetailError(): string {
  return "Couldn't load all the details. Try again.";
}
```

The default registry calls `getMovieDetail(item.id)`, `getBookDetail(item.id, {title: item.title, imageUrl: item.imageUrl})`, `getArtistDetail(item.id)`, or `getAlbumDetail(item.id)`. Do not import or call any `getSimilar*` function in this module.

- [ ] **Step 4: Write failing detail-sheet behavior tests**

Create `components/discovery/__tests__/DetailSheet.test.tsx`. Verify:

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import { darkPalette } from "../../../lib/theme";
import type { ResultItem } from "../../../types/content";
import { DetailSheet } from "../DetailSheet";

const item: ResultItem = { id: "10", title: "Arrival", subtitle: "2016", meta: "★ 8.0" };

it("offers deck actions and an accessible close path for a deck item", () => {
  const onClose = jest.fn();
  const onSave = jest.fn();
  render(
    <DetailSheet
      visible
      selection={{ category: "movies", item, origin: "deck" }}
      detail={null}
      loading={false}
      errorMessage={null}
      saved={false}
      palette={darkPalette}
      reducedMotion
      onClose={onClose}
      onRetry={jest.fn()}
      onSave={onSave}
      onSkip={jest.fn()}
      onSimilar={jest.fn()}
      onShare={jest.fn()}
    />
  );
  expect(screen.getByRole("dialog", { name: "Arrival details" })).toBeTruthy();
  fireEvent.press(screen.getByRole("button", { name: "Save" }));
  expect(onSave).toHaveBeenCalledWith(item);
  fireEvent.press(screen.getByRole("button", { name: "Close details" }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

it("does not let a stored item skip an unrelated active deck", () => {
  render(
    <DetailSheet
      visible
      selection={{ category: "movies", item, origin: "stored" }}
      detail={null}
      loading={false}
      errorMessage={null}
      saved
      palette={darkPalette}
      reducedMotion
      onClose={jest.fn()}
      onRetry={jest.fn()}
      onSave={jest.fn()}
      onSkip={jest.fn()}
      onSimilar={jest.fn()}
      onShare={jest.fn()}
    />
  );
  expect(screen.queryByRole("button", { name: "Not for me" })).toBeNull();
  expect(screen.getByRole("button", { name: "Remove from saved" })).toBeTruthy();
});
```

- [ ] **Step 5: Implement the responsive detail sheet**

`components/discovery/DetailSheet.tsx` exports:

```ts
export type DetailSelection = {
  category: ContentCategory;
  item: ResultItem;
  origin: "deck" | "stored";
};

export type DetailSheetProps = {
  visible: boolean;
  selection: DetailSelection | null;
  detail: ContentDetail | null;
  loading: boolean;
  errorMessage: string | null;
  saved: boolean;
  palette: Palette;
  reducedMotion: boolean;
  onClose(): void;
  onRetry(): void;
  onSave(item: ResultItem): void;
  onSkip(item: ResultItem): void;
  onSimilar(item: ResultItem): void;
  onShare(item: ResultItem): void;
};
```

Keep React Native `Modal`, set `animationType="none"`, and animate the inner surface with the shared motion values so timing is controllable. On reduced motion, render immediately and use opacity only. The modal surface has `role="dialog"`, `aria-modal`, `accessibilityViewIsModal`, `accessibilityLabel="${title} details"`, `onAccessibilityEscape={onClose}`, and an explicit 44-by-44 Close button. Use `useWindowDimensions()`; phones anchor a near-full-screen sheet to the bottom, while widths at or above 760 center a surface no wider than 680.

Move the current category-specific detail rendering from `app/index.tsx:1180-1645` into a category switch over the `ContentDetail` discriminant. Preserve existing external links and Share behavior through callbacks, not imports. Replace truncated essential title/description text with wrapping text. Loading and detail failure remain inside the sheet with Retry.

For `origin: "deck"`, show Save, Not for me, and Similar. For `origin: "stored"`, preserve Saved/Recent semantics: show Save or Remove from saved, Similar, and Share, but omit Not for me because the stored item is not necessarily the active deck card.

- [ ] **Step 6: Run focused and full verification**

Run:

```bash
npm test -- --runTestsByPath lib/discovery/__tests__/loadDetail.test.ts components/discovery/__tests__/DetailSheet.test.tsx
npm test
npm run typecheck
```

Expected: all pass; no Similar API is invoked by opening the sheet.

- [ ] **Step 7: Commit the detail boundary**

```bash
git add lib/discovery/loadDetail.ts lib/discovery/__tests__/loadDetail.test.ts components/discovery/DetailSheet.tsx components/discovery/__tests__/DetailSheet.test.tsx
git commit -m "feat: add playful accessible detail sheet"
```

### Task 8: Add the Discovery Controller

**Files:**
- Create: `components/discovery/useDiscoveryController.ts`
- Create: `components/discovery/__tests__/useDiscoveryController.test.tsx`

**Interfaces:**
- Consumes: `discoveryDeckReducer`, request tracker, `loadDiscovery`, `addSaved`, and `removeSaved`.
- Produces: one route-facing controller whose commands are category scoped and whose async dependencies are injectable in tests.

- [ ] **Step 1: Write failing controller orchestration tests**

Create `components/discovery/__tests__/useDiscoveryController.test.tsx` with `renderHook` and injected dependencies. Cover these exact behaviors:

```tsx
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ResultItem } from "../../../types/content";
import { useDiscoveryController } from "../useDiscoveryController";

const movie: ResultItem = { id: "m1", title: "Arrival", subtitle: "2016", meta: "" };

it("ignores a completion after category selection invalidates it", async () => {
  let finish: (items: ResultItem[]) => void = () => undefined;
  const load = jest.fn(() => new Promise<ResultItem[]>((resolve) => { finish = resolve; }));
  const { result } = renderHook(() => useDiscoveryController({
    dependencies: {
      load,
      addSaved: jest.fn(async () => []),
      removeSaved: jest.fn(async () => []),
    },
  }));
  act(() => result.current.selectCategory("movies"));
  let pending!: Promise<void>;
  act(() => { pending = result.current.submit("randomize"); });
  act(() => result.current.selectCategory("books"));
  act(() => finish([movie]));
  await act(async () => pending);
  await waitFor(() => expect(result.current.state.selected).toBe("books"));
  expect(result.current.state.sessions.movies.deck.queue).toEqual([]);
});

it("advances immediately, completes Save, and restores on Undo", async () => {
  const addSaved = jest.fn(async () => [{
    ...movie,
    category: "movies" as const,
    savedAt: 1,
  }]);
  const removeSaved = jest.fn(async () => []);
  const { result } = renderHook(() => useDiscoveryController({
    initialItems: { movies: [movie] },
    dependencies: { load: jest.fn(), addSaved, removeSaved },
  }));
  act(() => result.current.selectCategory("movies"));
  await act(async () => { await result.current.commit(movie, "save"); });
  expect(result.current.activeItem).toBeNull();
  expect(result.current.state.lastSave?.item).toEqual(movie);
  await act(async () => { await result.current.undo(); });
  expect(removeSaved).toHaveBeenCalledWith("movies", movie.id);
  expect(result.current.activeItem).toEqual(movie);
});

it("never writes storage for Not for me", () => {
  const addSaved = jest.fn();
  const { result } = renderHook(() => useDiscoveryController({
    initialItems: { movies: [movie] },
    dependencies: { load: jest.fn(), addSaved, removeSaved: jest.fn() },
  }));
  act(() => result.current.selectCategory("movies"));
  act(() => { void result.current.commit(movie, "skip"); });
  expect(addSaved).not.toHaveBeenCalled();
});
```

Add a fourth test asserting `similar(movie)` sends a discriminated Similar request containing only category and seed, then a later `submit("randomize")` sends no seed, query, or filters. Add a fifth test in which `addSaved` resolves without the saved category/item key; assert the card is restored, `lastSave` stays null, and `actionError` is `Couldn't save that one. It's back in your deck.`

- [ ] **Step 2: Run the controller tests and verify the missing-module failure**

Run:

```bash
npm test -- --runTestsByPath components/discovery/__tests__/useDiscoveryController.test.tsx
```

Expected: FAIL because the hook does not exist.

- [ ] **Step 3: Implement the injectable controller contract**

Create `components/discovery/useDiscoveryController.ts` with these public types:

```ts
export type DiscoveryControllerDependencies = {
  load: typeof loadDiscovery;
  addSaved: typeof addSaved;
  removeSaved: typeof removeSaved;
};

export type UseDiscoveryControllerOptions = {
  initialItems?: Partial<Record<ContentCategory, ResultItem[]>>;
  dependencies?: DiscoveryControllerDependencies;
  onSavedItemsChange?(items: SavedItem[]): void;
};
```

The returned object contains `state`, `session`, `activeItem`, `announcement`, `selectCategory`, `setAction`, `setQuery`, `setOpenSection`, `toggleFilter`, `clearFilters`, `submit`, `retry`, `commit`, `similar`, `undo`, and `clearActionError`.

Use the existing monotonically increasing request tracker. Every `submit` builds an immutable request snapshot from the selected category session. Search includes only trimmed query, Filter includes only a cloned filter array, Randomize includes only category/mode, and Similar includes only category/mode/seed. Dispatch `requestStarted` before awaiting. Dispatch success or failure only when the tracker still recognizes the request. For diagnostics, log only `{category, mode, errorName}` where `errorName` is `error.name` or `"UnknownError"`; never log `error.message` or the raw response body. Dispatch only `toDiscoveryError(category)`.

`selectCategory` invalidates the tracker and clears only the departing category's pending request/loading metadata while retaining its completed queue. `commit(item, "skip")` dispatches `skipCurrent` and announces the next title. `commit(item, "save")` allocates a Save operation, dispatches `saveStarted` before awaiting, calls injected `addSaved`, and verifies the returned list contains the same category/item key before dispatching success and invoking `onSavedItemsChange`; a thrown write or missing confirmation dispatches safe rollback copy. A successful Save starts a 4,500ms timer that dispatches `clearUndo` only if the same operation is still latest. `undo` awaits `removeSaved` and verifies the returned list no longer contains the key; on confirmation it dispatches `undoSave` and updates saved items, while failure leaves the operation undoable and shows `Couldn't undo that save. Try again.`

Announcement copy is deterministic: successful Save uses `Saved ${item.title}. New card: ${nextTitle}.`, skip uses `Not for me. New card: ${nextTitle}.`, an exhausted deck replaces the second sentence with `That's the end of this deck.`, Undo uses `${item.title} returned to your deck.`, and accepted Similar results use `Showing picks similar to ${item.title}.`.

Clean up the Undo timer on unmount. Reducer item-ID validation remains the second guard after the deck's animation lock.

- [ ] **Step 4: Run focused tests, full tests, and typecheck**

Run:

```bash
npm test -- --runTestsByPath components/discovery/__tests__/useDiscoveryController.test.tsx
npm test
npm run typecheck
```

Expected: all pass; providers and storage are injected and therefore no live network or Supabase call occurs.

- [ ] **Step 5: Commit the side-effect controller**

```bash
git add components/discovery/useDiscoveryController.ts components/discovery/__tests__/useDiscoveryController.test.tsx
git commit -m "feat: coordinate discovery deck actions"
```

### Task 9: Integrate the New Discovery Controls and Deck into the Route

**Files:**
- Modify: `app/index.tsx`
- Modify: `lib/discovery/state.ts`
- Modify: `lib/discovery/__tests__/state.test.ts`
- Create: `app/__tests__/index.test.tsx`

**Interfaces:**
- Consumes: `useDiscoveryController`, `CategoryPicker`, `DiscoveryControls`, `SwipeDeck`, `DiscoveryStatusCard`, `UndoNotice`, `DiscoveryAnnouncer`, and `useReducedMotion`.
- Produces: a working deck-first home route while temporarily retaining the existing detail modal layout until Task 10; automatic Similar loading is removed in this task so the global explicit-Similar constraint is never violated.

- [ ] **Step 1: Write a failing home-flow integration test**

Create `app/__tests__/index.test.tsx`. Mock `listSaved`/`listRecents` to resolve empty arrays, mock the Supabase auth session/listener to return no session, and mock `loadDiscovery` to resolve this normalized movie:

```tsx
const arrival = {
  id: "329865",
  title: "Arrival",
  subtitle: "2016",
  meta: "★ 8.0",
};
```

Use these complete module mocks before importing `HomeScreen`:

```tsx
jest.mock("../../lib/storage/saved", () => ({
  listSaved: jest.fn(async () => []),
  addSaved: jest.fn(async (
    _category: unknown,
    item: { id: string; title: string; subtitle: string; meta: string; imageUrl?: string }
  ) => [{
    ...item,
    category: "movies",
    savedAt: 1,
  }]),
  removeSaved: jest.fn(async () => []),
  syncLocalToCloud: jest.fn(async () => undefined),
  clearLocalSaved: jest.fn(async () => undefined),
}));

jest.mock("../../lib/storage/recents", () => ({
  listRecents: jest.fn(async () => []),
  addRecent: jest.fn(async () => []),
}));

jest.mock("../../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      })),
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      updateUser: jest.fn(),
      signOut: jest.fn(),
    },
  },
}));

jest.mock("../../lib/auth/oauth", () => ({
  signInWithGoogle: jest.fn(),
}));

jest.mock("../../lib/discovery/loadDiscovery", () => {
  const actual = jest.requireActual("../../lib/discovery/loadDiscovery");
  return {
    ...actual,
    loadDiscovery: jest.fn(async () => [{
      id: "329865",
      title: "Arrival",
      subtitle: "2016",
      meta: "★ 8.0",
    }]),
  };
});
```

The test body is:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import HomeScreen from "../index";

it("moves from category selection to Surprise Me to one active deck card", async () => {
  render(<HomeScreen />);
  fireEvent.press(screen.getByRole("button", { name: "Movies" }));
  fireEvent.press(screen.getByRole("button", { name: "Surprise me with a movie" }));
  await waitFor(() => expect(screen.getByText("Arrival")).toBeTruthy());
  expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Not for me" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Find similar" })).toBeTruthy();
});
```

Keep mocks local to this test file. The Supabase listener mock returns `{data: {subscription: {unsubscribe: jest.fn()}}}`. Do not mock the controller or reducer.

- [ ] **Step 2: Run the integration test and verify the old UI failure**

Run:

```bash
npm test -- --runTestsByPath app/__tests__/index.test.tsx
```

Expected: FAIL because the current category and action controls lack the new accessible labels and the route renders a results grid rather than a deck.

- [ ] **Step 3: Replace the route's discovery state and provider orchestration**

In `app/index.tsx`, remove the old discovery `useReducer`, request tracker, `runAction`, API search/random/filter imports, and locally defined `ResultCard`, `ActionButton`, `ContentButton`, `FilterChip`, and `FilterSection`. Remove `MOCK_RESULTS`, `MOCK_DETAILS`, `CATEGORY_ICONS`, and the module-level `CARD_WIDTH`; the provider branches are exhaustive and those fallbacks are dead.

After saved-item state is initialized, mount the controller:

```ts
const discoveryController = useDiscoveryController({
  onSavedItemsChange: setSavedItems,
});
const {
  state: discovery,
  session,
  activeItem,
  announcement,
} = discoveryController;
const selected = discovery.selected;
const reducedMotion = useReducedMotion();
const [categoryPickerExpanded, setCategoryPickerExpanded] = useState(true);
```

Category selection uses this behavior:

```ts
const handleCategorySelect = (category: ContentCategory) => {
  if (!categoryPickerExpanded && category === selected) {
    setCategoryPickerExpanded(true);
    return;
  }
  discoveryController.selectCategory(category);
  setCategoryPickerExpanded(false);
  setDetailItem(null);
};
```

Opening a Saved or Recent item calls `selectCategory(category)` and opens that exact item, but does not insert it into or dismiss anything from the category deck.

- [ ] **Step 4: Replace category, mode, loading, error, and results JSX**

Inside the existing route `ScrollView`, render:

```tsx
<CategoryPicker
  selected={selected}
  compact={Boolean(selected) && !categoryPickerExpanded}
  palette={palette}
  onSelect={handleCategorySelect}
/>

{selected && session ? (
  <DiscoveryControls
    category={selected}
    activeAction={session.activeAction}
    query={session.searchQuery}
    filters={session.selectedFilters}
    openSection={session.openSection}
    loading={session.status === "loading"}
    palette={palette}
    onActionChange={discoveryController.setAction}
    onQueryChange={discoveryController.setQuery}
    onToggleFilter={discoveryController.toggleFilter}
    onOpenSection={discoveryController.setOpenSection}
    onClearFilters={discoveryController.clearFilters}
    onSubmit={discoveryController.submit}
  />
) : null}
```

When `session.deck.similarContext` exists, show a text badge `Similar to ${sourceTitle}` plus a 44-point `Back to unbiased Surprise Me` button that calls `submit("randomize")`.

If status is loading, render a loading `DiscoveryStatusCard`; keep the current queue mounted if one exists. If status is error, render the safe error and bind Retry to `discoveryController.retry`; also keep an existing queue mounted. If status is empty and there is no active item, provide `Shuffle again` for Randomize/Similar or `Adjust search or filters` for Search/Filter.

Render the deck and feedback:

```tsx
{selected && session.deck.queue.length > 0 ? (
  <SwipeDeck
    category={selected}
    items={session.deck.queue}
    palette={palette}
    reducedMotion={reducedMotion}
    disabled={session.status === "loading"}
    onCommit={(item, decision) => void discoveryController.commit(item, decision)}
    onOpenDetail={setDetailItem}
    onSimilar={(item) => void discoveryController.similar(item)}
  />
) : null}

<UndoNotice
  message={
    discovery.actionError ??
    (discovery.lastSave ? `Saved ${discovery.lastSave.item.title}` : null)
  }
  canUndo={Boolean(discovery.lastSave)}
  palette={palette}
  onUndo={() => void discoveryController.undo()}
/>
<DiscoveryAnnouncer message={announcement} />
```

Keep the existing header, Saved, How to Use, Account, auth, theme, and detail modal layout at this checkpoint. Remove the detail effect's `getSimilar*` branch and the Similar carousel so opening a detail cannot perform a related-content request; the explicit detail-sheet Similar action arrives in Task 10. Recents remain backed by `lib/storage/recents.ts`, but render them only while the expanded category chooser is visible and no active category deck/request is present; they must not appear between discovery controls and an active deck.

- [ ] **Step 5: Retire the old reducer through a compatibility export**

Replace `lib/discovery/state.ts` with:

```ts
export * from "./types";
export * from "./deckState";
```

Rewrite `lib/discovery/__tests__/state.test.ts` to import from `../state` and assert that `createInitialDiscoveryDeckState`, `discoveryDeckReducer`, and `activeDeckItem` are available through that stable path. The behavioral coverage remains in `deckState.test.ts`.

- [ ] **Step 6: Remove only obsolete discovery styles**

Delete the old content-selector, action-selector, search/filter/randomize, results-grid, and result-card style keys from `makeStyles`. Keep modal styles that are still used by Saved, Account, How to Use, or the old detail modal. Use TypeScript and `rg "styles\\.<name>" app/index.tsx` before removing each shared style key.

- [ ] **Step 7: Run route, reducer, full, and type verification**

Run:

```bash
npm test -- --runTestsByPath app/__tests__/index.test.tsx lib/discovery/__tests__/state.test.ts lib/discovery/__tests__/deckState.test.ts
npm test
npm run typecheck
```

Expected: all pass; selecting a category and Surprise Me renders one active card and three labeled actions.

- [ ] **Step 8: Commit the deck-first route**

```bash
git add app/index.tsx app/__tests__/index.test.tsx lib/discovery/state.ts lib/discovery/__tests__/state.test.ts
git commit -m "feat: make discovery deck the primary experience"
```

### Task 10: Replace the Old Detail Modal and Make Similar Explicit

**Files:**
- Modify: `app/index.tsx`
- Modify: `app/__tests__/index.test.tsx`
- Modify: `components/discovery/SwipeDeck.tsx`
- Modify: `components/discovery/__tests__/SwipeDeck.test.tsx`

**Interfaces:**
- Consumes: `loadDetail`, `DetailSheet`, and controller deck actions.
- Produces: category-plus-item detail identity, cancellation-safe loading, no automatic Similar request, and deterministic focus restoration.

- [ ] **Step 1: Add a failing explicit-Similar integration test**

Extend `app/__tests__/index.test.tsx`. Mock `loadDetail` to return a tagged movie detail and keep `loadDiscovery` as a Jest mock. Run the initial category/Surprise flow, press the accessible card labeled with Arrival, and assert `loadDiscovery` has still been called only for Randomize. Then press `Find similar` inside the sheet and assert the next request has mode `similar` with Arrival as its seed. Also assert the raw provider's `getSimilarMovies` function is never imported or called by detail loading.

- [ ] **Step 2: Run the integration test and verify the old modal lacks explicit Similar**

Run:

```bash
npm test -- --runTestsByPath app/__tests__/index.test.tsx
```

Expected: FAIL because Task 9 removed automatic Similar loading, but the retained old modal does not yet expose the explicit `Find similar` action or category-tagged detail state required by this task.

- [ ] **Step 3: Give the deck an imperative active-card focus handle**

Convert `SwipeDeck` to `forwardRef` and export:

```ts
export type SwipeDeckHandle = {
  focusActiveCard(): void;
};
```

Keep a `DiscoveryCardHandle` ref for the active card and expose `focusActiveCard()` through `useImperativeHandle`. Extend `SwipeDeck.test.tsx` to call the handle and assert the active card's focus method is invoked. This handle is used after detail closure; if Save or Not for me consumed the original card, it focuses the newly active card.

- [ ] **Step 4: Replace four detail states with one category-tagged state**

In `app/index.tsx`, replace `detailItem`, four category detail slots, `similarItems`, `detailError`, and the old detail effect with:

```ts
const [detailSelection, setDetailSelection] = useState<DetailSelection | null>(null);
const [detail, setDetail] = useState<ContentDetail | null>(null);
const [detailLoading, setDetailLoading] = useState(false);
const [detailErrorMessage, setDetailErrorMessage] = useState<string | null>(null);
const [detailRetryKey, setDetailRetryKey] = useState(0);
const deckRef = useRef<SwipeDeckHandle>(null);
```

An effect keyed by category, item ID, and `detailRetryKey` increments a local request sequence, clears previous detail, sets loading, calls `loadDetail(category, item)`, and accepts completion only if the same sequence and selection remain active. On failure, log only category, item ID, and error name—never the error message or response body—and set only `toDetailError()`. Cleanup invalidates the sequence. The existing recents effect records `detailSelection.category` and `detailSelection.item` once when a detail opens.

- [ ] **Step 5: Render `DetailSheet` and wire origin-safe actions**

Opening the active card sets `{category: selected, item, origin: "deck"}`. Opening Saved or Recent sets `{category, item, origin: "stored"}`.

Replace the entire old detail modal JSX with `DetailSheet`. For a deck-origin Save or Not for me, close the sheet, call the matching controller action once, then focus the newly active card. Similar closes the sheet and calls `controller.similar(item)`. For a stored-origin item, Save toggles through existing `addSaved`/`removeSaved`, Similar starts the temporary category deck, and no skip callback mutates the deck. Share keeps the existing category-aware source URL behavior.

On ordinary close, clear selection/detail/error and call `deckRef.current?.focusActiveCard()` for a deck origin after the modal dismissal. RN Web's Modal retains its built-in focus trap and Escape handling; the explicit close callback ensures native and web share the same state cleanup.

- [ ] **Step 6: Delete automatic Similar and obsolete detail code**

Confirm `app/index.tsx` has no `getSimilar*` imports, `similarItems` state, automatic Similar promises, or Similar carousel JSX/styles after Task 9. Remove the four separate detail states and the old detail modal styles no longer shared by other overlays. Do not remove `modalOverlay`, `modalContent`, or `modalClose` until `rg` confirms Saved, Account, and How to Use no longer use them.

- [ ] **Step 7: Run detail, route, full, and type verification**

Run:

```bash
npm test -- --runTestsByPath lib/discovery/__tests__/loadDetail.test.ts components/discovery/__tests__/DetailSheet.test.tsx components/discovery/__tests__/SwipeDeck.test.tsx app/__tests__/index.test.tsx
npm test
npm run typecheck
```

Expected: all pass; opening details makes one detail request and zero Similar requests.

- [ ] **Step 8: Commit explicit detail behavior**

```bash
git add app/index.tsx app/__tests__/index.test.tsx components/discovery/SwipeDeck.tsx components/discovery/__tests__/SwipeDeck.test.tsx
git commit -m "feat: make detail actions explicit and playful"
```

### Task 11: Complete Accessibility, Copy, Cleanup, and Cross-Platform Verification

**Files:**
- Modify: `app/index.tsx`
- Modify: `app/__tests__/index.test.tsx`
- Modify: `components/discovery/*.tsx` only where audit failures identify a concrete gap
- Modify: `README.md`
- Modify: `app/+html.tsx` only if browser focus verification identifies a suppressed focus indicator

**Interfaces:**
- Consumes: the completed deck-first route.
- Produces: the verified iOS/Android/web experience and final usage documentation.

- [ ] **Step 1: Add failing accessibility and safe-error assertions**

Extend `app/__tests__/index.test.tsx` to assert:

- Account, Saved, and How to Use header buttons have explicit accessible names and at least 44-point style dimensions.
- A rejected `loadDiscovery` with `new Error('Discogs 401: Invalid consumer token')` renders `Couldn't load albums. Check your connection and try again.` and does not render `Discogs`, `401`, or `token`.
- The three deck actions remain present when gesture input is unavailable.
- A Similar context renders both `Similar to <title>` and `Back to unbiased Surprise Me`.
- The detail Close control has a 44-by-44 target and responds to accessibility escape.

Run the test and confirm at least the current 34-by-34 detail/header controls fail the target-size assertions before changing them.

- [ ] **Step 2: Audit every interactive control in the touched flow**

Use:

```bash
rg -n "<Pressable|<TextInput|accessibilityRole|accessibilityLabel|accessibilityState|onAccessibilityEscape" app/index.tsx components/discovery
```

For every touched `Pressable`, add a role, name, state where relevant, and a minimum 44-point native target. Add `hitSlop` only as extra forgiveness, not as the sole target-size fix. Header labels are `Open account`, `Open saved discoveries`, and `How to use GoDiscover`. Hide decorative shapes and duplicate icon text from the accessibility tree.

- [ ] **Step 3: Update How to Use and user-facing copy**

Replace the old instructions with these four steps:

1. `Choose your category` — Movies, Books, Artists, or Albums each has its own vibe.
2. `Let it surprise you` — Surprise Me stays random; Search and Filter are optional.
3. `Make your move` — Swipe right to Save or left for Not for me. The labeled buttons do the same thing.
4. `Follow a spark` — Similar makes a temporary related deck only when you ask for it.

Add a footer: `Your saves and skips never train Surprise Me.` Ensure apostrophes and punctuation are consistent across native and web.

- [ ] **Step 4: Remove dead code and confirm focused file boundaries**

Run `npm run typecheck`, then remove only imports, functions, state, and style keys reported as unused or confirmed with `rg`. Specifically confirm that `Dimensions`, `POPULARITY_FILTERS`, old result-grid styles, mock data, Similar carousel styles, and old detail state are gone. Keep auth, Saved, Recents, sharing, theme mode, and provider clients intact.

Add a short architecture note to `README.md` describing `lib/discovery` as pure request/state logic, `components/discovery/useDiscoveryController.ts` as the side-effect boundary, and `components/discovery` as the presentation layer. Document Save/right, Not for me/left, explicit Similar, button parity, and reduced-motion behavior.

- [ ] **Step 5: Run all automated verification**

Run:

```bash
npm test
npm run typecheck
npx expo export --platform all --output-dir /tmp/godiscover-deck-export
```

Expected: every Jest suite passes, TypeScript exits 0, and Expo produces iOS, Android, and web bundles without SSR or platform-import errors.

- [ ] **Step 6: Perform the iOS and Android smoke checks**

On iOS, verify category selection, Search, Filter, Surprise Me, below-threshold drag, Save/right, Not for me/left, Similar, details, Save rollback simulation, Undo, Saved, Recents, dark/light theme, larger text, VoiceOver labels, and Reduce Motion. Repeat the critical category/deck/detail/Undo paths on Android with TalkBack and Remove animations enabled.

Expected: no clipped essential text, no gesture-only action, no cross-category card/error, no repeated card commit, and no raw API message.

- [ ] **Step 7: Perform the responsive web smoke check**

Start:

```bash
npm run web -- --port 8081
```

Use the browser at phone and desktop widths. Verify two/four-column category layout, bounded 440-point deck, mouse drag, Tab order, visible focus, Enter/Space actions, Escape detail dismissal, focus restoration, browser text zoom, reduced-motion media preference, and no console/page errors. If focus is suppressed by root CSS, add a `:focus-visible` rule in `app/+html.tsx` using `palette.focus`-equivalent purple and rerun the browser check; otherwise leave `app/+html.tsx` unchanged.

- [ ] **Step 8: Commit final accessibility and documentation polish**

Stage only files changed by this task:

```bash
git add app/index.tsx app/__tests__/index.test.tsx components/discovery README.md
git diff --cached --check
git commit -m "feat: finish accessible playful discovery experience"
```

- [ ] **Step 9: Confirm the final repository state**

Run:

```bash
git status --short
git log -12 --oneline
```

Expected: the feature files are committed. The pre-existing untracked Discogs recovery plan may still appear and must not be included in these commits.
