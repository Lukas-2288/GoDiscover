import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react-native";

import type { MovieDetail, ResultItem } from "../../types/content";

jest.mock(
  "@react-native-async-storage/async-storage",
  () => require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

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

const movieDetail: MovieDetail = {
  id: "329865",
  title: "Arrival",
  overview: "A linguist works to communicate with visitors from another world.",
  releaseYear: "2016",
  rating: 8,
  runtime: 116,
  genres: ["Science Fiction", "Drama"],
  language: "en",
};

const arrival: ResultItem = {
  id: "329865",
  title: "Arrival",
  subtitle: "2016",
  meta: "★ 8.0",
};

const moonlight: ResultItem = {
  id: "376867",
  title: "Moonlight",
  subtitle: "2016",
  meta: "★ 7.4",
};

jest.mock("../../lib/api/tmdb", () => ({
  getMovieDetail: jest.fn(async () => movieDetail),
  getSimilarMovies: jest.fn(),
}));

jest.mock("../../lib/discovery/loadDiscovery", () => {
  const actual = jest.requireActual("../../lib/discovery/loadDiscovery");
  return {
    ...actual,
    loadDiscovery: jest.fn(async () => [arrival]),
  };
});

jest.mock("../../lib/discovery/loadDetail", () => {
  const actual = jest.requireActual("../../lib/discovery/loadDetail");
  return {
    ...actual,
    loadDetail: jest.fn(async () => ({ category: "movies", data: movieDetail })),
  };
});

jest.mock("../../components/discovery/SwipeDeck", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const actual = jest.requireActual<typeof import("../../components/discovery/SwipeDeck")>(
    "../../components/discovery/SwipeDeck"
  );
  const deckFocus = jest.fn();

  return {
    ...actual,
    deckFocus,
    SwipeDeck: React.forwardRef((props: any, ref: any) => {
      React.useImperativeHandle(ref, () => ({ focusActiveCard: deckFocus }));
      return React.createElement(actual.SwipeDeck, props);
    }),
  };
});

import { getSimilarMovies } from "../../lib/api/tmdb";
import { loadDetail } from "../../lib/discovery/loadDetail";
import { loadDiscovery } from "../../lib/discovery/loadDiscovery";
import { addSaved, listSaved, removeSaved } from "../../lib/storage/saved";
import HomeScreen from "../index";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function deckFocusMock(): jest.Mock {
  return (
    jest.requireMock("../../components/discovery/SwipeDeck") as {
      deckFocus: jest.Mock;
    }
  ).deckFocus;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(loadDiscovery).mockResolvedValue([arrival]);
  jest.mocked(loadDetail).mockResolvedValue({ category: "movies", data: movieDetail });
  jest.mocked(listSaved).mockResolvedValue([]);
  jest.mocked(addSaved).mockImplementation(async (category, item) => [{
    ...item,
    category,
    savedAt: 1,
  }]);
  jest.mocked(removeSaved).mockResolvedValue([]);
});

it("moves from category selection to Surprise Me to one active deck card", async () => {
  render(<HomeScreen />);
  fireEvent.press(screen.getByRole("button", { name: "Movies" }));
  fireEvent.press(screen.getByRole("button", { name: "Surprise me with a movie" }));
  await waitFor(() => expect(screen.getByText("Arrival")).toBeTruthy());
  expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Not for me" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Find similar" })).toBeTruthy();
});

it("loads tagged detail without a related request until Similar is explicit", async () => {
  render(<HomeScreen />);
  fireEvent.press(screen.getByRole("button", { name: "Movies" }));
  fireEvent.press(screen.getByRole("button", { name: "Surprise me with a movie" }));

  const arrival = await screen.findByRole("button", { name: /Movies\. Arrival/ });
  fireEvent.press(arrival);

  await waitFor(() =>
    expect(loadDetail).toHaveBeenCalledWith(
      "movies",
      expect.objectContaining({ id: "329865", title: "Arrival" })
    )
  );
  expect(loadDetail).toHaveBeenCalledTimes(1);
  expect(loadDiscovery).toHaveBeenCalledTimes(1);
  expect(loadDiscovery).toHaveBeenLastCalledWith({
    category: "movies",
    mode: "randomize",
  });
  expect(getSimilarMovies).not.toHaveBeenCalled();

  fireEvent.press(screen.getByRole("button", { name: "Similar" }));

  await waitFor(() => expect(loadDiscovery).toHaveBeenCalledTimes(2));
  expect(loadDiscovery).toHaveBeenLastCalledWith({
    category: "movies",
    mode: "similar",
    seed: expect.objectContaining({ id: "329865", title: "Arrival" }),
  });
  expect(getSimilarMovies).not.toHaveBeenCalled();
});

