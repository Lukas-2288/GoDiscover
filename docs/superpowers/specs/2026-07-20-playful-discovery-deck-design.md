# Playful Discovery Deck Design

## Summary

GoDiscover will evolve from a control-heavy results page into a playful, deck-first discovery experience for movies, books, artists, and albums. The redesign keeps Surprise Me as the primary purpose of the app, retains Search and Filter as optional supporting tools, and preserves the existing provider, account, saved-item, recent-item, and theme foundations.

The product should feel approximately 75% playful collector and 25% cinematic editorial. Each category receives a distinct visual personality, while GoDiscover purple remains the shared brand anchor. The interface may look wild, but its information hierarchy, interaction model, and accessibility behavior must remain calm and predictable.

## Goals

- Make Surprise Me the clearest and most delightful path through the app.
- Let users discover one item at a time through a tactile card deck.
- Provide three explicit decisions: Save, Not for me, and Similar.
- Keep every discovery unbiased unless the user explicitly requests similar items.
- Give movies, books, artists, and albums recognizable visual personalities.
- Make details feel fast and playful rather than like a conventional static modal.
- Make every gesture available through labeled controls, keyboard input, and screen readers.
- Separate the current 2,804-line home screen into focused, testable units.
- Preserve the category and request isolation guarantees already added to the app.
- Support iOS and Android as the priority platforms without regressing web.

## Non-Goals

- A recommendation algorithm, preference profile, or behavioral training system.
- Automatic personalization based on saves, skips, searches, or viewing history.
- A new bottom-tab navigation system or a full redesign of account and library flows.
- Social features, public profiles, reviews, ratings, comments, or shared lists.
- Replacing TMDB, Open Library, Discogs, Supabase, or the existing storage schema.
- Offline media caching or background prefetching beyond the active deck.
- A full design-system rewrite for unrelated Expo template screens.

## Success Criteria

- A user can choose any of the four categories and launch Surprise Me without configuring anything else.
- The active category is always visually and textually clear.
- The deck presents one primary item with a visible indication that more cards follow.
- Swiping right and pressing Save produce the same state transition.
- Swiping left and pressing Not for me produce the same state transition.
- Similar creates an explicitly labeled, temporary related deck and never changes later random results.
- Save advances immediately and offers a brief Undo action.
- Changing categories cannot display results, errors, or details from another category.
- Returning to a category restores its completed in-memory deck for the current app session.
- The full discovery flow is operable without gestures, without color perception, and with reduced motion enabled.
- Raw provider errors are never presented directly to the user.
- Automated state tests, TypeScript, and iOS, Android, and web smoke checks pass.

## Product Direction

### Chosen Approach: Deck-First Evolution

The redesign will replace the current results-grid emphasis with a focused discovery deck while reusing existing services and storage. This approach creates a meaningfully new experience without combining it with a risky whole-app navigation rewrite.

Two alternatives were considered and rejected for this phase:

- A full application-shell redesign would combine the deck with new navigation, library, profile, and settings structures. It offers more immediate novelty but creates too many interdependent changes for one release.
- A visual reskin of the current category grid, controls, and modal would be faster but would not establish the one-at-a-time discovery behavior that defines the new product direction.

## Information Architecture

The primary flow is:

`Choose category -> optionally Search or Filter -> Surprise Me -> review deck -> Save / Not for me / Similar -> open details when wanted`

The initial home state shows the GoDiscover header and four category choices. After a category is selected, the active category styling surrounds the discovery controls. Surprise Me is the largest and highest-priority action. Search and Filter remain visible but secondary.

Once items load, the category chooser compresses into a clear active-category control so the deck receives most of the screen. The user can return to the category chooser without losing completed decks from other categories during the current session.

The existing header access to Saved, Account, and How to Use remains. Those surfaces may adopt shared spacing, typography, and accessibility primitives, but changing their information architecture is outside this phase.

## Visual System

### Shared Brand Layer

GoDiscover purple remains present in the logo, shared navigation, focus treatment, and connective elements. Dark and light themes remain supported. The deck uses large artwork, bold title typography, concise metadata, high-contrast action labels, irregular but controlled decorative shapes, and small editorial phrases.

System sans-serif typography remains the readable foundation. The existing Space Mono asset is reserved for category badges, metadata, stamps, and playful annotations. This preserves personality without making longer text difficult to read.

