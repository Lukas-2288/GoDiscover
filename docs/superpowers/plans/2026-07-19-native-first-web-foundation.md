# Native-First Web Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve GoDiscover's iOS and Android behavior while making static web rendering safe, restoring strict TypeScript compilation, and preventing category changes or stale discovery requests from corrupting UI state.

**Architecture:** Introduce a pure runtime-to-auth-options boundary so Supabase uses persistent AsyncStorage on native/hydrated web and stateless storage during web SSR. Move discovery-session fields into a pure reducer and guard asynchronous completions with a request tracker; `HomeScreen` remains the orchestrator but delegates state invariants to tested modules.

**Tech Stack:** Expo 54, Expo Router 6 static web output, React Native 0.81, React 19, TypeScript 5.9, Supabase JS 2.103, AsyncStorage 2.2, Jest 29 with `jest-expo` 54.

## Global Constraints

- Keep one Expo application with iOS and Android as the primary platforms and web as a supported public platform.
- Keep persistent AsyncStorage-backed Supabase sessions on iOS, Android, and hydrated web.
- Never access browser-only globals during Expo Router server rendering.
- Keep the existing Supabase credentials, PKCE flow, provider clients, saved-item schema, and visual design unchanged.
- Do not add provider-level `AbortController` support, restructure navigation, split the full `HomeScreen`, change filter semantics, or perform unrelated documentation/security cleanup.
- Every behavior change follows red-green-refactor: observe the relevant test fail before production implementation, then run the targeted and full checks.

---

### Task 1: Establish the Test and Typecheck Baseline

**Files:**
- Create: `jest.config.js`
- Modify: `package.json:5-10,36-40`
- Modify: `package-lock.json`
- Modify: `components/EditScreenInfo.tsx:40`

**Interfaces:**
- Consumes: Expo SDK 54's locally mapped `jest-expo@~54.0.17` compatibility version.
- Produces: `npm test` and `npm run typecheck` quality commands used by every later task.

- [ ] **Step 1: Reproduce the strict TypeScript failure**

Run:

```bash
npx tsc --noEmit
```

Expected: exit 2 with `TS2339: Property 'tint' does not exist` at `components/EditScreenInfo.tsx:40`.

- [ ] **Step 2: Install the Expo-compatible Jest toolchain**

Run:

```bash
npm install --save-dev jest@^29.7.0 @types/jest@^29.5.14 jest-expo@~54.0.17
```

Expected: `package.json` and `package-lock.json` add the three development dependencies without changing runtime dependency versions.

- [ ] **Step 3: Add deterministic package scripts**

Add these entries to `package.json`'s `scripts` object after `web`:

```json
"test": "jest --runInBand",
"typecheck": "tsc --noEmit"
```

- [ ] **Step 4: Add the Jest configuration**

Create `jest.config.js`:

```js
module.exports = {
  preset: "jest-expo",
  testMatch: [
    "<rootDir>/**/__tests__/**/*.test.ts",
    "<rootDir>/**/__tests__/**/*.test.tsx",
  ],
  testPathIgnorePatterns: ["/node_modules/"],
};
```

The nonstandard legacy file `components/__tests__/StyledText-test.js` remains untouched and outside this focused suite.

- [ ] **Step 5: Apply the minimal TypeScript repair**

Change the link color in `components/EditScreenInfo.tsx`:

```tsx
<Text style={styles.helpLinkText} lightColor={Colors.light.accent}>
```

- [ ] **Step 6: Verify the baseline**

Run:

```bash
npm run typecheck
npm test -- --passWithNoTests
```

Expected: typecheck exits 0; Jest exits 0 and reports no matching tests yet.

- [ ] **Step 7: Commit the baseline**

```bash
git add package.json package-lock.json jest.config.js components/EditScreenInfo.tsx
git commit -m "test: establish Expo quality baseline"
```

---

### Task 2: Make Supabase Auth Initialization SSR-Safe

