import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react-native";
import {
  AccessibilityInfo,
  Alert,
  Modal,
  Platform,
  StyleSheet,
} from "react-native";

import type { MovieDetail, ResultItem } from "../../types/content";

let mockAuthStateChangeHandler:
  | ((event: string, session: unknown) => Promise<void>)
  | null = null;

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

jest.mock("../../lib/storage/discoveryMap", () => ({
  loadMapSnapshot: jest.fn(async () => ({ version: 1, nodes: [], edges: [] })),
  recordMapTrailEvent: jest.fn(async () => undefined),
}));

jest.mock("../../lib/storage/discoveryTrailSync", () => ({
  syncDiscoveryTrailEvents: jest.fn(async () => []),
}));

jest.mock("../../lib/storage/recents", () => ({
  listRecents: jest.fn(async () => []),
  addRecent: jest.fn(async () => []),
}));

jest.mock("../../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: jest.fn((handler) => {
        mockAuthStateChangeHandler = handler;
        return {
          data: { subscription: { unsubscribe: jest.fn() } },
        };
      }),
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
import { signInWithGoogle } from "../../lib/auth/oauth";
import { loadDetail } from "../../lib/discovery/loadDetail";
import { loadDiscovery } from "../../lib/discovery/loadDiscovery";
import {
  addSaved,
  listSaved,
  removeSaved,
  syncLocalToCloud,
} from "../../lib/storage/saved";
import { supabase } from "../../lib/supabase";
import {
  loadMapSnapshot,
  recordMapTrailEvent,
} from "../../lib/storage/discoveryMap";
import HomeScreen from "../index";

const SAVED_MUTATION_ERROR = "Couldn't update saved discoveries. Try again.";
const DECK_SAVE_ERROR = "Couldn't save that one. It's back in your deck.";
const originalPlatform = Platform.OS;

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

function spyOnIOSAnnouncements() {
  Object.defineProperty(Platform, "OS", { configurable: true, value: "ios" });
  return jest
    .spyOn(AccessibilityInfo, "announceForAccessibility")
    .mockImplementation(() => undefined);
}