Wildness comes from color, composition, artwork, stickers, tape-like shapes, stamps, energetic copy, and short motion. It does not come from adding more controls or placing decoration over essential information.

### Category Personalities

| Category | Primary personality | Visual language |
| --- | --- | --- |
| Movies | Hot pink and electric blue | Cinematic flashes, ticket-stub shapes, marquee or frame details |
| Books | Citrus yellow and deep violet | Paper layers, margin notes, tabs, and scribbled accents |
| Artists | Acid green and cobalt | Backstage passes, marker strokes, and live-set energy |
| Albums | Fiery orange and aqua | Record-label circles, rhythmic patterns, and sleeve-like framing |

Every category theme is represented by semantic tokens rather than scattered color literals. Each theme defines an accent, supporting accent, safe foreground colors, soft surface colors, decorative pattern, badge copy, and optional motion accent. Implemented token pairs must meet WCAG AA contrast for the text size on which they are used.

Category is never communicated by color alone. Every themed surface also displays a category name and icon, and decorative shapes are hidden from accessibility APIs.

## Screen Design

### 1. Category Selection and Discovery Controls

The initial category selector remains easy to scan but becomes more expressive. Each category card includes its name, a recognizable icon, its color pairing, and one restrained decorative motif. The cards form a two-column layout on phones and may expand to four columns on sufficiently wide web layouts.

Selecting a category changes the surrounding accent treatment immediately. Search and Filter appear as compact secondary controls. Surprise Me receives the strongest size, contrast, and copy treatment. Selecting Search reveals a labeled text field and submit action. Selecting Filter reveals category-appropriate filter groups and a clear apply action. Neither secondary mode changes the default behavior of future Surprise Me requests.

### 2. Discovery Deck

The deck shows one primary card and small portions of up to two cards behind it. The active card contains:

- category badge;
- dominant artwork or a branded fallback image;
- title;
- concise subtitle and metadata;
- one short editorial or playful annotation when the available data supports it.

Cards must not invent factual descriptions that providers do not supply. Decorative copy may describe the interaction, such as "wild card" or "worth a look," but not make unsupported claims about the content.

On phones, the card occupies most of the usable width while leaving the action row and current context visible. On wide web layouts, the deck is centered with a bounded maximum width rather than stretching artwork across the viewport.

Mouse dragging and touch dragging share the same visual behavior. Keyboard and assistive-technology users operate the explicit actions instead of needing to simulate a drag.

### 3. Actions

The three actions have stable meanings:

- **Save:** persist the item, advance to the next card, and show "Saved - Undo."
- **Not for me:** remove the item from the current deck and advance. This decision is not persisted as a preference and does not train later requests.
- **Similar:** request related items from the current provider and create a temporary deck labeled "Similar to <item>." A visible exit or a new Surprise Me request returns to unbiased discovery.

Save is the primary action and swipe-right direction. Not for me is swipe left. Similar is always a button because it is an intentional branching action rather than a binary swipe decision. Button labels remain visible; icons may supplement but never replace them.

Only the latest completed Save is reversible. Undo removes the saved record and restores the item to the front of the active deck. If saving fails, the card is restored automatically and a friendly inline message explains that it was not saved. Not for me does not receive Undo in this phase.

### 4. Detail Sheet

Tapping or activating a card opens a detail sheet without consuming it. On phones, the sheet rises from the bottom and may become nearly full-screen for long content. On wide web layouts it appears as a centered, bounded surface. The sheet includes:

- expanded artwork;
- title and category;
- available provider metadata;
- summary or description when available;
- provider or listening/viewing links when available;
- Save, Not for me, and Similar actions;
- an explicit labeled close control.

The sheet uses the active category's graphics and accent treatment. Its entrance is quick and playful, not cinematic or slow. Closing it returns focus to the originating card. Choosing Save or Not for me in the sheet closes it and advances the same deck exactly once.

### 5. Loading, Empty, and Error States

Initial discovery uses a card-shaped loading skeleton with a short status label. It must not flash repeatedly or animate indefinitely when reduced motion is active.

An empty provider response becomes a themed empty card with a useful next action: shuffle again, change filters, or clear the current search. The existing deck is not silently destroyed until a replacement request succeeds.