it("keeps deck Save semantics when the discovered item is already stored", async () => {
  jest.mocked(loadDiscovery).mockResolvedValue([arrival, moonlight]);
  jest.mocked(listSaved).mockResolvedValue([{
    ...arrival,
    category: "movies",
    savedAt: 1,
  }]);

  render(<HomeScreen />);
  await waitFor(() => expect(listSaved).toHaveBeenCalledTimes(1));
  fireEvent.press(screen.getByRole("button", { name: "Movies" }));
  fireEvent.press(screen.getByRole("button", { name: "Surprise me with a movie" }));
  fireEvent.press(await screen.findByRole("button", { name: /Movies\. Arrival/ }));

  const sheet = await screen.findByTestId("detail-sheet-surface");
  expect(within(sheet).getByRole("button", { name: "Save" })).toBeTruthy();
  expect(within(sheet).queryByRole("button", { name: "Remove from saved" })).toBeNull();

  fireEvent.press(within(sheet).getByRole("button", { name: "Save" }));

  await waitFor(() => expect(addSaved).toHaveBeenCalledWith("movies", arrival));
  expect(removeSaved).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.queryByTestId("detail-sheet-surface")).toBeNull());
  await waitFor(() => expect(deckFocusMock()).toHaveBeenCalledTimes(1));
});

it("does not restore focus from a slow Save behind a newer detail", async () => {
  const pendingSave = deferred<Awaited<ReturnType<typeof addSaved>>>();
  jest.mocked(loadDiscovery).mockResolvedValue([arrival, moonlight]);
  jest.mocked(addSaved).mockReturnValueOnce(pendingSave.promise);

  render(<HomeScreen />);
  fireEvent.press(screen.getByRole("button", { name: "Movies" }));
  fireEvent.press(screen.getByRole("button", { name: "Surprise me with a movie" }));
  fireEvent.press(await screen.findByRole("button", { name: /Movies\. Arrival/ }));

  const arrivalSheet = await screen.findByTestId("detail-sheet-surface");
  fireEvent.press(within(arrivalSheet).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(addSaved).toHaveBeenCalledTimes(1));

  fireEvent.press(await screen.findByRole("button", { name: /Movies\. Moonlight/ }));
  await waitFor(() =>
    expect(screen.getByTestId("detail-sheet-surface").props.accessibilityLabel).toBe(
      "Moonlight details"
    )
  );

  await act(async () => {
    pendingSave.resolve([{
      ...arrival,
      category: "movies",
      savedAt: 1,
    }]);
    await pendingSave.promise;
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  expect(deckFocusMock()).not.toHaveBeenCalled();
  expect(screen.getByTestId("detail-sheet-surface").props.accessibilityLabel).toBe(
    "Moonlight details"
  );
});

it("does not restore focus from a slow Similar request after category navigation", async () => {
  const pendingSimilar = deferred<ResultItem[]>();
  jest.mocked(loadDiscovery).mockImplementation((input) =>
    input.mode === "similar" ? pendingSimilar.promise : Promise.resolve([arrival])
  );

  render(<HomeScreen />);
  fireEvent.press(screen.getByRole("button", { name: "Movies" }));
  fireEvent.press(screen.getByRole("button", { name: "Surprise me with a movie" }));
  fireEvent.press(await screen.findByRole("button", { name: /Movies\. Arrival/ }));

  const sheet = await screen.findByTestId("detail-sheet-surface");
  fireEvent.press(within(sheet).getByRole("button", { name: "Similar" }));
  await waitFor(() => expect(loadDiscovery).toHaveBeenCalledTimes(2));

  fireEvent.press(
    screen.getByRole("button", { name: "Change category. Movies selected" })
  );
  fireEvent.press(screen.getByRole("button", { name: "Books" }));
  expect(
    screen.getByRole("button", { name: "Change category. Books selected" })
  ).toBeTruthy();
  fireEvent.press(screen.getByRole("button", { name: "Surprise me with a book" }));
  await screen.findByRole("button", { name: /Books\. Arrival/ });

  await act(async () => {
    pendingSimilar.resolve([moonlight]);
    await pendingSimilar.promise;
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  expect(deckFocusMock()).not.toHaveBeenCalled();
});
