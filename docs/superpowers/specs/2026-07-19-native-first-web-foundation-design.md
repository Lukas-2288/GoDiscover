# Native-First Web Foundation Design

## Goal

Keep GoDiscover as one Expo application with iOS and Android as the primary platforms while making web a supported public platform. Fix the current web server-rendering crash and strict TypeScript error, then prevent category changes and stale discovery requests from corrupting UI state.

## Success Criteria

- The existing iOS and Android runtime paths continue using persistent AsyncStorage-backed Supabase sessions.
- Expo Router can server-render the web app without accessing browser-only globals.
- The browser hydrates the server-rendered page and restores any persisted Supabase session.
- `npx tsc --noEmit` completes successfully.
- Selecting a different content category atomically clears state that belongs to the previous category.
- A response or error from an invalidated discovery request cannot update the current category, loading state, results, or alerts.
- Automated tests cover the server-safe auth storage boundary and the discovery-state/request invariants.
- A browser smoke test verifies that the page hydrates and the main discovery controls are interactive.

## Scope

### Included

- SSR-safe Supabase Auth storage and initialization.
- Minimal repair of the stale Expo template color reference.
- A focused discovery-state reducer and request identity guard.
- Regression test tooling and tests for the new boundaries.
- Typecheck, web export/runtime, browser, and native bundle verification.

### Excluded

- Visual redesign or navigation restructuring.
- Breaking the full `HomeScreen` into feature components.
- Adding network-level `AbortController` support to every provider client.
- Changing filter semantics, API providers, saved-item behavior, or Supabase database policies.
- General README cleanup, dependency modernization, or security hardening unrelated to initialization.

## Architecture

### 1. Platform-Safe Auth Storage

Add a focused auth-storage module that exposes the Supabase storage contract (`getItem`, `setItem`, and `removeItem`) and selects an implementation from explicit runtime facts.

- On iOS and Android, use the existing AsyncStorage instance.
- In a hydrated browser, use AsyncStorage's web implementation.
- During web server rendering, use a stateless no-op adapter: reads return `null`, while writes and removals resolve without side effects.

The runtime check must use `Platform.OS === 'web'` together with `typeof window === 'undefined'`. `typeof window` is safe to evaluate in Node and does not misclassify native runtimes, which also lack a browser `window`.

`lib/supabase.ts` will use the selected storage. During web server rendering it will disable session persistence and automatic token refresh; in native and browser runtimes those options remain enabled. PKCE and explicit callback handling remain unchanged.

Server rendering therefore always sees an anonymous session and never stores credentials. The browser bundle evaluates the runtime selection independently, initializes with persistent client storage, and the existing `getSession`/auth-state effect restores the user session after hydration.

Missing Supabase environment variables remain a fail-fast configuration error on every platform.

### 2. TypeScript Repair

Replace the obsolete `Colors.light.tint` reference in the unused Expo template helper with the existing `Colors.light.accent` token. This is the smallest repair that preserves the intended link styling and restores strict compilation. Removing template routes or components is outside this change.

### 3. Discovery State

Move the state that defines a discovery session into a pure reducer module:

- selected category;
- active discovery action;
- search query;
- selected filters and open filter section;
- category-tagged results;
- loading and request-error status;
- active request ID and request category.

The reducer will expose explicit actions for category selection, action/query/filter changes, clearing results, and discovery request lifecycle events.

A category-button selection is one atomic reducer transition. It keeps the newly selected category and clears the previous action, query, filters, open section, results, loading state, error state, and active request metadata. The screen also closes any open detail item so details cannot be reinterpreted under another provider.

Opening an item from Saved or Recently Viewed remains a deliberate category-plus-item transition rather than a category-button reset. It sets the item's category and opens that exact item without leaving incompatible discovery results visible.

### 4. Request Identity

`HomeScreen` owns a monotonically increasing request sequence in a ref. Starting a discovery request captures four immutable inputs: request ID, category, action, and the current query/filter values.

The reducer accepts a success or failure only when both the request ID and category match its active request. The screen performs the same current-request check before showing an error alert. Selecting a category increments the sequence, so any prior request becomes invalid immediately.

Logical invalidation is sufficient for this scope. An invalidated fetch may finish in the background, but it cannot mutate the current UI. Provider-level abort signals can be added later if network cancellation becomes important.

The existing detail-fetch effect keeps its cancellation guard. Category selection explicitly clears the detail item, triggering that cleanup.

## Data Flow

### Web Initialization

1. Expo Router imports the app during Node server rendering.
2. The auth-storage selector recognizes web-without-`window` and returns the no-op adapter.
3. Supabase initializes without persisted sessions or token refresh.
4. The server renders the anonymous application shell.
5. The browser loads and evaluates the bundle with `window` available.
6. The selector returns AsyncStorage, and Supabase restores the persisted browser session.
7. The existing auth effect updates React state and synchronizes saved items when appropriate.

### Discovery Request

1. The user selects a category, producing a clean discovery state.
2. The user selects Search, Filter, or Randomize and supplies any inputs.
3. `runAction` snapshots the category and inputs, allocates a request ID, and dispatches request-started.
4. The corresponding provider client returns items or throws.
5. The completion is accepted only if its ID and category still match the active request.
6. Accepted results are stored together with their category; stale completions are ignored.

## Error Handling

- A missing Supabase URL or anon key continues to throw a clear configuration error.
- The server no-op auth adapter does not swallow provider or configuration errors; it only prevents browser-storage access during SSR.
- A current discovery-request failure clears its loading state, stores an error status, clears incompatible results, and shows the existing alert.
- A stale discovery-request failure produces no alert and cannot change loading, results, or error state.
- Category selection clears loading immediately from the user's perspective even when an invalidated fetch is still completing in the background.
- Detail-request failures retain their existing inline error state and cancellation behavior.

## Testing Strategy

Add an Expo-compatible Jest setup so tests can execute TypeScript and existing React Native modules consistently.

### Auth Storage Tests

- Web server runtime selects the no-op adapter without reading `window`.
- No-op reads return `null`; writes and removals resolve without persistence.
- Native and hydrated-web runtime facts select the supplied persistent adapter.
- Supabase option construction disables persistence/refresh only for web server rendering.

### Discovery Reducer Tests

- Category selection clears action, query, filters, open section, results, loading, error, and active request metadata.
- A current request success stores category-tagged results and ends loading.
- A stale request success is ignored.
- A stale request failure cannot clear or replace a newer request's loading/error/results state.
- Clearing results does not change the selected category.

### Verification

- Run the complete Jest suite.
- Run `npx tsc --noEmit`.
- Produce Expo JavaScript bundles for iOS and Android to catch platform import regressions without altering native projects.
- Produce the static web export and confirm server rendering no longer throws.
- Start the web app and use a headless browser to verify hydration, category selection, search controls, mocked results, category switching, and the absence of browser page errors.
- Re-run the full test suite and typecheck after browser verification.

## Compatibility and Rollback

The native storage implementation, Supabase credentials, PKCE flow, provider clients, and saved-item schema remain unchanged. The auth-storage selector and reducer are isolated modules, allowing either change to be reverted independently if verification reveals a platform regression.