A failed discovery request appears as a themed inline card with plain-language copy and Retry. Retry repeats the captured category, mode, query, and filter inputs. Raw response bodies, token messages, and provider-specific stack information are logged only for development and are not shown in the UI.

Detail failures keep the base card information visible inside the sheet and offer Retry for the missing detail content. Image failures use the existing placeholder asset or a category-themed fallback without failing the rest of the card.

## Interaction and Motion

The deck should feel snappy and playful:

- Dragging a card produces a small rotation, depth change, and progressive Save or Not for me label.
- Crossing the distance or velocity threshold commits the decision; releasing below it returns the card to center.
- A committed card exits quickly and the next card settles into place.
- Save and Not for me buttons invoke the same transition as their matching swipes.
- Detail opening, card commits, and Undo feedback generally complete within 200-300 milliseconds.
- Rapid repeated input is locked while a card commit is finishing so one item cannot be processed twice.

The existing animation capabilities are sufficient; this phase does not require adopting another animation framework. Motion values and timing are centralized so reduced-motion behavior and platform tuning are consistent.

When the operating system requests reduced motion, rotation, flight, scale, parallax, repeated skeleton movement, and expanding artwork are removed. State changes use short opacity transitions or update immediately. No essential meaning depends on animation.

## Accessibility

- Interactive targets are at least 44 by 44 points on native platforms and meet WCAG target-size expectations on web.
- Cards and action controls receive explicit roles, names, state descriptions, and concise hints where the result of activation is not obvious.
- Reading order is category context, card title, metadata, annotation, then actions.
- Screen readers announce meaningful transitions, for example "Saved Dune. New card: Arrival," without announcing decorative motion.
- Dynamic Type and browser text zoom are supported. Text containers grow or wrap instead of clipping against fixed-height cards.
- All swipe outcomes are available as visible buttons. Similar never requires a gesture.
- Web provides visible focus indicators with sufficient contrast, logical Tab order, Enter/Space activation, Escape to close the detail sheet, and restored focus after dismissal.
- Color is never the sole indicator of category, action, selection, loading, success, or error.
- Light and dark token combinations are checked for WCAG AA contrast.
- Reduced-motion behavior follows the system preference and can be verified independently of theme choice.

## Technical Architecture

### Component Boundaries

`app/index.tsx` remains the route and high-level composition layer but stops rendering every discovery detail itself. The redesign introduces focused modules along these boundaries:

- `components/discovery/CategoryPicker.tsx`: category choices and active-category control.
- `components/discovery/DiscoveryControls.tsx`: Search, Filter, and Surprise Me modes.
- `components/discovery/SwipeDeck.tsx`: card stack, pointer/touch responder, animation, and commit threshold.
- `components/discovery/DiscoveryCard.tsx`: a single normalized result card.
- `components/discovery/DiscoveryActions.tsx`: labeled Save, Not for me, and Similar controls.
- `components/discovery/DetailSheet.tsx`: category-aware detail presentation and focus behavior.
- `components/discovery/UndoNotice.tsx`: latest-save confirmation and Undo action.
- `components/discovery/DiscoveryStatusCard.tsx`: loading, empty, and retry states.
- `lib/discovery/categoryThemes.ts`: typed category visual and copy tokens.
- `lib/discovery/deckState.ts`: pure deck and per-category session transitions.
- `lib/discovery/loadDiscovery.ts`: provider selection and normalized request dispatch.

Existing account, saved-items, recents, sharing, provider clients, and persistence functions remain the sources of truth for their respective behavior. Existing modal content may be extracted into focused components while moving discovery code, but it will not be functionally redesigned as part of this work.

### State Model

The current reducer's request identity protection remains an invariant. The discovery state evolves from one replaceable result set into:

- the selected category;
- a per-category session map;
- the active detail identity;
- the latest reversible Save operation.

Each category session owns its action mode, query, filters, completed deck, current position, temporary Similar context, loading status, user-safe error, and active request identity. Selecting another category invalidates the in-flight request but does not erase completed session data. Returning to a category therefore restores its last completed deck during the current app process.

A new successful Search, Filter, Surprise Me, or Similar request atomically replaces the target session's queue and resets its position. The previous queue remains visible while a replacement request loads and is replaced only after success. A stale completion cannot update any category.

Detail fetches are identified by both category and item ID. Closing details, opening another item, or changing category invalidates the previous detail completion.

### Data Flow