**Files:**
- Create: `lib/auth/__tests__/storage.test.ts`
- Create: `lib/auth/storage.ts`
- Modify: `lib/supabase.ts:1-19`

**Interfaces:**
- Consumes: an AsyncStorage-compatible object with `getItem`, `setItem`, and `removeItem`.
- Produces: `AuthStorage`, `AuthRuntimeFacts`, `serverAuthStorage`, `isWebServerRuntime(runtime)`, and `createSupabaseAuthOptions(runtime, persistentStorage)`.

- [ ] **Step 1: Write the failing auth-storage tests**

Create `lib/auth/__tests__/storage.test.ts`:

```ts
import {
  createSupabaseAuthOptions,
  serverAuthStorage,
  type AuthStorage,
} from "../storage";

function createPersistentStorage(): AuthStorage {
  return {
    getItem: jest.fn(async () => "persisted-session"),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  };
}

describe("createSupabaseAuthOptions", () => {
  it("uses stateless storage and disables persistence during web SSR", async () => {
    const persistentStorage = createPersistentStorage();

    const options = createSupabaseAuthOptions(
      { platform: "web", hasWindow: false },
      persistentStorage
    );

    expect(options.storage).toBe(serverAuthStorage);
    expect(options.persistSession).toBe(false);
    expect(options.autoRefreshToken).toBe(false);
    await expect(options.storage.getItem("session")).resolves.toBeNull();
    await expect(options.storage.setItem("session", "secret")).resolves.toBeUndefined();
    await expect(options.storage.removeItem("session")).resolves.toBeUndefined();
    expect(persistentStorage.getItem).not.toHaveBeenCalled();
  });

  it.each([
    ["ios", false],
    ["android", false],
    ["web", true],
  ])("uses persistent storage on %s when hasWindow=%s", (platform, hasWindow) => {
    const persistentStorage = createPersistentStorage();

    const options = createSupabaseAuthOptions(
      { platform, hasWindow },
      persistentStorage
    );

    expect(options.storage).toBe(persistentStorage);
    expect(options.persistSession).toBe(true);
    expect(options.autoRefreshToken).toBe(true);
    expect(options.detectSessionInUrl).toBe(false);
    expect(options.flowType).toBe("pkce");
  });
});
```

- [ ] **Step 2: Run the auth tests and observe RED**

Run:

```bash
npm test -- lib/auth/__tests__/storage.test.ts
```

Expected: FAIL because `../storage` does not exist.

- [ ] **Step 3: Implement the pure storage/options boundary**

Create `lib/auth/storage.ts`:

```ts
export type AuthStorage = {
  getItem: (key: string) => string | null | Promise<string | null>;
  setItem: (key: string, value: string) => void | Promise<void>;
  removeItem: (key: string) => void | Promise<void>;
};

export type AuthRuntimeFacts = {
  platform: string;
  hasWindow: boolean;
};

export type SupabaseAuthOptions = {
  storage: AuthStorage;
  autoRefreshToken: boolean;
  persistSession: boolean;
  detectSessionInUrl: false;
  flowType: "pkce";
};

export const serverAuthStorage: AuthStorage = {
  async getItem() {
    return null;
  },
  async setItem() {},
  async removeItem() {},
};

export function isWebServerRuntime(runtime: AuthRuntimeFacts): boolean {
  return runtime.platform === "web" && !runtime.hasWindow;
}

export function createSupabaseAuthOptions(
  runtime: AuthRuntimeFacts,
  persistentStorage: AuthStorage
): SupabaseAuthOptions {
  const isWebServer = isWebServerRuntime(runtime);

  return {
    storage: isWebServer ? serverAuthStorage : persistentStorage,
    autoRefreshToken: !isWebServer,
    persistSession: !isWebServer,
    detectSessionInUrl: false,
    flowType: "pkce",
  };
}
```

- [ ] **Step 4: Verify the auth boundary is GREEN**

Run:

```bash
npm test -- lib/auth/__tests__/storage.test.ts
```

Expected: both auth-storage behaviors pass.

