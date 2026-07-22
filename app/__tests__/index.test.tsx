import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import type { MovieDetail } from "../../types/content";

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

jest.mock("../../lib/api/tmdb", () => ({
  getMovieDetail: jest.fn(async () => movieDetail),
  getSimilarMovies: jest.fn(),
}));

jest.mock("../../lib/discovery/loadDiscovery", () => {
  const actual = jest.requireActual("../../lib/discovery/loadDiscovery");
  return {
    ...actual,
    loadDiscovery: jest.fn(async () => [{
      id: "329865",
      title: "Arrival",
      subtitle: "2016",
      meta: "★ 8.0",
    }]),
  };
});

jest.mock("../../lib/discovery/loadDetail", () => {
  const actual = jest.requireActual("../../lib/discovery/loadDetail");
  return {
    ...actual,
    loadDetail: jest.fn(async () => ({ category: "movies", data: movieDetail })),
  };
});

import { getSimilarMovies } from "../../lib/api/tmdb";
import { loadDetail } from "../../lib/discovery/loadDetail";
import { loadDiscovery } from "../../lib/discovery/loadDiscovery";
import HomeScreen from "../index";

beforeEach(() => {
  jest.clearAllMocks();
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
