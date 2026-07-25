# Saved Atlas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task with TDD and scoped reviews.

**Goal:** Replace the web-only hash-positioned constellation with an artwork-first Saved Atlas that transitions from a stable Taste Atlas overview into an interactive Discovery Orbit.

**Architecture:** Keep native routing and UI unchanged. The web renderer uses custom React Flow nodes and edges, a deterministic D3-force layout, an append-only trail-event model, and the existing discovery/provider services behind new map-specific adapters.

**Tech Stack:** Expo 54, React 19, React Native Web, TypeScript, Jest, `@xyflow/react@12.11.2`, `d3-force@3.0.0`, AsyncStorage, Supabase.

## Global Constraints

- Native iOS and Android UI and behavior remain unchanged.
- Replace duplicate Map and Saved web destinations with one `Saved Atlas` destination containing Map and List views.
- Map modes are `atlas` and `orbit`; individual nodes are never draggable.
- The atlas is artwork-first and visually reads as an after-hours digital museum, not a neon starfield or node editor.
- Permanent paths represent deliberate saved discovery actions; suggested paths remain transient until chosen.
- Cross-media recommendations are deterministic and metadata-first; no AI service or new API cost.
- Trail history synchronizes through Supabase while device-specific viewport state remains local.
- The settled map must remain usable with at least 200 nodes and 400 permanent paths.
- Existing environment variable names and saved-item storage remain compatible.
- Work test-first: every production behavior begins with a focused failing test.

---

### Task 1: Map domain, events, and deterministic layouts

**Files:**
- Modify: `lib/storage/discoveryMap.ts`
- Create: `lib/discovery/mapLayout.ts`
- Modify: `lib/storage/__tests__/discoveryMap.test.ts`
- Create: `lib/discovery/__tests__/mapLayout.test.ts`

**Produces:**
- `MapExperienceMode`, `CulturalProfile`, upgraded `MapNode`, `MapEdge`, `TrailMutationEvent`, and `MapSnapshot`.
- Pure helpers to fold connect/disconnect events, build graph signatures, create deterministic atlas positions, project an orbit, and resolve zoom detail.

**Requirements:**
- Convert legacy directed edges into deterministic v2 connect events without duplication.
- Fold the newest event per relationship; disconnected relationships stay hidden even if an item is later re-saved.
- Atlas positions use category anchors, relationship attraction, collision avoidance, and stable seeded input.
- Orbit projection centers the seed, places direct neighbors on an inner ring, second-degree neighbors on an outer ring, and preserves unrelated atlas positions.
- Zoom detail has far, medium, and close modes and deterministic representative-node selection.
- All helpers remain platform-neutral and free of React/DOM imports.

### Task 2: Trail persistence and Supabase synchronization

**Files:**
- Modify: `lib/storage/discoveryMap.ts`
- Create: `lib/storage/discoveryTrailSync.ts`
- Create: `lib/storage/__tests__/discoveryTrailSync.test.ts`
- Create: `supabase/migrations/202607240001_discovery_trail_events.sql`

**Produces:**
- Local v2 event store with queued signed-out events.
- `syncDiscoveryTrailEvents()` and `disconnectSavedItemTrails()`.
- Owner-scoped append-only Supabase table and RLS.

**Requirements:**
- Event IDs and relationship IDs are stable strings generated before persistence.
- Synchronization merges local and cloud events idempotently, keeps offline events on failure, and never deletes another user’s data.
- Unsaving appends disconnect events for active attached relationships.
- SQL stores event/action/user/source/target/reason/session/time and grants only owner select/insert.
- Existing v1 AsyncStorage data migrates once and remains recoverable when malformed.

### Task 3: Metadata-first cross-media recommendation engine

**Files:**
- Create: `lib/discovery/culturalProfile.ts`
- Create: `lib/discovery/mapRecommendations.ts`
- Create: `lib/discovery/__tests__/culturalProfile.test.ts`
- Create: `lib/discovery/__tests__/mapRecommendations.test.ts`
- Modify provider adapters only where required to expose existing filter/search capabilities.

**Produces:**
- `buildCulturalProfile(category, item, detail)`.
- `findMapRecommendations(seed, dependencies)` returning scored candidates with honest structured reasons.