function countSavedMutationAnnouncements(
  announce: jest.SpyInstance<void, [string]>
): number {
  return announce.mock.calls.filter(
    ([message]) => message === SAVED_MUTATION_ERROR
  ).length;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthStateChangeHandler = null;
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

afterEach(() => {
  Object.defineProperty(Platform, "OS", {
    configurable: true,
    value: originalPlatform,
  });
  jest.restoreAllMocks();
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

it("serializes initial saved hydration before a later deck Save", async () => {
  const pendingHydration = deferred<Awaited<ReturnType<typeof listSaved>>>();
  jest
    .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockResolvedValue(true);
  jest
    .mocked(listSaved)
    .mockReturnValueOnce(pendingHydration.promise)
    .mockResolvedValueOnce([]);

  render(<HomeScreen />);
  await waitFor(() => expect(listSaved).toHaveBeenCalledTimes(1));
  fireEvent.press(screen.getByRole("button", { name: "Movies" }));
  fireEvent.press(screen.getByRole("button", { name: "Surprise me with a movie" }));
  fireEvent.press(await screen.findByRole("button", { name: "Save" }));

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  const saveStartedBeforeHydration = jest.mocked(addSaved).mock.calls.length > 0;

  await act(async () => {
    pendingHydration.resolve([]);
    await pendingHydration.promise;
  });
  await waitFor(() => expect(addSaved).toHaveBeenCalledTimes(1));

  expect(saveStartedBeforeHydration).toBe(false);
  fireEvent.press(
    screen.getByRole("button", { name: "Open saved discoveries" })
  );
  expect(screen.getByRole("button", { name: "Open Arrival details" })).toBeTruthy();
});

it("serializes authenticated saved refresh before a later deck Save", async () => {
  const pendingAuthRefresh = deferred<Awaited<ReturnType<typeof listSaved>>>();
  jest
    .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockResolvedValue(true);
  jest.mocked(supabase.auth.getSession).mockResolvedValueOnce({
    data: {
      session: {
        user: {
          id: "account-1",
          email: "reader@example.com",
          user_metadata: {},
        },
      },
    },
  } as any);
  jest
    .mocked(listSaved)
    .mockResolvedValueOnce([])
    .mockReturnValueOnce(pendingAuthRefresh.promise)
    .mockResolvedValueOnce([]);

  render(<HomeScreen />);
  await waitFor(() => expect(listSaved).toHaveBeenCalledTimes(2));
  fireEvent.press(screen.getByRole("button", { name: "Movies" }));
  fireEvent.press(screen.getByRole("button", { name: "Surprise me with a movie" }));
  fireEvent.press(await screen.findByRole("button", { name: "Save" }));

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  const saveStartedBeforeRefresh = jest.mocked(addSaved).mock.calls.length > 0;

  await act(async () => {
    pendingAuthRefresh.resolve([]);
    await pendingAuthRefresh.promise;
  });
  await waitFor(() => expect(addSaved).toHaveBeenCalledTimes(1));

  expect(saveStartedBeforeRefresh).toBe(false);
  fireEvent.press(
    screen.getByRole("button", { name: "Open saved discoveries" })
  );
  expect(screen.getByRole("button", { name: "Open Arrival details" })).toBeTruthy();
});

it.each([
  ["How to Use", "How to use GoDiscover"],
  ["Saved", "Open saved discoveries"],
  ["Account", "Open account"],
])(
  "disables the %s modal transition when reduced motion is enabled",
  async (_modalName, buttonName) => {
    jest
      .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
      .mockResolvedValue(true);
    const rendered = render(<HomeScreen />);
    await waitFor(() =>
      expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalled()
    );

    fireEvent.press(screen.getByRole("button", { name: buttonName }));

    await waitFor(() => {
      const visibleModal = rendered
        .UNSAFE_getAllByType(Modal)
        .find((modal) => modal.props.visible);
      expect(visibleModal?.props.animationType).toBe("none");
    });
  }
);

it("shows stable auth-submit feedback without raw provider details", async () => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  jest.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
    error: new Error("Supabase service_role=private-auth-secret"),
  } as any);

  render(<HomeScreen />);
  fireEvent.press(screen.getByRole("button", { name: "Open account" }));
  fireEvent.changeText(screen.getByLabelText("Email"), "reader@example.com");
  fireEvent.changeText(screen.getByLabelText("Password"), "password");
  fireEvent.press(screen.getByRole("button", { name: "Sign in" }));

  await waitFor(() =>
    expect(alert).toHaveBeenCalledWith(
      "Couldn't sign in",
      "Check your details and try again."
    )
  );
  expect(JSON.stringify(alert.mock.calls)).not.toMatch(
    /Supabase|service_role|private-auth-secret/i
  );
});

it("shows stable display-name feedback without raw provider details", async () => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  jest.mocked(supabase.auth.getSession).mockResolvedValueOnce({
    data: {
      session: {
        user: {
          id: "account-1",
          email: "reader@example.com",
          user_metadata: { display_name: "Reader" },
        },
      },
    },
  } as any);
  jest.mocked(supabase.auth.updateUser).mockResolvedValueOnce({
    error: new Error("PostgREST bearer private-profile-token"),
  } as any);

  render(<HomeScreen />);
  fireEvent.press(screen.getByRole("button", { name: "Open account" }));
  const displayName = await screen.findByLabelText("Display name");
  fireEvent.changeText(displayName, "New Reader");
  fireEvent.press(screen.getByRole("button", { name: "Save display name" }));

  await waitFor(() =>
    expect(alert).toHaveBeenCalledWith(
      "Couldn't save name",
      "Try again in a moment."
    )
  );
  expect(JSON.stringify(alert.mock.calls)).not.toMatch(
    /PostgREST|bearer|private-profile-token/i
  );
});

it("shows stable Google feedback without raw provider details", async () => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  jest
    .mocked(signInWithGoogle)
    .mockRejectedValueOnce(new Error("Google OAuth client_secret=private-google"));

  render(<HomeScreen />);
  fireEvent.press(screen.getByRole("button", { name: "Open account" }));
  fireEvent.press(screen.getByRole("button", { name: "Continue with Google" }));

  await waitFor(() =>
    expect(alert).toHaveBeenCalledWith(
      "Google sign-in failed",
      "Try again in a moment."
    )
  );
  expect(JSON.stringify(alert.mock.calls)).not.toMatch(
    /Google OAuth|client_secret|private-google/i
  );
});

