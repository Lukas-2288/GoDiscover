import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

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

import HomeScreen from "../index";

it("moves from category selection to Surprise Me to one active deck card", async () => {
  render(<HomeScreen />);
  fireEvent.press(screen.getByRole("button", { name: "Movies" }));
  fireEvent.press(screen.getByRole("button", { name: "Surprise me with a movie" }));
  await waitFor(() => expect(screen.getByText("Arrival")).toBeTruthy());
  expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Not for me" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Find similar" })).toBeTruthy();
});
