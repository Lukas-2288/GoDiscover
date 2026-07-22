import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import type { MovieDetail, ResultItem } from "../../types/content";

jest.mock(
  "@react-native-async-storage/async-storage",
  () => require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("@expo/vector-icons/AntDesign", () => "AntDesign");
jest.mock("@expo/vector-icons/FontAwesome", () => "FontAwesome");

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
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function deckFocusMock(): jest.Mock {
  return (
    jest.requireMock("../../components/discovery/SwipeDeck") as {
      deckFocus: jest.Mock;
    }
  ).deckFocus;
}

function flattenedStyle(element: { props: { style: unknown } }) {
  const style = element.props.style;
  return StyleSheet.flatten(
    typeof style === "function" ? style({ pressed: false }) : style
  );
}

function expectMinimumTarget(element: { props: { style: unknown } }) {
  const style = flattenedStyle(element);
  expect(style.minHeight ?? style.height).toBeGreaterThanOrEqual(44);
  expect(style.minWidth ?? style.width).toBeGreaterThanOrEqual(44);
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

it("gives every header action an explicit name and 44-point target", async () => {
  render(<HomeScreen />);
  await act(async () => undefined);

  [
    screen.getByRole("button", { name: "Open account" }),
    screen.getByRole("button", { name: "Open saved discoveries" }),
    screen.getByRole("button", { name: "How to use GoDiscover" }),
  ].forEach(expectMinimumTarget);
});

it("keeps saved-item details and removal as separate functional actions", async () => {
  jest.mocked(listSaved).mockResolvedValue([{
    ...arrival,
    category: "movies",
    savedAt: 1,
  }]);

  render(<HomeScreen />);
  await waitFor(() => expect(listSaved).toHaveBeenCalledTimes(1));
  fireEvent.press(
    screen.getByRole("button", { name: "Open saved discoveries" })
  );

  const openDetails = screen.getByRole("button", {
    name: "Open Arrival details",
  });
  expect(
    within(openDetails).queryAllByRole("button", {
      name: "Remove Arrival from saved discoveries",
    })
  ).toHaveLength(0);
  const remove = screen.getByRole("button", {
    name: "Remove Arrival from saved discoveries",
  });
  expect(remove).toBeTruthy();

  fireEvent.press(openDetails);
  expect(await screen.findByTestId("detail-sheet-surface")).toBeTruthy();
  fireEvent.press(screen.getByRole("button", { name: "Close details" }));

  fireEvent.press(
    screen.getByRole("button", { name: "Open saved discoveries" })
  );
  fireEvent.press(
    screen.getByRole("button", {
      name: "Remove Arrival from saved discoveries",
    })
  );
  await waitFor(() =>
    expect(removeSaved).toHaveBeenCalledWith("movies", "329865")
  );
});

it("keeps all three labeled deck actions available without gesture input", async () => {
  render(<HomeScreen />);
  fireEvent.press(screen.getByRole("button", { name: "Movies" }));
  fireEvent.press(screen.getByRole("button", { name: "Surprise me with a movie" }));
  await waitFor(() => expect(screen.getByText("Arrival")).toBeTruthy());
  expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Not for me" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Find similar" })).toBeTruthy();
});

it("renders a safe discovery error without provider or credential details", async () => {
  const warning = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  jest
    .mocked(loadDiscovery)
    .mockRejectedValueOnce(new Error("Discogs 401: Invalid consumer token"));

  render(<HomeScreen />);
  fireEvent.press(screen.getByRole("button", { name: "Albums" }));
  fireEvent.press(screen.getByRole("button", { name: "Surprise me with an album" }));

  expect(
    await screen.findByText(
      "Couldn't load albums. Check your connection and try again."
    )
  ).toBeTruthy();
  expect(screen.queryByText(/Discogs/i)).toBeNull();
  expect(screen.queryByText(/401/i)).toBeNull();
  expect(screen.queryByText(/token/i)).toBeNull();
  warning.mockRestore();
});

