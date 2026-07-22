import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ContentCategory, ResultItem } from "../../../types/content";
import type { DiscoveryLoadInput } from "../../../lib/discovery/types";
import type { SavedItem } from "../../../lib/storage/saved";
import { useDiscoveryController } from "../useDiscoveryController";

jest.mock("../../../lib/storage/saved", () => ({
  addSaved: jest.fn(),
  removeSaved: jest.fn(),
}));

const movie: ResultItem = {
  id: "m1",
  title: "Arrival",
  subtitle: "2016",
  meta: "",
};

const secondMovie: ResultItem = {
  id: "m2",
  title: "Contact",
  subtitle: "1997",
  meta: "",
};

function savedItem(
  item: ResultItem,
  category: ContentCategory = "movies"
): SavedItem {
  return { ...item, category, savedAt: 1 };
}

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it("ignores a completion after category selection invalidates it", async () => {
  let finish: (items: ResultItem[]) => void = () => undefined;
  const load = jest.fn(
    () =>
      new Promise<ResultItem[]>((resolve) => {
        finish = resolve;
      })
  );
  const { result } = renderHook(() =>
    useDiscoveryController({
      dependencies: {
        load,
        addSaved: jest.fn(async () => []),
        removeSaved: jest.fn(async () => []),
      },
    })
  );

  act(() => result.current.selectCategory("movies"));
  let pending!: Promise<void>;
  act(() => {
    pending = result.current.submit("randomize");
  });
  act(() => result.current.selectCategory("books"));
  act(() => finish([movie]));
  await act(async () => pending);

  await waitFor(() => expect(result.current.state.selected).toBe("books"));
  expect(result.current.state.sessions.movies.deck.queue).toEqual([]);
  expect(result.current.state.sessions.movies.activeRequest).toBeNull();
});

it("advances immediately, completes Save, and restores on Undo", async () => {
  let finishSave: (items: SavedItem[]) => void = () => undefined;
  const addSaved = jest.fn(
    () =>
      new Promise<SavedItem[]>((resolve) => {
        finishSave = resolve;
      })
  );
  const removeSaved = jest.fn(async () => [] as SavedItem[]);
  const onSavedItemsChange = jest.fn();
  const { result } = renderHook(() =>
    useDiscoveryController({
      initialItems: { movies: [movie] },
      dependencies: { load: jest.fn(), addSaved, removeSaved },
      onSavedItemsChange,
    })
  );

  act(() => result.current.selectCategory("movies"));
  let pendingSave!: Promise<void>;
  act(() => {
    pendingSave = result.current.commit(movie, "save");
  });
  expect(result.current.activeItem).toBeNull();
  expect(result.current.state.lastSave).toBeNull();

  await act(async () => {
    finishSave([savedItem(movie)]);
    await pendingSave;
  });
  expect(result.current.state.lastSave?.item).toEqual(movie);
  expect(result.current.announcement).toBe(
    "Saved Arrival. That's the end of this deck."
  );
  expect(onSavedItemsChange).toHaveBeenCalledWith([savedItem(movie)]);

  await act(async () => {
    await result.current.undo();
  });
  expect(removeSaved).toHaveBeenCalledWith("movies", movie.id);
  expect(result.current.activeItem).toEqual(movie);
  expect(result.current.announcement).toBe("Arrival returned to your deck.");
});

it("never writes storage for Not for me", async () => {
  const addSaved = jest.fn();
  const { result } = renderHook(() =>
    useDiscoveryController({
      initialItems: { movies: [movie, secondMovie] },
      dependencies: { load: jest.fn(), addSaved, removeSaved: jest.fn() },
    })
  );

  act(() => result.current.selectCategory("movies"));
  await act(async () => {
    await result.current.commit(movie, "skip");
  });

  expect(addSaved).not.toHaveBeenCalled();
  expect(result.current.activeItem).toEqual(secondMovie);
  expect(result.current.announcement).toBe("Not for me. New card: Contact.");
});

it("keeps Similar category scoped and leaves no seed in a later Randomize", async () => {
  const load = jest.fn(async (_input: DiscoveryLoadInput) => [secondMovie]);
  const { result } = renderHook(() =>
    useDiscoveryController({
      dependencies: {
        load,
        addSaved: jest.fn(async () => []),
        removeSaved: jest.fn(async () => []),
      },
    })
  );

  act(() => result.current.selectCategory("movies"));
  await act(async () => {
    await result.current.similar(movie);
  });

  expect(load).toHaveBeenNthCalledWith(1, {
    category: "movies",
    mode: "similar",
    seed: movie,
  });
  expect(Object.keys(load.mock.calls[0][0]).sort()).toEqual([
    "category",
    "mode",
    "seed",
  ]);
  expect(result.current.announcement).toBe("Showing picks similar to Arrival.");

  await act(async () => {
    await result.current.submit("randomize");
  });

  expect(load).toHaveBeenNthCalledWith(2, {
    category: "movies",
    mode: "randomize",
  });
  expect(Object.keys(load.mock.calls[1][0]).sort()).toEqual(["category", "mode"]);
  expect(result.current.session?.deck.similarContext).toBeNull();
});