- [ ] **Step 5: Reproduce the web export failure before integration**

Run:

```bash
npx expo export --platform web --output-dir /private/tmp/godiscover-web-red-eafaeb5
```

Expected: exit 7 with `ReferenceError: window is not defined` from AsyncStorage during Supabase Auth initialization.

- [ ] **Step 6: Integrate the runtime-safe options into Supabase**

Replace `lib/supabase.ts` with:

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
import { createSupabaseAuthOptions } from "./auth/storage";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Supabase env vars are not set");
}

const auth = createSupabaseAuthOptions(
  {
    platform: Platform.OS,
    hasWindow: typeof window !== "undefined",
  },
  AsyncStorage
);

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth,
});
```

- [ ] **Step 7: Verify tests, types, and static web rendering**

Run:

```bash
npm test -- lib/auth/__tests__/storage.test.ts
npm run typecheck
npx expo export --platform web --output-dir /private/tmp/godiscover-web-green-eafaeb5
```

Expected: all commands exit 0; the web export contains `index.html` and no `window is not defined` stack.

- [ ] **Step 8: Commit the SSR-safe initialization**

```bash
git add lib/auth/storage.ts lib/auth/__tests__/storage.test.ts lib/supabase.ts
git commit -m "fix: make Supabase auth initialization SSR-safe"
```

---

### Task 3: Add the Discovery Reducer

**Files:**
- Create: `lib/discovery/__tests__/state.test.ts`
- Create: `lib/discovery/state.ts`

**Interfaces:**
- Consumes: `ContentCategory` and `ResultItem` from `types/content.ts`.
- Produces: `DiscoveryActionMode`, `DiscoveryRequestIdentity`, `DiscoveryResults`, `DiscoveryState`, `initialDiscoveryState`, `DiscoveryStateAction`, and `discoveryReducer(state, action)`.

- [ ] **Step 1: Write the failing reducer tests**

Create `lib/discovery/__tests__/state.test.ts`:

```ts
import type { ResultItem } from "../../../types/content";
import {
  discoveryReducer,
  initialDiscoveryState,
  type DiscoveryState,
} from "../state";

const movie: ResultItem = {
  id: "movie-1",
  title: "Movie One",
  subtitle: "2026",
  meta: "★ 8.0",
};

function populatedState(): DiscoveryState {
  return {
    selected: "movies",
    activeAction: "search",
    searchQuery: "space",
    openSection: "genre",
    selectedFilters: ["Sci-Fi", "20s"],
    results: { category: "movies", items: [movie] },
    loading: true,
    requestError: "old error",
    activeRequest: { id: 4, category: "movies" },
  };
}

describe("discoveryReducer", () => {
  it("atomically clears category-owned state when the category changes", () => {
    const next = discoveryReducer(populatedState(), {
      type: "selectCategory",
      category: "books",
    });

    expect(next).toEqual({
      ...initialDiscoveryState,
      selected: "books",
    });
  });

  it("accepts results from the active request", () => {
    const started = discoveryReducer(
      { ...initialDiscoveryState, selected: "movies" },
      { type: "requestStarted", request: { id: 1, category: "movies" } }
    );

    const completed = discoveryReducer(started, {
      type: "requestSucceeded",
      request: { id: 1, category: "movies" },
      items: [movie],
    });

    expect(completed.loading).toBe(false);
    expect(completed.activeRequest).toBeNull();
    expect(completed.results).toEqual({ category: "movies", items: [movie] });
  });

  it("ignores a success from an invalidated request", () => {
    const current = {
      ...populatedState(),
      activeRequest: { id: 5, category: "movies" as const },
    };

    const next = discoveryReducer(current, {
      type: "requestSucceeded",
      request: { id: 4, category: "movies" },
      items: [movie],
    });

    expect(next).toBe(current);
  });

  it("ignores a stale failure without disturbing a newer request", () => {
    const current = {
      ...populatedState(),
      requestError: null,
      activeRequest: { id: 6, category: "books" as const },
    };

    const next = discoveryReducer(current, {
      type: "requestFailed",
      request: { id: 5, category: "movies" },
      message: "stale failure",
    });

    expect(next).toBe(current);
    expect(next.loading).toBe(true);
    expect(next.requestError).toBeNull();
  });

  it("clears results without changing the selected category", () => {
    const next = discoveryReducer(populatedState(), { type: "clearResults" });

    expect(next.selected).toBe("movies");
    expect(next.results).toBeNull();
  });
});
```

- [ ] **Step 2: Run the reducer tests and observe RED**

Run:

```bash
npm test -- lib/discovery/__tests__/state.test.ts
```

Expected: FAIL because `../state` does not exist.

- [ ] **Step 3: Implement the reducer**

Create `lib/discovery/state.ts`:

```ts
import type { ContentCategory, ResultItem } from "../../types/content";