it("labels a temporary Similar deck and resets to unbiased Surprise Me", async () => {
  render(<HomeScreen />);
  fireEvent.press(screen.getByRole("button", { name: "Movies" }));
  fireEvent.press(screen.getByRole("button", { name: "Surprise me with a movie" }));
  await screen.findByText("Arrival");

  fireEvent.press(screen.getByRole("button", { name: "Find similar" }));

  expect(await screen.findByText("Similar to Arrival")).toBeTruthy();
  const reset = screen.getByRole("button", {
    name: "Back to unbiased Surprise Me",
  });
  expect(reset).toBeTruthy();
  fireEvent.press(reset);

  await waitFor(() => expect(screen.queryByText("Similar to Arrival")).toBeNull());
  expect(loadDiscovery).toHaveBeenLastCalledWith({
    category: "movies",
    mode: "randomize",
  });
});

it("exposes a 44-point detail close target and accessibility escape", async () => {
  render(<HomeScreen />);
  fireEvent.press(screen.getByRole("button", { name: "Movies" }));
  fireEvent.press(screen.getByRole("button", { name: "Surprise me with a movie" }));
  fireEvent.press(await screen.findByRole("button", { name: /Movies\. Arrival/ }));

  const surface = await screen.findByTestId("detail-sheet-surface");
  expectMinimumTarget(
    within(surface).getByRole("button", { name: "Close details" })
  );
  fireEvent(surface, "accessibilityEscape");
  await waitFor(() => expect(screen.queryByTestId("detail-sheet-surface")).toBeNull());
});

it("explains the four discovery steps and unbiased footer", async () => {
  render(<HomeScreen />);
  await act(async () => undefined);
  fireEvent.press(
    screen.getByRole("button", { name: "How to use GoDiscover" })
  );

  expect(screen.getByText("Choose your category")).toBeTruthy();
  expect(
    screen.getByText("Movies, Books, Artists, or Albums each has its own vibe.")
  ).toBeTruthy();
  expect(screen.getByText("Let it surprise you")).toBeTruthy();
  expect(
    screen.getByText("Surprise Me stays random; Search and Filter are optional.")
  ).toBeTruthy();
  expect(screen.getByText("Make your move")).toBeTruthy();
  expect(
    screen.getByText(
      "Swipe right to Save or left for Not for me. The labeled buttons do the same thing."
    )
  ).toBeTruthy();
  expect(screen.getByText("Follow a spark")).toBeTruthy();
  expect(
    screen.getByText(
      "Similar makes a temporary related deck only when you ask for it."
    )
  ).toBeTruthy();
  expect(
    screen.getByText("Your saves and skips never train Surprise Me.")
  ).toBeTruthy();
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

  await waitFor(() => expect(addSaved).not.toHaveBeenCalled());
  expect(removeSaved).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.queryByTestId("detail-sheet-surface")).toBeNull());
  await waitFor(() => expect(deckFocusMock()).toHaveBeenCalledTimes(1));
});

it("does not remove a pre-existing saved discovery after deck Save", async () => {
  const existing = { ...arrival, category: "movies" as const, savedAt: 1 };
  jest.mocked(loadDiscovery).mockResolvedValue([arrival, moonlight]);
  jest.mocked(listSaved).mockResolvedValue([existing]);

  render(<HomeScreen />);
  await waitFor(() => expect(listSaved).toHaveBeenCalled());
  fireEvent.press(screen.getByRole("button", { name: "Movies" }));
  fireEvent.press(screen.getByRole("button", { name: "Surprise me with a movie" }));
  fireEvent.press(await screen.findByRole("button", { name: "Save" }));

  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull()
  );
  expect(removeSaved).not.toHaveBeenCalled();
});

it("shows stable feedback when a Saved-sheet removal fails", async () => {
  jest.mocked(listSaved).mockResolvedValue([{
    ...arrival,
    category: "movies",
    savedAt: 1,
  }]);
  jest
    .mocked(removeSaved)
    .mockRejectedValueOnce(new Error("Supabase delete token expired"));

  render(<HomeScreen />);
  await waitFor(() => expect(listSaved).toHaveBeenCalled());
  fireEvent.press(screen.getByRole("button", { name: "Open saved discoveries" }));
  const savedDialog = screen.getByLabelText("Saved discoveries");
  fireEvent.press(
    within(savedDialog).getByRole("button", {
      name: "Remove Arrival from saved discoveries",
    })
  );

  expect(
    await within(savedDialog).findByRole("alert", {
      name: "Couldn't update saved discoveries. Try again.",
    })
  ).toBeTruthy();
  expect(screen.queryByText(/Supabase|token|expired/i)).toBeNull();

  fireEvent.press(
    within(savedDialog).getByRole("button", { name: "Close saved discoveries" })
  );
  await waitFor(() =>
    expect(
      screen.queryByText("Couldn't update saved discoveries. Try again.")
    ).toBeNull()
  );
});