it("keeps cancelled Google sign-in silent", async () => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  jest
    .mocked(signInWithGoogle)
    .mockRejectedValueOnce(new Error("Sign-in cancelled"));

  render(<HomeScreen />);
  fireEvent.press(screen.getByRole("button", { name: "Open account" }));
  fireEvent.press(screen.getByRole("button", { name: "Continue with Google" }));

  await waitFor(() => expect(signInWithGoogle).toHaveBeenCalledTimes(1));
  await act(async () => undefined);
  expect(alert).not.toHaveBeenCalled();
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

  // The reset resolves through a promise chain, so flush it inside act before
  // asserting — waitFor alone polls a tree that has not re-rendered yet.
  await act(async () => {
    await Promise.resolve();
  });
  await waitFor(() => expect(screen.queryByText(/to Arrival$/)).toBeNull());
  // Background top-ups also call loadDiscovery, so assert the randomize was
  // requested rather than that it was the most recent call.
  expect(
    jest.mocked(loadDiscovery).mock.calls.map(([input]) => input)
  ).toContainEqual({ category: "movies", mode: "randomize" });
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
  // Counting calls is not meaningful now that the deck tops itself up in the
  // background; what matters is that no Similar request happened unprompted.
  expect(
    jest.mocked(loadDiscovery).mock.calls.map(([input]) => input)
  ).toContainEqual({ category: "movies", mode: "randomize" });
  expect(
    jest.mocked(loadDiscovery).mock.calls.filter(([input]) => input.mode === "similar")
  ).toHaveLength(0);
  expect(getSimilarMovies).not.toHaveBeenCalled();

  fireEvent.press(screen.getByRole("button", { name: "Similar" }));

  await waitFor(() =>
    expect(
      jest.mocked(loadDiscovery).mock.calls.filter(([input]) => input.mode === "similar")
    ).not.toHaveLength(0)
  );
  expect(
    jest.mocked(loadDiscovery).mock.calls
      .map(([input]) => input)
      .filter((input) => input.mode === "similar")
  ).toContainEqual({
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
  const announce = spyOnIOSAnnouncements();
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
  expect(countSavedMutationAnnouncements(announce)).toBe(1);

  fireEvent.press(
    within(savedDialog).getByRole("button", { name: "Close saved discoveries" })
  );
  await waitFor(() =>
    expect(
      screen.queryByText("Couldn't update saved discoveries. Try again.")
    ).toBeNull()
  );
});

it("keeps deck and Saved-sheet iOS error announcements independent", async () => {
  const announce = spyOnIOSAnnouncements();
  jest.mocked(loadDiscovery).mockResolvedValue([moonlight]);
  jest.mocked(listSaved).mockResolvedValue([{
    ...arrival,
    category: "movies",
    savedAt: 1,
  }]);
  jest.mocked(addSaved).mockRejectedValueOnce(new Error("private save detail"));
  jest.mocked(removeSaved).mockRejectedValueOnce(new Error("private delete detail"));

  render(<HomeScreen />);
  fireEvent.press(screen.getByRole("button", { name: "Movies" }));
  fireEvent.press(screen.getByRole("button", { name: "Surprise me with a movie" }));
  fireEvent.press(await screen.findByRole("button", { name: "Save" }));

  await waitFor(() =>
    expect(announce).toHaveBeenCalledWith(DECK_SAVE_ERROR)
  );
  expect(
    announce.mock.calls.filter(([message]) => message === DECK_SAVE_ERROR)
  ).toHaveLength(1);

  fireEvent.press(screen.getByRole("button", { name: "Open saved discoveries" }));
  const savedDialog = screen.getByLabelText("Saved discoveries");
  fireEvent.press(
    within(savedDialog).getByRole("button", {
      name: "Remove Arrival from saved discoveries",
    })
  );
  await within(savedDialog).findByRole("alert", { name: SAVED_MUTATION_ERROR });
  fireEvent.press(
    within(savedDialog).getByRole("button", { name: "Close saved discoveries" })
  );

  await waitFor(() => {
    expect(
      announce.mock.calls.filter(([message]) => message === DECK_SAVE_ERROR)
    ).toHaveLength(1);
    expect(countSavedMutationAnnouncements(announce)).toBe(1);
  });
});

it("shows stored-detail mutation failures inside the active detail sheet", async () => {
  const announce = spyOnIOSAnnouncements();
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
  expect(countSavedMutationAnnouncements(announce)).toBe(1);

  fireEvent.press(within(detailSheet).getByRole("button", { name: "Close details" }));
  await waitFor(() =>
    expect(
      screen.queryByText("Couldn't update saved discoveries. Try again.")
    ).toBeNull()
  );
});

it("shows and announces saved-sync failures in the Account modal", async () => {
  const announce = spyOnIOSAnnouncements();
  jest
    .mocked(syncLocalToCloud)
    .mockRejectedValueOnce(new Error("private auth sync token"));

  render(<HomeScreen />);
  await waitFor(() => expect(mockAuthStateChangeHandler).not.toBeNull());

  await act(async () => {
    const handler = mockAuthStateChangeHandler;
    if (!handler) throw new Error("Auth listener was not registered");
    await handler("SIGNED_IN", {
      user: { id: "account-1", email: "reader@example.com", user_metadata: {} },
    });
  });

  const accountDialog = await screen.findByLabelText("Account");
  expect(
    within(accountDialog).getByRole("alert", {
      name: SAVED_MUTATION_ERROR,
    })
  ).toBeTruthy();
  expect(screen.queryByText(/private|token/i)).toBeNull();
  expect(countSavedMutationAnnouncements(announce)).toBe(1);

  fireEvent.press(
    within(accountDialog).getByRole("button", { name: "Close account" })
  );
  await waitFor(() => expect(screen.queryByText(SAVED_MUTATION_ERROR)).toBeNull());
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
  // Background top-ups also call loadDiscovery, so wait on the Similar request
  // itself rather than a total count.
  await waitFor(() =>
    expect(
      jest.mocked(loadDiscovery).mock.calls.filter(([input]) => input.mode === "similar")
    ).not.toHaveLength(0)
  );

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

// ── Deck states between "there is a card" and "there is nothing" ────────────
//
// The deck refills in the background once it drops to two cards. If the last
// card is committed before that lands, the queue is empty while the session
// status is still "ready" — which matched none of the screen's render branches
// and left the user staring at blank space. These two tests cover the gap from
// both ends: the refill still running, and the refill having come back empty.

it("says it is fetching while the deck refills, instead of going blank", async () => {
  const pendingTopUp = deferred<ResultItem[]>();
  jest
    .mocked(loadDiscovery)
    .mockResolvedValueOnce([arrival])
    .mockReturnValueOnce(pendingTopUp.promise);

  render(<HomeScreen />);
  fireEvent.press(screen.getByRole("button", { name: "Movies" }));
  fireEvent.press(screen.getByRole("button", { name: "Surprise me with a movie" }));
  fireEvent.press(await screen.findByRole("button", { name: "Not for me" }));

  expect(await screen.findByText("Lining up the next movie...")).toBeTruthy();

  await act(async () => {
    pendingTopUp.resolve([moonlight]);
    await pendingTopUp.promise;
  });
  await waitFor(() =>
    expect(screen.queryByText("Lining up the next movie...")).toBeNull()
  );
});

it("names the end of the shelf once a refill comes back empty", async () => {
  jest
    .mocked(loadDiscovery)
    .mockResolvedValueOnce([arrival])
    .mockResolvedValue([]);

  render(<HomeScreen />);
  fireEvent.press(screen.getByRole("button", { name: "Movies" }));
  fireEvent.press(screen.getByRole("button", { name: "Surprise me with a movie" }));
  fireEvent.press(await screen.findByRole("button", { name: "Not for me" }));

  // Distinct from the "No movies found" empty state: this one says the path is
  // finished rather than inviting the same request again.
  expect(
    await screen.findByText(
      "You've seen every movie we can find down this path."
    )
  ).toBeTruthy();
  expect(
    screen.getByText("Try another category, or loosen your filters.")
  ).toBeTruthy();
});

it("takes its top and bottom padding from the device's safe area", async () => {
  render(<HomeScreen />);
  await act(async () => undefined);

  const insets = (global as unknown as {
    __MOCK_SAFE_AREA_INSETS__: { bottom: number; top: number };
  }).__MOCK_SAFE_AREA_INSETS__;
  const topBar = StyleSheet.flatten(
    screen.getByTestId("top-bar").props.style
  );
  const scrollContent = StyleSheet.flatten(
    screen.getByTestId("discovery-scroll").props.contentContainerStyle
  );

  // The old values were a hardcoded 54 and 40, right on exactly one handset.
  expect(topBar.paddingTop).toBe(insets.top + 12);
  expect(topBar.paddingTop).not.toBe(54);
  expect(scrollContent.paddingBottom).toBe(40 + insets.bottom);
});

// ── The archive landing ────────────────────────────────────────────────────
//
// The app used to open straight onto a category picker with no framing. The
// site opens on a hero that says what the place is; these lock in that the app
// now does the same, and that the hero steps aside once you are in the deck.

it("opens on the archive landing rather than a bare picker", async () => {
  render(<HomeScreen />);
  await act(async () => undefined);

  expect(screen.getByText("Find a new\nfavourite rabbit hole.")).toBeTruthy();
  expect(screen.getByText("01 / CHOOSE A DOOR")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Surprise me" })).toBeTruthy();
});

it("sends the hero's Surprise me straight into a deck", async () => {
  render(<HomeScreen />);
  await act(async () => undefined);

  fireEvent.press(screen.getByRole("button", { name: "Surprise me" }));

  expect(await screen.findByRole("button", { name: /Movies\. Arrival/ })).toBeTruthy();
});

it("clears the landing once a category is open, so the deck owns the screen", async () => {
  render(<HomeScreen />);
  await act(async () => undefined);
  fireEvent.press(screen.getByRole("button", { name: "Movies" }));
  await act(async () => undefined);

  expect(screen.queryByText("01 / CHOOSE A DOOR")).toBeNull();
  // The two Surprise buttons must never coexist: the hero's is labelled
  // "Surprise me" and the deck's "Surprise me with a movie", and an exact-match
  // query for the former would otherwise be ambiguous about which it found.
  expect(screen.queryByRole("button", { name: "Surprise me" })).toBeNull();
  expect(
    screen.getByRole("button", { name: "Surprise me with a movie" })
  ).toBeTruthy();
});

// ── The Saved Atlas ────────────────────────────────────────────────────────

it("opens the saved atlas from the saved sheet", async () => {
  jest.mocked(listSaved).mockResolvedValue([
    {
      category: "movies",
      id: "arrival",
      title: "Arrival",
      subtitle: "Denis Villeneuve",
      meta: "2016",
      savedAt: 1,
    },
  ] as never);
  jest.mocked(loadMapSnapshot).mockResolvedValue({
    version: 1,
    nodes: [
      {
        id: "movies:arrival",
        category: "movies",
        itemId: "arrival",
        title: "Arrival",
        subtitle: "Denis Villeneuve",
        meta: "2016",
        savedAt: 1,
        x: 0.4,
        y: 0.4,
      },
    ],
    edges: [],
  } as never);

  render(<HomeScreen />);
  await waitFor(() => expect(listSaved).toHaveBeenCalled());
  fireEvent.press(
    screen.getByRole("button", { name: "Open saved discoveries" })
  );
  fireEvent.press(await screen.findByRole("button", { name: "Open saved atlas" }));

  expect(await screen.findByLabelText("Saved atlas")).toBeTruthy();
  // The map and list views the website offers, both reachable.
  expect(screen.getByRole("tab", { name: "Map" })).toBeTruthy();
  expect(screen.getByRole("tab", { name: "List" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Fit view" })).toBeTruthy();
});

// Without this the phone's saves arrive on the map as unconnected nodes — the
// atlas would visibly fail to respond to its own app.
it("records the trail behind a save that followed a Similar request", async () => {
  // Similar has to return a *different* work, or the save is a trail from a
  // thing to itself, which the commit path deliberately declines to record.
  jest
    .mocked(loadDiscovery)
    .mockResolvedValueOnce([arrival])
    .mockResolvedValue([moonlight]);

  render(<HomeScreen />);
  fireEvent.press(screen.getByRole("button", { name: "Movies" }));
  fireEvent.press(screen.getByRole("button", { name: "Surprise me with a movie" }));

  // The deck's own control; the detail sheet's equivalent is labelled "Similar".
  fireEvent.press(await screen.findByRole("button", { name: "Find similar" }));
  await act(async () => undefined);
  fireEvent.press(await screen.findByRole("button", { name: "Save" }));

  await waitFor(() => expect(recordMapTrailEvent).toHaveBeenCalled());
  const [event] = jest.mocked(recordMapTrailEvent).mock.calls[0];
  expect(event.source).toEqual({ category: "movies", id: arrival.id });
  expect(event.target).toEqual({ category: "movies", id: moonlight.id });
});

it("does not record a trail for a save with nothing behind it", async () => {
  render(<HomeScreen />);
  fireEvent.press(screen.getByRole("button", { name: "Movies" }));
  fireEvent.press(screen.getByRole("button", { name: "Surprise me with a movie" }));
  fireEvent.press(await screen.findByRole("button", { name: "Save" }));

  await waitFor(() => expect(addSaved).toHaveBeenCalled());
  expect(recordMapTrailEvent).not.toHaveBeenCalled();
});