#### Discovery

1. The user selects a category and optional mode inputs.
2. The screen snapshots category, mode, query, and filters.
3. The request tracker allocates an identity for that category request.
4. `loadDiscovery` invokes the existing provider client and returns normalized `ResultItem` values.
5. The reducer accepts the result only if category and request identity still match.
6. The accepted items become that category session's deck.
7. The active card is derived from the deck and current position.

#### Save and Undo

1. Save commits the card transition once and records a pending reversible operation.
2. The existing saved-item layer writes locally and, when signed in, follows its current cloud behavior.
3. Success shows a brief Undo notice while the next card remains active.
4. Undo calls the existing removal path and restores the item to the front of the active deck.
5. Failure restores the original card, clears the pending operation, and presents a user-safe message.

#### Similar

1. The user explicitly chooses Similar for the active item.
2. The item and category form a temporary related-content request.
3. Accepted related items replace the current queue and set a visible Similar context label.
4. That context exists only in the current category session and is cleared by a new Search, Filter, or Surprise Me request.
5. Saves, skips, and Similar selections never modify the parameters of a later Surprise Me request.

## Error Handling and Concurrency

- Category changes invalidate current discovery and detail request identities.
- Stale successes and stale failures are ignored and cannot replace data, stop a newer loading state, or show an error.
- Card actions are idempotent during their commit animation; repeated taps or a swipe-plus-button sequence process the item once.
- Save failures restore the affected item instead of advancing permanently.
- Provider failures preserve the previous successful queue and expose inline Retry.
- Authentication and saved-item sync failures remain scoped to their respective surfaces.
- User-visible messages use stable application copy; development logs may retain provider context with secrets and tokens redacted.

## Testing Strategy

### Pure State Tests

- Each category session retains completed deck state independently.
- Selecting a new category cannot expose another category's items or error.
- A current request replaces only its target category queue.
- Stale request successes and failures are ignored.
- A new request resets the deck position and clears temporary Similar context as specified.
- Save advances once, Undo restores the exact item once, and save failure rolls back.
- Not for me advances without recording a preference.
- Similar is category-scoped and cannot alter later Surprise Me inputs.

### Component and Interaction Tests

- Gesture commits and labeled-button presses call the same action handlers.
- A below-threshold drag returns the card without changing state.
- Action locking prevents duplicate processing.
- Loading, empty, failure, Retry, and image-fallback states render with meaningful labels.
- Detail actions affect the deck once and return focus correctly.
- Controls expose accessible roles, labels, states, and minimum target sizes.
- Reduced-motion mode removes nonessential transforms and repeated animation.
- Web keyboard traversal, activation, detail dismissal, and focus restoration work.

### Platform Verification

- Run the complete Jest suite.
- Run strict TypeScript checking.
- Produce or start the iOS, Android, and web bundles to catch platform-specific imports.
- Smoke-test category selection, Surprise Me, Search, Filter, swipe, button alternatives, details, Similar, Save, Undo, Saved, and category switching on iOS.
- Repeat the critical deck and detail paths on Android and web.
- Verify dark theme, light theme, large text, screen-reader labels, keyboard focus, and reduced motion.
- Confirm no raw provider error is shown when a request is forced to fail.

## Delivery Sequence

1. Extract pure category-theme and deck-state foundations with tests.
2. Split discovery controls and category selection out of `app/index.tsx` without changing provider behavior.
3. Introduce the themed single-card deck and labeled action row.
4. Add gesture animation, action locking, Save rollback, and Undo.
5. Replace the current detail presentation with the category-aware detail sheet.
6. Add temporary Similar context and inline loading, empty, and error cards.
7. Complete accessibility behavior, responsive web behavior, and reduced motion.
8. Run full automated and cross-platform verification, fixing regressions before handoff.

Each sequence step should leave the app type-safe and testable. Existing APIs and saved-item behavior are reused rather than rewritten.

## Compatibility and Rollback

The existing provider clients, normalized content types, Supabase configuration, auth flow, saved-item schema, recent-item schema, and native-first web foundation remain compatible. The new category tokens, deck reducer, and presentation components are isolated modules. If the gesture layer causes a platform regression, the same deck can temporarily use its labeled buttons because gesture input is not the state owner.

No database migration or credential change is required. The redesign can be rolled back at the route-composition layer without changing persisted saved items.