it("shows stored-detail mutation failures inside the active detail sheet", async () => {
  jest.mocked(listSaved).mockResolvedValue([{
    ...arrival,
    category: "movies",
    savedAt: 1,
  }]);
  jest.mocked(removeSaved).mockRejectedValueOnce(new Error("private delete detail"));

  render(<HomeScreen />);
  await waitFor(() => expect(listSaved).toHaveBeenCalled());
  fireEvent.press(screen.getByRole("button", { name: "Open saved discoveries" }));
  fireEvent.press(screen.getByRole("button", { name: "Open Arrival details" }));
  const detailSheet = await screen.findByTestId("detail-sheet-surface");
  fireEvent.press(
    within(detailSheet).getByRole("button", { name: "Remove from saved" })
  );

  expect(
    await within(detailSheet).findByRole("alert", {
      name: "Couldn't update saved discoveries. Try again.",
    })
  ).toBeTruthy();

  fireEvent.press(within(detailSheet).getByRole("button", { name: "Close details" }));
  await waitFor(() =>
    expect(
      screen.queryByText("Couldn't update saved discoveries. Try again.")
    ).toBeNull()
  );
});

it("does not let a dismissed Saved-sheet failure suppress a later deck Undo", async () => {
  jest.mocked(loadDiscovery).mockResolvedValue([moonlight]);
  jest.mocked(listSaved).mockResolvedValue([{
    ...arrival,
    category: "movies",
    savedAt: 1,
  }]);
  jest.mocked(removeSaved).mockRejectedValueOnce(new Error("private delete detail"));

  render(<HomeScreen />);
  await waitFor(() => expect(listSaved).toHaveBeenCalled());
  fireEvent.press(screen.getByRole("button", { name: "Open saved discoveries" }));
  const savedDialog = screen.getByLabelText("Saved discoveries");
  fireEvent.press(
    within(savedDialog).getByRole("button", {
      name: "Remove Arrival from saved discoveries",
    })
  );
  await within(savedDialog).findByText(
    "Couldn't update saved discoveries. Try again."
  );
  fireEvent.press(
    within(savedDialog).getByRole("button", { name: "Close saved discoveries" })
  );

  fireEvent.press(screen.getByRole("button", { name: "Movies" }));
  fireEvent.press(screen.getByRole("button", { name: "Surprise me with a movie" }));
  fireEvent.press(await screen.findByRole("button", { name: "Save" }));

  expect(await screen.findByRole("button", { name: "Undo" })).toBeTruthy();
  expect(screen.getByText("Saved Moonlight")).toBeTruthy();
});

it("keeps a newer Saved-sheet success from being overwritten by an older failure", async () => {
  const firstRemoval = deferred<Awaited<ReturnType<typeof removeSaved>>>();
  const secondRemoval = deferred<Awaited<ReturnType<typeof removeSaved>>>();
  jest.mocked(listSaved).mockResolvedValue([{
    ...arrival,
    category: "movies",
    savedAt: 1,
  }]);
  jest
    .mocked(removeSaved)
    .mockReturnValueOnce(firstRemoval.promise)
    .mockReturnValueOnce(secondRemoval.promise);

  render(<HomeScreen />);
  await waitFor(() => expect(listSaved).toHaveBeenCalled());
  fireEvent.press(screen.getByRole("button", { name: "Open saved discoveries" }));
  const savedDialog = screen.getByLabelText("Saved discoveries");
  const remove = within(savedDialog).getByRole("button", {
    name: "Remove Arrival from saved discoveries",
  });
  fireEvent.press(remove);
  fireEvent.press(remove);

  await act(async () => {
    firstRemoval.reject(new Error("older private failure"));
    await firstRemoval.promise.catch(() => undefined);
  });
  await waitFor(() => expect(removeSaved).toHaveBeenCalledTimes(2));
  expect(
    within(savedDialog).queryByText(
      "Couldn't update saved discoveries. Try again."
    )
  ).toBeNull();

  await act(async () => {
    secondRemoval.resolve([]);
    await secondRemoval.promise;
  });
  await waitFor(() =>
    expect(
      screen.queryByText("Couldn't update saved discoveries. Try again.")
    ).toBeNull()
  );
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
