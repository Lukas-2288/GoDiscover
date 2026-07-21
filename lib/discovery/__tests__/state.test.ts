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