export type DiscoveryActionMode = "search" | "filter" | "randomize";

export type DiscoveryRequestIdentity = {
  id: number;
  category: ContentCategory;
};

export type DiscoveryResults = {
  category: ContentCategory;
  items: ResultItem[];
};

export type DiscoveryState = {
  selected: ContentCategory | null;
  activeAction: DiscoveryActionMode | null;
  searchQuery: string;
  openSection: string | null;
  selectedFilters: string[];
  results: DiscoveryResults | null;
  loading: boolean;
  requestError: string | null;
  activeRequest: DiscoveryRequestIdentity | null;
};

export const initialDiscoveryState: DiscoveryState = {
  selected: null,
  activeAction: null,
  searchQuery: "",
  openSection: null,
  selectedFilters: [],
  results: null,
  loading: false,
  requestError: null,
  activeRequest: null,
};

export type DiscoveryStateAction =
  | { type: "selectCategory"; category: ContentCategory }
  | { type: "setActiveAction"; action: DiscoveryActionMode }
  | { type: "setSearchQuery"; query: string }
  | { type: "setOpenSection"; section: string | null }
  | { type: "toggleFilter"; value: string }
  | { type: "clearFilters" }
  | { type: "clearResults" }
  | { type: "requestStarted"; request: DiscoveryRequestIdentity }
  | {
      type: "requestSucceeded";
      request: DiscoveryRequestIdentity;
      items: ResultItem[];
    }
  | {
      type: "requestFailed";
      request: DiscoveryRequestIdentity;
      message: string;
    };

function isActiveRequest(
  state: DiscoveryState,
  request: DiscoveryRequestIdentity
): boolean {
  return (
    state.activeRequest?.id === request.id &&
    state.activeRequest.category === request.category
  );
}

export function discoveryReducer(
  state: DiscoveryState,
  action: DiscoveryStateAction
): DiscoveryState {
  switch (action.type) {
    case "selectCategory":
      return { ...initialDiscoveryState, selected: action.category };
    case "setActiveAction":
      return { ...state, activeAction: action.action };
    case "setSearchQuery":
      return { ...state, searchQuery: action.query };
    case "setOpenSection":
      return { ...state, openSection: action.section };
    case "toggleFilter":
      return {
        ...state,
        selectedFilters: state.selectedFilters.includes(action.value)
          ? state.selectedFilters.filter((filter) => filter !== action.value)
          : [...state.selectedFilters, action.value],
      };
    case "clearFilters":
      return { ...state, selectedFilters: [] };
    case "clearResults":
      return { ...state, results: null };
    case "requestStarted":
      return {
        ...state,
        loading: true,
        requestError: null,
        activeRequest: action.request,
      };
    case "requestSucceeded":
      if (!isActiveRequest(state, action.request)) return state;
      return {
        ...state,
        results: { category: action.request.category, items: action.items },
        loading: false,
        requestError: null,
        activeRequest: null,
      };
    case "requestFailed":
      if (!isActiveRequest(state, action.request)) return state;
      return {
        ...state,
        results: null,
        loading: false,
        requestError: action.message,
        activeRequest: null,
      };
  }
}
```

- [ ] **Step 4: Verify the reducer is GREEN**

Run:

```bash
npm test -- lib/discovery/__tests__/state.test.ts
npm run typecheck
```

Expected: all five reducer tests pass and TypeScript exits 0.

- [ ] **Step 5: Commit the reducer**

```bash
git add lib/discovery/state.ts lib/discovery/__tests__/state.test.ts
git commit -m "feat: add isolated discovery state"
```

---

### Task 4: Add the Discovery Request Tracker

**Files:**
- Create: `lib/discovery/__tests__/requestTracker.test.ts`
- Create: `lib/discovery/requestTracker.ts`

**Interfaces:**
- Consumes: `ContentCategory` and `DiscoveryRequestIdentity`.
- Produces: `DiscoveryRequestTracker` and `createDiscoveryRequestTracker()` with `start(category)`, `invalidate()`, and `isCurrent(request)`.

- [ ] **Step 1: Write the failing request-tracker tests**

Create `lib/discovery/__tests__/requestTracker.test.ts`:

```ts
import { createDiscoveryRequestTracker } from "../requestTracker";

