import type { ResultItem } from "../../../types/content";
import {
  activeDeckItem,
  createInitialDiscoveryDeckState,
  discoveryDeckReducer,
} from "../deckState";

const movie: ResultItem = { id: "m1", title: "Arrival", subtitle: "2016", meta: "" };
const secondMovie: ResultItem = {
  id: "m2",
  title: "Contact",
  subtitle: "1997",
  meta: "",
};
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
    let state = createInitialDiscoveryDeckState({ movies: [movie] });
    state = discoveryDeckReducer(state, {
      type: "selectCategory",
      category: "movies",
    });
    const started = discoveryDeckReducer(state, {
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
    state = discoveryDeckReducer(state, { type: "undoSave", operation });
    expect(activeDeckItem(state.sessions.books.deck)).toEqual(book);
    expect(state.lastSave).toBeNull();
  });

  it("updates form state only for the named category", () => {
    let state = createInitialDiscoveryDeckState();
    const originalBooks = state.sessions.books;

    state = discoveryDeckReducer(state, {
      type: "setActiveAction",
      category: "movies",
      action: "filter",
    });
    state = discoveryDeckReducer(state, {
      type: "setSearchQuery",
      category: "movies",
      query: "space",
    });
    state = discoveryDeckReducer(state, {
      type: "setOpenSection",
      category: "movies",
      section: "genres",
    });
    state = discoveryDeckReducer(state, {
      type: "toggleFilter",
      category: "movies",
      value: "Sci-Fi",
    });
    state = discoveryDeckReducer(state, {
      type: "toggleFilter",
      category: "movies",
      value: "Drama",
    });
    state = discoveryDeckReducer(state, {
      type: "toggleFilter",
      category: "movies",
      value: "Sci-Fi",
    });

    expect(state.sessions.movies).toMatchObject({
      activeAction: "filter",
      searchQuery: "space",
      openSection: "genres",
      selectedFilters: ["Drama"],
    });
    expect(state.sessions.books).toBe(originalBooks);

    state = discoveryDeckReducer(state, {
      type: "clearFilters",
      category: "movies",
    });
    expect(state.sessions.movies.selectedFilters).toEqual([]);
    expect(state.sessions.books).toBe(originalBooks);
  });

  it("collapses the active input panel after success", () => {
    let state = createInitialDiscoveryDeckState();
    state = discoveryDeckReducer(state, {
      type: "setActiveAction",
      category: "movies",
      action: "search",
    });
    state = discoveryDeckReducer(state, {
      type: "requestStarted",
      request: { id: 10, category: "movies" },
      input: { category: "movies", mode: "search", query: "space" },
    });
    state = discoveryDeckReducer(state, {
      type: "requestSucceeded",
      request: { id: 10, category: "movies" },
      input: { category: "movies", mode: "search", query: "space" },
      items: [movie],
    });

    expect(state.sessions.movies.activeAction).toBeNull();
  });

  it("leaves the active input panel open after failure", () => {
    let state = createInitialDiscoveryDeckState();
    state = discoveryDeckReducer(state, {
      type: "setActiveAction",
      category: "books",
      action: "filter",
    });
    const input = { category: "books", mode: "filter", filters: ["History"] } as const;
    state = discoveryDeckReducer(state, {
      type: "requestStarted",
      request: { id: 11, category: "books" },
      input,
    });
    state = discoveryDeckReducer(state, {
      type: "requestFailed",
      request: { id: 11, category: "books" },
      message: "Couldn't load books. Check your connection and try again.",
    });

    expect(state.sessions.books.activeAction).toBe("filter");
    expect(state.sessions.books.retryInput).toBe(input);
  });

  it("marks a current empty response as empty", () => {
    let state = createInitialDiscoveryDeckState({ movies: [movie] });
    state = discoveryDeckReducer(state, {
      type: "requestStarted",
      request: { id: 12, category: "movies" },
      input: { category: "movies", mode: "randomize" },
    });
    state = discoveryDeckReducer(state, {
      type: "requestSucceeded",
      request: { id: 12, category: "movies" },
      input: { category: "movies", mode: "randomize" },
      items: [],
    });

    expect(state.sessions.movies.status).toBe("empty");
    expect(activeDeckItem(state.sessions.movies.deck)).toBeNull();
  });

  it("records Similar context and clears it after a later Randomize", () => {
    let state = createInitialDiscoveryDeckState();
    state = discoveryDeckReducer(state, {
      type: "requestStarted",
      request: { id: 13, category: "movies" },
      input: { category: "movies", mode: "similar", seed: movie },
    });
    state = discoveryDeckReducer(state, {
      type: "requestSucceeded",
      request: { id: 13, category: "movies" },
      input: { category: "movies", mode: "similar", seed: movie },
      items: [secondMovie],
    });
    expect(state.sessions.movies.deck.similarContext).toEqual({
      sourceId: movie.id,
      sourceTitle: movie.title,
    });

    state = discoveryDeckReducer(state, {
      type: "requestStarted",
      request: { id: 14, category: "movies" },
      input: { category: "movies", mode: "randomize" },
    });
    state = discoveryDeckReducer(state, {
      type: "requestSucceeded",
      request: { id: 14, category: "movies" },
      input: { category: "movies", mode: "randomize" },
      items: [movie],
    });
    expect(state.sessions.movies.deck.similarContext).toBeNull();
  });

  it("does not let an older Save replace a newer completed Save", () => {
    const older = { id: 15, category: "movies" as const, item: movie };
    const newer = { id: 16, category: "movies" as const, item: secondMovie };
    let state = createInitialDiscoveryDeckState({ movies: [movie, secondMovie] });
    state = discoveryDeckReducer(state, { type: "saveStarted", operation: older });
    state = discoveryDeckReducer(state, { type: "saveStarted", operation: newer });
    state = discoveryDeckReducer(state, { type: "saveSucceeded", operationId: newer.id });
    state = discoveryDeckReducer(state, { type: "saveSucceeded", operationId: older.id });

    expect(state.lastSave).toEqual(newer);
    expect(state.pendingSaves).toEqual([]);
  });

  it("restores an exact older Save while keeping a newer Save undoable", () => {
    const older = { id: 22, category: "movies" as const, item: movie };
    const newer = { id: 23, category: "movies" as const, item: secondMovie };
    let state = createInitialDiscoveryDeckState({ movies: [movie, secondMovie] });
    state = discoveryDeckReducer(state, { type: "saveStarted", operation: older });
    state = discoveryDeckReducer(state, { type: "saveSucceeded", operationId: older.id });
    state = discoveryDeckReducer(state, { type: "saveStarted", operation: newer });
    state = discoveryDeckReducer(state, { type: "saveSucceeded", operationId: newer.id });

    state = discoveryDeckReducer(state, { type: "undoSave", operation: older });

    expect(activeDeckItem(state.sessions.movies.deck)).toEqual(movie);
    expect(state.sessions.movies.deck.seenCount).toBe(1);
    expect(state.lastSave).toEqual(newer);
  });

  it("clears only matching undo state and clears action errors independently", () => {
    const saved = { id: 17, category: "movies" as const, item: movie };
    const failed = { id: 18, category: "movies" as const, item: secondMovie };
    let state = createInitialDiscoveryDeckState({ movies: [movie, secondMovie] });
    state = discoveryDeckReducer(state, { type: "saveStarted", operation: saved });
    state = discoveryDeckReducer(state, { type: "saveSucceeded", operationId: saved.id });
    state = discoveryDeckReducer(state, { type: "saveStarted", operation: failed });
    state = discoveryDeckReducer(state, {
      type: "saveFailed",
      operationId: failed.id,
      message: "Couldn't save that one. It's back in your deck.",
    });

    const unmatched = discoveryDeckReducer(state, {
      type: "clearUndo",
      operationId: 999,
    });
    expect(unmatched).toBe(state);

    state = discoveryDeckReducer(state, {
      type: "clearUndo",
      operationId: saved.id,
    });
    expect(state.lastSave).toBeNull();
    expect(state.actionError).toBe("Couldn't save that one. It's back in your deck.");

    state = discoveryDeckReducer(state, { type: "clearActionError" });
    expect(state.actionError).toBeNull();
    expect(activeDeckItem(state.sessions.movies.deck)).toEqual(secondMovie);
  });

  it("returns the original state for guarded no-op actions", () => {
    const state = createInitialDiscoveryDeckState({ movies: [movie] });

    expect(
      discoveryDeckReducer(state, {
        type: "requestStarted",
        request: { id: 19, category: "books" },
        input: { category: "movies", mode: "randomize" },
      })
    ).toBe(state);
    expect(
      discoveryDeckReducer(state, {
        type: "skipCurrent",
        category: "movies",
        itemId: "not-active",
      })
    ).toBe(state);
    expect(
      discoveryDeckReducer(state, {
        type: "saveStarted",
        operation: { id: 20, category: "movies", item: secondMovie },
      })
    ).toBe(state);
    expect(
      discoveryDeckReducer(state, { type: "saveSucceeded", operationId: 20 })
    ).toBe(state);
    expect(
      discoveryDeckReducer(state, {
        type: "saveFailed",
        operationId: 20,
        message: "safe",
      })
    ).toBe(state);
  });

  it("creates isolated seeded queues and deduplicates loaded items", () => {
    const first = createInitialDiscoveryDeckState({ movies: [movie] });
    const second = createInitialDiscoveryDeckState({ movies: [movie] });
    expect(first.sessions.movies.deck.queue).not.toBe(second.sessions.movies.deck.queue);
    expect(first.sessions.movies.selectedFilters).not.toBe(
      second.sessions.movies.selectedFilters
    );

    let state = discoveryDeckReducer(first, {
      type: "requestStarted",
      request: { id: 21, category: "movies" },
      input: { category: "movies", mode: "randomize" },
    });
    state = discoveryDeckReducer(state, {
      type: "requestSucceeded",
      request: { id: 21, category: "movies" },
      input: { category: "movies", mode: "randomize" },
      items: [movie, secondMovie, movie],
    });

    expect(state.sessions.movies.deck.queue).toEqual([movie, secondMovie]);
  });
});