**Requirements:**
- Normalize provider genres, styles, subjects, descriptions, creators, and era through a versioned vocabulary.
- Use provider-native similar results as strong same-category candidates.
- Query all supported categories from normalized traits, deduplicate by category/item ID, omit the seed, and return at most eight results.
- Prefer cross-category variety only among candidates above the confidence threshold; never fill a quota with weak matches.
- Relationship labels derive from the strongest shared evidence and are never fabricated.
- Partial provider failures return available candidates with source-status metadata.

### Task 4: Saved Atlas renderer and list view

**Files:**
- Modify: `package.json` and `package-lock.json`
- Create focused modules under `components/web/map/`
- Modify: `components/web/WebHomeScreen.tsx`
- Modify: `app/index.web.tsx`
- Add focused component tests under `components/web/map/__tests__/`

**Produces:**
- Web-only React Flow canvas, custom artwork nodes, archival edges, controls, minimap, List view, and empty guided example.

**Requirements:**
- Install exactly `@xyflow/react@12.11.2` and `d3-force@3.0.0`.
- Import React Flow and its CSS only from web-resolved modules.
- Movies/books use cover proportions, albums squares, artists circles, and missing art receives a typographic cover.
- Progressive detail: far shows category summaries/representatives, medium all artwork with selective labels, close titles/metadata.
- Global paths are quiet cream/gray; focused paths use restrained violet/lime and show mono reason labels.
- Consolidate Map/Saved navigation into `Saved Atlas` with Map/List toggles.
- Disable node dragging and connection editing; support pan, pinch/wheel zoom, fit view, search-to-focus, and desktop/landscape minimap.

### Task 5: Discovery Orbit interactions

**Files:**
- Modify map modules under `components/web/map/`
- Modify: `app/index.web.tsx`
- Add orbit-focused tests under `components/web/map/__tests__/`

**Produces:**
- Atlas/orbit state transitions and direct-in-map recommendations.

**Requirements:**
- Selecting a node stores the atlas viewport, focuses direct/second-degree relationships, fades unrelated nodes, and opens details.
- `Find similar` creates at most eight transient nodes and suggested edges without persisting.
- Preview is non-mutating; Save persists the node and connect event; Skip removes the transient node; Reseed focuses the suggestion.
- If a candidate is already saved, choosing it records only the new relationship.
- Escape, Back, and `View whole atlas` restore the saved overview viewport.
- Provider/network failure preserves the current orbit and presents a retryable message.

### Task 6: Responsive, accessible, offline-complete behavior

**Files:**
- Modify map modules under `components/web/map/`
- Modify responsive web integration and tests.

**Produces:**
- Primary tablet portrait/landscape layouts, mobile web behavior, keyboard navigation, list-view parity, and offline states.

**Requirements:**
- Portrait tablet uses a preview/expanded detail drawer; landscape tablet and desktop use a persistent detail rail.
- Mobile web uses a compact atlas and modal detail sheet; native screens do not change.
- Spatial arrow navigation picks the nearest node in the pressed direction; Enter/Space focuses and Escape restores.
- Tab order prioritizes global controls and selected context rather than every hidden node.
- Every pan/drag interaction has search, focus, zoom-button, or fit-view alternatives with at least 44px targets.
- Reduced motion removes camera flights, springs, path pulses, and transforms while preserving state feedback.
- Cached atlas and permanent trails remain browsable offline; discovery reports connectivity loss without clearing state.

### Task 7: Integration, performance, and release verification

**Files:**
- Modify only files required by failures found during verification.
- Add integration tests for map persistence and the web entry screen.

**Requirements:**
- Verify 200 nodes and 400 edges settle deterministically and remain interactable without rerunning physics during pan/zoom.
- Verify malformed caches, partial providers, sign-in merge, repeated sync, unsave/re-save, and empty-map behavior.
- Run full Jest, TypeScript, production Expo web export, and native iOS/Android export smoke checks.
- Browser-check 375px, 768px portrait, 1024px landscape, and 1440px desktop with mouse, keyboard, and touch emulation.
- Review Supabase SQL for two-user RLS isolation.
- Run a whole-branch code review and resolve all load-bearing findings before completion.