describe("createDiscoveryRequestTracker", () => {
  it("recognizes only its current request", () => {
    const tracker = createDiscoveryRequestTracker();
    const first = tracker.start("movies");
    const second = tracker.start("books");

    expect(tracker.isCurrent(first)).toBe(false);
    expect(tracker.isCurrent(second)).toBe(true);
    expect(
      tracker.isCurrent({ id: second.id, category: "movies" })
    ).toBe(false);
  });

  it("invalidates an in-flight request", () => {
    const tracker = createDiscoveryRequestTracker();
    const request = tracker.start("albums");

    tracker.invalidate();

    expect(tracker.isCurrent(request)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tracker tests and observe RED**

Run:

```bash
npm test -- lib/discovery/__tests__/requestTracker.test.ts
```

Expected: FAIL because `../requestTracker` does not exist.

- [ ] **Step 3: Implement the request tracker**

Create `lib/discovery/requestTracker.ts`:

```ts
import type { ContentCategory } from "../../types/content";
import type { DiscoveryRequestIdentity } from "./state";

export type DiscoveryRequestTracker = {
  start: (category: ContentCategory) => DiscoveryRequestIdentity;
  invalidate: () => void;
  isCurrent: (request: DiscoveryRequestIdentity) => boolean;
};

export function createDiscoveryRequestTracker(): DiscoveryRequestTracker {
  let sequence = 0;
  let current: DiscoveryRequestIdentity | null = null;

  return {
    start(category) {
      current = { id: ++sequence, category };
      return current;
    },
    invalidate() {
      sequence += 1;
      current = null;
    },
    isCurrent(request) {
      return current?.id === request.id && current.category === request.category;
    },
  };
}
```

- [ ] **Step 4: Verify the tracker is GREEN**

Run:

```bash
npm test -- lib/discovery/__tests__/requestTracker.test.ts
npm run typecheck
```

Expected: both tracker tests pass and TypeScript exits 0.

- [ ] **Step 5: Commit the tracker**

```bash
git add lib/discovery/requestTracker.ts lib/discovery/__tests__/requestTracker.test.ts
git commit -m "feat: add discovery request tracking"
```

---

### Task 5: Integrate Isolated Discovery State into HomeScreen

**Files:**
- Temporarily create: `scripts/.codex_web_smoke.py`
- Modify: `app/index.tsx:5,58-65,381-416,598-784,829-1124,889-899,1719-1745`

**Interfaces:**
- Consumes: `discoveryReducer`, `initialDiscoveryState`, `DiscoveryActionMode`, and `createDiscoveryRequestTracker` from Tasks 3-4.
- Produces: atomic category selection, category-tagged results, and stale-response/error rejection in the real screen.

- [ ] **Step 1: Write the failing browser regression test**

Create `scripts/.codex_web_smoke.py`:

```python
import json

from playwright.sync_api import sync_playwright


MOVIES = {
    "page": 1,
    "total_pages": 1,
    "results": [
        {
            "id": index,
            "title": title,
            "overview": f"Overview for {title}",
            "release_date": "2026-01-01",
            "vote_average": 8.0,
            "poster_path": None,
            "backdrop_path": None,
            "original_language": "en",
        }
        for index, title in enumerate(
            ["Web One", "Web Two", "Web Three", "Web Four", "Web Five"],
            start=1,
        )
    ],
}


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 390, "height": 844})
    page_errors = []
    failed_local_requests = []
    page.on("pageerror", lambda error: page_errors.append(str(error)))
    page.on(
        "requestfailed",
        lambda request: failed_local_requests.append(request.url)
        if request.url.startswith("http://127.0.0.1:8081")
        else None,
    )
    page.route(
        "https://api.themoviedb.org/**",
        lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps(MOVIES),
        ),
    )

    page.goto("http://127.0.0.1:8081", wait_until="networkidle", timeout=120_000)
    page.get_by_text("GoDiscover", exact=True).wait_for(timeout=30_000)
    page.get_by_text("🎬 Movies", exact=True).click()
    page.get_by_text("Now choose Search, Filter, or Randomize", exact=True).wait_for()
    page.get_by_text("Search", exact=True).click()
    page.locator("textarea").fill("web test")
    page.get_by_text("Find movies", exact=True).click()
    page.get_by_text("Web One", exact=True).wait_for(timeout=30_000)
    page.get_by_text("📚 Books", exact=True).click()
    page.get_by_text("Now choose Search, Filter, or Randomize", exact=True).wait_for()
    assert page.get_by_text("Web One", exact=True).count() == 0
    page.screenshot(path="/private/tmp/godiscover-web-mobile-final.png", full_page=True)

    assert page_errors == [], page_errors
    assert failed_local_requests == [], failed_local_requests
    browser.close()
```

- [ ] **Step 2: Run the browser regression test and observe RED**

Run outside the port-restricted sandbox:

```bash
python3 /Users/lukassagmani/.codex/plugins/cache/anthropic-agent-skills/example-skills/local/skills/webapp-testing/scripts/with_server.py --server "env CI=1 npm run web -- --port 8081" --port 8081 --timeout 120 -- python3 scripts/.codex_web_smoke.py
```

Expected: FAIL after selecting Books because the old category handlers leave `activeAction` and movie results in place, so the clean category prompt never appears.

- [ ] **Step 3: Replace independent discovery state with the reducer**

Extend the React import:

```ts
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
```

Add imports:

```ts
import {
  discoveryReducer,
  initialDiscoveryState,
  type DiscoveryActionMode,
} from "../lib/discovery/state";
import { createDiscoveryRequestTracker } from "../lib/discovery/requestTracker";
```

Replace the seven independent discovery declarations at the start of `HomeScreen` with:

```ts
const [discovery, dispatchDiscovery] = useReducer(
  discoveryReducer,
  initialDiscoveryState
);
const requestTrackerRef = useRef(createDiscoveryRequestTracker());
const {
  selected,
  activeAction,
  searchQuery,
  openSection,
  selectedFilters,
  loading,
} = discovery;
const results =
  discovery.results?.category === selected ? discovery.results.items : null;
```

Keep `detailItem` and all category-specific detail/modal/auth/theme state as independent state.

- [ ] **Step 4: Add atomic category and stored-item transitions**

Place these helpers before `runAction`:

```ts
const handleCategorySelect = (category: ContentCategory) => {
  requestTrackerRef.current.invalidate();
  dispatchDiscovery({ type: "selectCategory", category });
  setDetailItem(null);
};

const openStoredItem = (category: ContentCategory, item: ResultItem) => {
  requestTrackerRef.current.invalidate();
  dispatchDiscovery({ type: "selectCategory", category });
  setDetailItem(item);
};
```

Use `handleCategorySelect("artists")`, `handleCategorySelect("albums")`, `handleCategorySelect("books")`, and `handleCategorySelect("movies")` in the four category buttons.

Replace both Saved and Recently Viewed category/item pairs with:

```ts
openStoredItem(item.category, item);
```

Preserve the Saved modal's subsequent `setSavedOpen(false)` call.

- [ ] **Step 5: Route discovery controls through reducer actions**

Use these exact handlers:

```tsx
onPress={() =>
  dispatchDiscovery({ type: "setActiveAction", action: "search" })
}
```

```tsx
onPress={() =>
  dispatchDiscovery({ type: "setActiveAction", action: "filter" })
}
```

```tsx
onPress={() =>
  dispatchDiscovery({ type: "setActiveAction", action: "randomize" })
}
```

```tsx
onChangeText={(query) =>
  dispatchDiscovery({ type: "setSearchQuery", query })
}
```

Replace `toggleFilter` with:

```ts
const toggleFilter = (value: string) => {
  dispatchDiscovery({ type: "toggleFilter", value });
};
```

Replace Clear All with:

```tsx
onPress={() => dispatchDiscovery({ type: "clearFilters" })}
```

For each filter section, replace its section toggle with this pattern, substituting its own section name:

```tsx
onToggle={() =>
  dispatchDiscovery({
    type: "setOpenSection",
    section: openSection === "genre" ? null : "genre",
  })
}
```

Replace the Results Clear handler with:

```tsx
onPress={() => dispatchDiscovery({ type: "clearResults" })}
```

- [ ] **Step 6: Replace direct async result writes with guarded completion**

Replace `runAction` with:

```ts
const runAction = async (action: DiscoveryActionMode) => {
  if (!selected || loading) return;
  if (action === "search" && !searchQuery.trim()) return;

  const category = selected;
  const query = searchQuery;
  const filters = [...selectedFilters];
  const request = requestTrackerRef.current.start(category);
  dispatchDiscovery({ type: "requestStarted", request });

  try {
    const decade = filters.find((filter) => /^\d{2}s$/.test(filter));
    const range = decade ? decadeToYearRange(decade) : null;
    const ratingFilter = filters.find((filter) => /^\d(\.\d)?\+$/.test(filter));
    const minRating = ratingFilter ? parseFloat(ratingFilter) : undefined;
    let nextResults: ResultItem[];

    if (category === "movies") {
      if (action === "search") {
        nextResults = await searchMovies(query);
      } else if (action === "randomize") {
        nextResults = await randomMovies();
      } else {
        const genreIds = filters
          .map((filter) => TMDB_GENRES[filter])
          .filter((value): value is number => typeof value === "number");
        nextResults = await filterMovies({
          genreIds: genreIds.length ? genreIds : undefined,
          yearFrom: range?.yearFrom,
          yearTo: range?.yearTo,
          minRating,
        });
      }
    } else if (category === "books") {
      if (action === "search") {
        nextResults = await searchBooks(query);
      } else if (action === "randomize") {
        nextResults = await randomBooks();
      } else {
        const subjects = filters
          .map((filter) => OL_SUBJECTS[filter])
          .filter((value): value is string => typeof value === "string");
        nextResults = await filterBooks({
          subjects: subjects.length ? subjects : undefined,
          yearFrom: range?.yearFrom,
          yearTo: range?.yearTo,
          minRating,
        });
      }
    } else if (category === "artists" || category === "albums") {
      if (action === "search") {
        nextResults =
          category === "artists"
            ? await searchArtists(query)
            : await searchAlbums(query);
      } else if (action === "randomize") {
        nextResults =
          category === "artists"
            ? await randomArtists()
            : await randomAlbums();
      } else {
        const genres = filters
          .map((filter) => SPOTIFY_GENRE_MAP[filter])
          .filter((value): value is string => typeof value === "string");
        const params = {
          genres: genres.length ? genres : undefined,
          yearFrom: range?.yearFrom,
          yearTo: range?.yearTo,
        };
        nextResults =
          category === "artists"
            ? await filterArtists(params)
            : await filterAlbums(params);
      }
    } else {
      nextResults = toResultItems(MOCK_RESULTS[category]);
    }

    if (!requestTrackerRef.current.isCurrent(request)) return;
    dispatchDiscovery({ type: "requestSucceeded", request, items: nextResults });
  } catch (error) {
    if (!requestTrackerRef.current.isCurrent(request)) return;
    const message = error instanceof Error ? error.message : "Something went wrong";
    dispatchDiscovery({ type: "requestFailed", request, message });
    Alert.alert("Error", message);
  }
};
```

Inside the search panel, call `runAction("search")` directly. Filter and Randomize retain `runAction("filter")` and `runAction("randomize")`.

- [ ] **Step 7: Verify the browser regression and complete checks are GREEN**

Run the same managed browser command outside the port-restricted sandbox:

```bash
python3 /Users/lukassagmani/.codex/plugins/cache/anthropic-agent-skills/example-skills/local/skills/webapp-testing/scripts/with_server.py --server "env CI=1 npm run web -- --port 8081" --port 8081 --timeout 120 -- python3 scripts/.codex_web_smoke.py
```

Expected: exit 0; mocked movie results render, selecting Books atomically clears them and restores the clean action prompt, and the hydrated page reports no local resource or page errors.

Then run:

Run:

```bash
npm test
npm run typecheck
npx expo export --platform web --output-dir /private/tmp/godiscover-web-state-eafaeb5
```

Expected: all unit tests and TypeScript pass; static web export exits 0.

- [ ] **Step 8: Commit the screen integration**

```bash
git add app/index.tsx
git commit -m "fix: isolate category and discovery request state"
```

---

### Task 6: Verify Native Bundles and the Hydrated Website

**Files:**
- Reuse, then delete: `scripts/.codex_web_smoke.py` from Task 5.
- No production files modified.

**Interfaces:**
- Consumes: the completed universal runtime, reducer, and request guard.
- Produces: fresh evidence for unit tests, strict compilation, iOS/Android bundling, static web export, browser hydration, and category isolation.

- [ ] **Step 1: Run the final automated quality checks**

```bash
npm test
npm run typecheck
```

Expected: all configured tests pass; TypeScript exits 0 with no diagnostics.

- [ ] **Step 2: Export each supported platform into isolated temporary directories**

```bash
npx expo export --platform ios --output-dir /private/tmp/godiscover-ios-final-eafaeb5
npx expo export --platform android --output-dir /private/tmp/godiscover-android-final-eafaeb5
npx expo export --platform web --output-dir /private/tmp/godiscover-web-final-eafaeb5
```

Expected: all three commands exit 0. Web produces `index.html`; native exports produce platform bundles without changing `ios/` or `android/` projects.

- [ ] **Step 3: Run the browser smoke test with the managed Expo server**

Run outside the port-restricted sandbox:

```bash
python3 /Users/lukassagmani/.codex/plugins/cache/anthropic-agent-skills/example-skills/local/skills/webapp-testing/scripts/with_server.py --server "env CI=1 npm run web -- --port 8081" --port 8081 --timeout 120 -- python3 scripts/.codex_web_smoke.py
```

Expected: exit 0; the page hydrates, mocked movie results render, switching to Books clears them, and no local bundle/font request or browser page error is recorded.

- [ ] **Step 4: Inspect the captured mobile screenshot**

Open `/private/tmp/godiscover-web-mobile-final.png` and confirm the Books category is selected, the movie result cards are absent, and the Search/Filter/Randomize choice prompt is visible.

- [ ] **Step 5: Delete the temporary smoke script and confirm repository state**

Delete only `scripts/.codex_web_smoke.py`, then run:

```bash
git status --short --branch
git log --oneline -6
```

Expected: no temporary script remains; only the intentional implementation commits are present and the worktree is clean.

- [ ] **Step 6: Re-run the final gate after cleanup**

```bash
npm test
npm run typecheck
```

Expected: all tests pass and TypeScript exits 0 after temporary verification artifacts are removed.
