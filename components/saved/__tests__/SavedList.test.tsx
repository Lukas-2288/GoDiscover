import { fireEvent, render, screen } from "@testing-library/react-native";

import { darkPalette } from "../../../lib/theme";
import type { SavedItem } from "../../../lib/storage/saved";
import { SavedList } from "../SavedList";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("@expo/vector-icons/AntDesign", () => "AntDesign");

/**
 * The list that replaced the Saved Atlas.
 *
 * Two things it has to get right that the map did not. On web it is the *only*
 * way to reach saved items — the atlas was, and there is no bookmark sheet
 * there — so an item that cannot be found here cannot be found at all. And
 * saved items are the best similarity seeds in the app, which is why Similar
 * is on the row rather than two taps away inside the detail sheet.
 */

function saved(
  id: string,
  category: SavedItem["category"],
  savedAt: number,
  overrides: Partial<SavedItem> = {}
): SavedItem {
  return {
    id,
    category,
    title: id,
    subtitle: "Subtitle",
    meta: "2016",
    savedAt,
    ...overrides,
  };
}

function renderList(items: SavedItem[], overrides: Partial<React.ComponentProps<typeof SavedList>> = {}) {
  const props = {
    items,
    palette: darkPalette,
    onOpen: jest.fn(),
    onSimilar: jest.fn(),
    onRemove: jest.fn(),
    ...overrides,
  };
  render(<SavedList {...props} />);
  return props;
}

it("groups saved items under their category", () => {
  renderList([
    saved("Arrival", "movies", 3),
    saved("Kindred", "books", 2),
    saved("Dummy", "albums", 1),
  ]);

  expect(screen.getByText("Movies")).toBeTruthy();
  expect(screen.getByText("Books")).toBeTruthy();
  expect(screen.getByText("Albums")).toBeTruthy();
  // Nothing saved under Artists, so that section is absent rather than empty.
  expect(screen.queryByText("Artists")).toBeNull();
});

it("counts each section", () => {
  renderList([
    saved("Arrival", "movies", 3),
    saved("Moonlight", "movies", 2),
    saved("Kindred", "books", 1),
  ]);

  expect(screen.getByText("2")).toBeTruthy();
  expect(screen.getByText("1")).toBeTruthy();
});

it("puts the most recently saved first within a section", () => {
  renderList([
    saved("Older", "movies", 1),
    saved("Newest", "movies", 9),
    saved("Middle", "movies", 5),
  ]);

  const titles = screen
    .getAllByRole("button", { name: /^Open .* details$/ })
    .map((button) => button.props.accessibilityLabel);
  expect(titles).toEqual([
    "Open Newest details",
    "Open Middle details",
    "Open Older details",
  ]);
});

it.each([
  ["Open Arrival details", "onOpen"],
  ["Find movies similar to Arrival", "onSimilar"],
  ["Remove Arrival from saved discoveries", "onRemove"],
] as const)("routes %s to its own handler", (label, handler) => {
  const item = saved("Arrival", "movies", 1);
  const props = renderList([item]);

  fireEvent.press(screen.getByRole("button", { name: label }));

  expect(props[handler]).toHaveBeenCalledWith(item);
  // Each action is distinct: pressing one must not fire the others.
  for (const other of ["onOpen", "onSimilar", "onRemove"] as const) {
    if (other !== handler) expect(props[other]).not.toHaveBeenCalled();
  }
});

it("keeps every row action at the 44 point touch target", () => {
  renderList([saved("Arrival", "movies", 1)]);

  for (const label of [
    "Open Arrival details",
    "Find movies similar to Arrival",
    "Remove Arrival from saved discoveries",
  ]) {
    const button = screen.getByRole("button", { name: label });
    const style = button.props.style;
    const flattened = typeof style === "function" ? style({ pressed: false }) : style;
    const merged = Array.isArray(flattened)
      ? Object.assign({}, ...flattened.filter(Boolean))
      : flattened;
    expect(merged.minHeight).toBeGreaterThanOrEqual(44);
  }
});

// Artists carry an empty `meta`, which used to render as a stranded separator.
it("does not leave a dangling separator when an item has no meta", () => {
  renderList([saved("Portishead", "artists", 1, { subtitle: "Artist", meta: "" })]);

  expect(screen.getByText("Artist")).toBeTruthy();
  expect(screen.queryByText("Artist · ")).toBeNull();
});

it("joins subtitle and meta when both are present", () => {
  renderList([
    saved("Arrival", "movies", 1, { subtitle: "Denis Villeneuve", meta: "2016" }),
  ]);

  expect(screen.getByText("Denis Villeneuve · 2016")).toBeTruthy();
});

it("falls back to an initial when an item has no artwork", () => {
  renderList([saved("Arrival", "movies", 1, { imageUrl: undefined })]);

  expect(screen.getByText("A")).toBeTruthy();
});

it("disables every action while a mutation is in flight", () => {
  const props = renderList([saved("Arrival", "movies", 1)], { busy: true });

  fireEvent.press(screen.getByRole("button", { name: "Open Arrival details" }));
  fireEvent.press(
    screen.getByRole("button", { name: "Remove Arrival from saved discoveries" })
  );

  expect(props.onOpen).not.toHaveBeenCalled();
  expect(props.onRemove).not.toHaveBeenCalled();
});

it("renders nothing rather than empty sections when there is nothing saved", () => {
  renderList([]);

  for (const label of ["Movies", "Books", "Albums", "Artists"]) {
    expect(screen.queryByText(label)).toBeNull();
  }
});
