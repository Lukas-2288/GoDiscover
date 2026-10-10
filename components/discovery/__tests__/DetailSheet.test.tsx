import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { Linking, StyleSheet } from "react-native";

import { darkPalette } from "../../../lib/theme";
import type { BookDetail, MovieDetail, ResultItem } from "../../../types/content";
import { DetailSheet } from "../DetailSheet";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("@expo/vector-icons/FontAwesome", () => "FontAwesome");

const item: ResultItem = { id: "10", title: "Arrival", subtitle: "2016", meta: "★ 8.0" };

it("offers deck actions and an accessible close path for a deck item", () => {
  const onClose = jest.fn();
  const onSave = jest.fn();
  render(
    <DetailSheet
      visible
      selection={{ category: "movies", item, origin: "deck" }}
      detail={null}
      loading={false}
      errorMessage={null}
      saved={false}
      palette={darkPalette}
      reducedMotion
      onClose={onClose}
      onRetry={jest.fn()}
      onSave={onSave}
      onSkip={jest.fn()}
      onSimilar={jest.fn()}
      onShare={jest.fn()}
    />
  );
  expect(screen.getByTestId("detail-sheet-surface").props).toMatchObject({
    accessibilityLabel: "Arrival details",
    accessibilityViewIsModal: true,
    "aria-modal": true,
    role: "dialog",
  });
  fireEvent.press(screen.getByRole("button", { name: "Save" }));
  expect(onSave).toHaveBeenCalledWith(item);
  fireEvent.press(screen.getByRole("button", { name: "Close details" }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

it("keeps interactive descendants exposed instead of grouping the dialog surface", () => {
  render(
    <DetailSheet
      visible
      selection={{ category: "movies", item, origin: "deck" }}
      detail={null}
      loading={false}
      errorMessage="Couldn't load all the details. Try again."
      saved={false}
      palette={darkPalette}
      reducedMotion
      onClose={jest.fn()}
      onRetry={jest.fn()}
      onSave={jest.fn()}
      onSkip={jest.fn()}
      onSimilar={jest.fn()}
      onShare={jest.fn()}
    />
  );

  const surface = screen.getByTestId("detail-sheet-surface");
  expect(surface.props).toMatchObject({
    accessibilityLabel: "Arrival details",
    accessibilityViewIsModal: true,
    "aria-modal": true,
    role: "dialog",
  });
  expect(surface.props.accessible).not.toBe(true);
  expect(screen.getByRole("button", { name: "Close details" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Retry loading details" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Open JustWatch" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
});

it("does not let a stored item skip an unrelated active deck", () => {
  render(
    <DetailSheet
      visible
      selection={{ category: "movies", item, origin: "stored" }}
      detail={null}
      loading={false}
      errorMessage={null}
      saved
      palette={darkPalette}
      reducedMotion
      onClose={jest.fn()}
      onRetry={jest.fn()}
      onSave={jest.fn()}
      onSkip={jest.fn()}
      onSimilar={jest.fn()}
      onShare={jest.fn()}
    />
  );
  expect(screen.queryByRole("button", { name: "Not for me" })).toBeNull();
  expect(screen.getByRole("button", { name: "Remove from saved" })).toBeTruthy();
});

it("renders saved-mutation feedback inside the modal accessibility tree", () => {
  render(
    <DetailSheet
      visible
      selection={{ category: "movies", item, origin: "stored" }}
      detail={null}
      loading={false}
      errorMessage={null}
      savedMutationErrorMessage="Couldn't update saved discoveries. Try again."
      saved
      palette={darkPalette}
      reducedMotion
      onClose={jest.fn()}
      onRetry={jest.fn()}
      onSave={jest.fn()}
      onSkip={jest.fn()}
      onSimilar={jest.fn()}
      onShare={jest.fn()}
    />
  );

  const surface = screen.getByTestId("detail-sheet-surface");
  expect(
    within(surface).getByRole("alert", {
      name: "Couldn't update saved discoveries. Try again.",
    })
  ).toBeTruthy();
});

it("keeps the base item visible on detail failure and offers retry", () => {
  const onRetry = jest.fn();
  render(
    <DetailSheet
      visible
      selection={{ category: "movies", item, origin: "deck" }}
      detail={null}
      loading={false}
      errorMessage="Couldn't load all the details. Try again."
      saved={false}
      palette={darkPalette}
      reducedMotion
      onClose={jest.fn()}
      onRetry={onRetry}
      onSave={jest.fn()}
      onSkip={jest.fn()}
      onSimilar={jest.fn()}
      onShare={jest.fn()}
    />
  );

  expect(screen.getByText("Arrival")).toBeTruthy();
  expect(screen.getByText("Couldn't load all the details. Try again.")).toBeTruthy();
  fireEvent.press(screen.getByRole("button", { name: "Retry loading details" }));
  expect(onRetry).toHaveBeenCalledTimes(1);
});

it("renders category detail, external links, and wrapping essential copy", () => {
  const detail: MovieDetail = {
    id: "10",
    title: "Arrival",
    overview: "A linguist works with the military to communicate with alien lifeforms.",
    releaseYear: "2016",
    rating: 8,
    runtime: 116,
    genres: ["Science Fiction", "Drama"],
    language: "en",
  };
  const openUrl = jest.spyOn(Linking, "openURL").mockResolvedValue(true);

  render(
    <DetailSheet
      visible
      selection={{ category: "movies", item, origin: "deck" }}
      detail={{ category: "movies", data: detail }}
      loading={false}
      errorMessage={null}
      saved={false}
      palette={darkPalette}
      reducedMotion
      onClose={jest.fn()}
      onRetry={jest.fn()}
      onSave={jest.fn()}
      onSkip={jest.fn()}
      onSimilar={jest.fn()}
      onShare={jest.fn()}
    />
  );

  expect(screen.getByText(detail.overview).props.numberOfLines).toBeUndefined();
  fireEvent.press(screen.getByRole("link", { name: "Open JustWatch" }));
  expect(openUrl).toHaveBeenCalledWith("https://www.justwatch.com/us/search?q=Arrival");
  openUrl.mockRestore();
});

it("does not render stale detail from another category", () => {
  const staleBook: BookDetail = {
    id: "book-1",
    title: "Stale book",
    authors: ["Somebody"],
    subjects: [],
    description: "This belongs to an old request.",
  };
  render(
    <DetailSheet
      visible
      selection={{ category: "movies", item, origin: "deck" }}
      detail={{ category: "books", data: staleBook }}
      loading={false}
      errorMessage={null}
      saved={false}
      palette={darkPalette}
      reducedMotion
      onClose={jest.fn()}
      onRetry={jest.fn()}
      onSave={jest.fn()}
      onSkip={jest.fn()}
      onSimilar={jest.fn()}
      onShare={jest.fn()}
    />
  );

  expect(screen.queryByText(staleBook.description)).toBeNull();
});

it("uses the result subtitle when book detail has no author", () => {
  const bookItem: ResultItem = {
    id: "book-1",
    title: "The Book",
    subtitle: "Fallback Author",
    meta: "",
  };
  const book: BookDetail = {
    id: "book-1",
    title: "The Book",
    authors: [],
    subjects: [],
    description: "A description.",
  };
  render(
    <DetailSheet
      visible
      selection={{ category: "books", item: bookItem, origin: "deck" }}
      detail={{ category: "books", data: book }}
      loading={false}
      errorMessage={null}
      saved={false}
      palette={darkPalette}
      reducedMotion
      onClose={jest.fn()}
      onRetry={jest.fn()}
      onSave={jest.fn()}
      onSkip={jest.fn()}
      onSimilar={jest.fn()}
      onShare={jest.fn()}
    />
  );

  expect(screen.getAllByText("Fallback Author")).toHaveLength(2);
});

it("shows the themed fallback after an image error and retries when the URL changes", () => {
  const firstItem: ResultItem = { ...item, imageUrl: "https://example.com/first.jpg" };
  const nextItem: ResultItem = { ...item, id: "11", imageUrl: "https://example.com/next.jpg" };
  const commonProps = {
    visible: true,
    detail: null,
    loading: false,
    errorMessage: null,
    saved: false,
    palette: darkPalette,
    reducedMotion: true,
    onClose: jest.fn(),
    onRetry: jest.fn(),
    onSave: jest.fn(),
    onSkip: jest.fn(),
    onSimilar: jest.fn(),
    onShare: jest.fn(),
  } as const;
  const view = render(
    <DetailSheet
      {...commonProps}
      selection={{ category: "movies", item: firstItem, origin: "deck" }}
    />
  );

  fireEvent(screen.getByTestId("detail-sheet-hero-image"), "error");
  expect(screen.queryByTestId("detail-sheet-hero-image")).toBeNull();
  expect(screen.getByTestId("detail-sheet-hero-fallback")).toBeTruthy();
  expect(screen.getByText("TONIGHT'S FEATURE")).toBeTruthy();

  view.rerender(
    <DetailSheet
      {...commonProps}
      selection={{ category: "movies", item: nextItem, origin: "deck" }}
    />
  );
  expect(screen.queryByTestId("detail-sheet-hero-fallback")).toBeNull();
  expect(screen.getByTestId("detail-sheet-hero-image").props.source).toEqual({
    uri: "https://example.com/next.jpg",
  });
});

it.each([
  ["movies", 16 / 9, 600],
  ["books", 3 / 4, 280],
  ["artists", 1, 320],
  ["albums", 1, 320],
] as const)("uses bounded %s artwork proportions", (category, aspectRatio, maxWidth) => {
  render(
    <DetailSheet
      visible
      selection={{ category, item, origin: "deck" }}
      detail={null}
      loading={false}
      errorMessage={null}
      saved={false}
      palette={darkPalette}
      reducedMotion
      onClose={jest.fn()}
      onRetry={jest.fn()}
      onSave={jest.fn()}
      onSkip={jest.fn()}
      onSimilar={jest.fn()}
      onShare={jest.fn()}
    />
  );

  expect(StyleSheet.flatten(screen.getByTestId("detail-sheet-hero").props.style)).toMatchObject({
    aspectRatio,
    maxWidth,
  });
});

it("supports accessibility escape and removes transforms for reduced motion", () => {
  const onClose = jest.fn();
  render(
    <DetailSheet
      visible
      selection={{ category: "movies", item, origin: "deck" }}
      detail={null}
      loading={false}
      errorMessage={null}
      saved={false}
      palette={darkPalette}
      reducedMotion
      onClose={onClose}
      onRetry={jest.fn()}
      onSave={jest.fn()}
      onSkip={jest.fn()}
      onSimilar={jest.fn()}
      onShare={jest.fn()}
    />
  );

  const surface = screen.getByTestId("detail-sheet-surface");
  fireEvent(surface, "accessibilityEscape");
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(StyleSheet.flatten(surface.props.style).transform).toBeUndefined();
  const closeButton = screen.getByRole("button", { name: "Close details" });
  expect(StyleSheet.flatten(closeButton.props.style)).toMatchObject({ height: 44, width: 44 });
});

it("centers and bounds the surface on wide screens", () => {
  const dimensions = jest
    .spyOn(require("react-native"), "useWindowDimensions")
    .mockReturnValue({ width: 900, height: 800, scale: 1, fontScale: 1 });
  render(
    <DetailSheet
      visible
      selection={{ category: "movies", item, origin: "deck" }}
      detail={null}
      loading={false}
      errorMessage={null}
      saved={false}
      palette={darkPalette}
      reducedMotion
      onClose={jest.fn()}
      onRetry={jest.fn()}
      onSave={jest.fn()}
      onSkip={jest.fn()}
      onSimilar={jest.fn()}
      onShare={jest.fn()}
    />
  );

  expect(StyleSheet.flatten(screen.getByTestId("detail-sheet-surface").props.style)).toMatchObject({
    borderRadius: 28,
    maxWidth: 680,
    width: "90%",
  });
  dimensions.mockRestore();
});