it("restores the exact card when storage does not confirm the Save", async () => {
  const addSaved = jest.fn(async () => [savedItem(movie, "books")]);
  const { result } = renderHook(() =>
    useDiscoveryController({
      initialItems: { movies: [movie] },
      dependencies: { load: jest.fn(), addSaved, removeSaved: jest.fn() },
    })
  );

  act(() => result.current.selectCategory("movies"));
  await act(async () => {
    await result.current.commit(movie, "save");
  });

  expect(result.current.activeItem).toEqual(movie);
  expect(result.current.state.lastSave).toBeNull();
  expect(result.current.state.actionError).toBe(
    "Couldn't save that one. It's back in your deck."
  );
});

it("builds trimmed Search and cloned Filter request snapshots", async () => {
  const load = jest.fn(async (_input: DiscoveryLoadInput) => [movie]);
  const { result } = renderHook(() =>
    useDiscoveryController({
      dependencies: {
        load,
        addSaved: jest.fn(async () => []),
        removeSaved: jest.fn(async () => []),
      },
    })
  );

  act(() => result.current.selectCategory("movies"));
  act(() => result.current.setQuery("  arrival  "));
  await act(async () => {
    await result.current.submit("search");
  });
  expect(load).toHaveBeenNthCalledWith(1, {
    category: "movies",
    mode: "search",
    query: "arrival",
  });

  act(() => result.current.toggleFilter("Sci-Fi"));
  let pending!: Promise<void>;
  act(() => {
    pending = result.current.submit("filter");
  });
  act(() => result.current.toggleFilter("Drama"));
  await act(async () => pending);

  expect(load).toHaveBeenNthCalledWith(2, {
    category: "movies",
    mode: "filter",
    filters: ["Sci-Fi"],
  });
  const filterInput = load.mock.calls[1][0];
  expect(filterInput.mode).toBe("filter");
  if (filterInput.mode !== "filter") throw new Error("Expected a Filter request");
  expect(filterInput.filters).not.toBe(result.current.state.sessions.movies.selectedFilters);
});

it("keeps a failed Undo available and shows only safe action copy", async () => {
  const removeSaved = jest.fn(async () => [savedItem(movie)]);
  const { result } = renderHook(() =>
    useDiscoveryController({
      initialItems: { movies: [movie] },
      dependencies: {
        load: jest.fn(),
        addSaved: jest.fn(async () => [savedItem(movie)]),
        removeSaved,
      },
    })
  );

  act(() => result.current.selectCategory("movies"));
  await act(async () => {
    await result.current.commit(movie, "save");
  });
  await act(async () => {
    await result.current.undo();
  });

  expect(result.current.state.lastSave?.item).toEqual(movie);
  expect(result.current.activeItem).toBeNull();
  expect(result.current.state.actionError).toBe("Couldn't undo that save. Try again.");
});

it("expires only the current Save undo operation after 4.5 seconds", async () => {
  jest.useFakeTimers();
  const { result, unmount } = renderHook(() =>
    useDiscoveryController({
      initialItems: { movies: [movie, secondMovie] },
      dependencies: {
        load: jest.fn(),
        addSaved: jest.fn(async (_category: ContentCategory, item: ResultItem) => [
          savedItem(item),
        ]),
        removeSaved: jest.fn(async () => []),
      },
    })
  );

  act(() => result.current.selectCategory("movies"));
  await act(async () => {
    await result.current.commit(movie, "save");
  });
  expect(result.current.state.lastSave?.item).toEqual(movie);

  act(() => jest.advanceTimersByTime(1_000));
  await act(async () => {
    await result.current.commit(secondMovie, "save");
  });
  expect(result.current.state.lastSave?.item).toEqual(secondMovie);

  act(() => jest.advanceTimersByTime(3_500));
  expect(result.current.state.lastSave?.item).toEqual(secondMovie);
  act(() => jest.advanceTimersByTime(1_000));
  expect(result.current.state.lastSave).toBeNull();

  unmount();
  expect(jest.getTimerCount()).toBe(0);
});

it("reports request failures with safe UI copy and metadata-only diagnostics", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  const load = jest.fn(async () => {
    throw new Error("Discogs 401: Invalid consumer token");
  });
  const { result } = renderHook(() =>
    useDiscoveryController({
      dependencies: {
        load,
        addSaved: jest.fn(async () => []),
        removeSaved: jest.fn(async () => []),
      },
    })
  );

  act(() => result.current.selectCategory("albums"));
  await act(async () => {
    await result.current.submit("randomize");
  });

  expect(result.current.session?.requestError).toBe(
    "Couldn't load albums. Check your connection and try again."
  );
  expect(warn).toHaveBeenCalledWith({
    category: "albums",
    mode: "randomize",
    errorName: "Error",
  });
  expect(JSON.stringify(warn.mock.calls)).not.toContain("Discogs");
  expect(JSON.stringify(warn.mock.calls)).not.toContain("401");
  expect(JSON.stringify(warn.mock.calls)).not.toContain("token");
});
