import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Animated, PanResponder, StyleSheet } from "react-native";

import { darkPalette } from "../../../lib/theme";
import type { ResultItem } from "../../../types/content";
import { SwipeDeck } from "../SwipeDeck";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("@expo/vector-icons/FontAwesome", () => "FontAwesome");

const movie: ResultItem = {
  id: "movie-1",
  title: "Moonlight",
  subtitle: "Barry Jenkins · 2016",
  meta: "Drama · 1h 51m · ★ 7.4",
};

function renderDeck(overrides: Partial<React.ComponentProps<typeof SwipeDeck>> = {}) {
  const props: React.ComponentProps<typeof SwipeDeck> = {
    category: "movies",
    items: [movie],
    palette: darkPalette,
    reducedMotion: false,
    onCommit: jest.fn(),
    onOpenDetail: jest.fn(),
    onSimilar: jest.fn(),
    ...overrides,
  };

  render(<SwipeDeck {...props} />);
  return props;
}

afterEach(() => {
  jest.restoreAllMocks();
});

it.each([
  ["Save", "save"],
  ["Not for me", "skip"],
] as const)("maps the %s button to the matching decision", (name, decision) => {
  const onCommit = jest.fn();
  renderDeck({ reducedMotion: true, onCommit });

  fireEvent.press(screen.getByRole("button", { name }));

  expect(onCommit).toHaveBeenCalledWith(movie, decision, "button");
});

it("keeps similar and detail as explicit actions", () => {
  const onOpenDetail = jest.fn();
  const onSimilar = jest.fn();
  renderDeck({ onOpenDetail, onSimilar });

  fireEvent.press(screen.getByRole("button", { name: "Find similar" }));
  fireEvent.press(screen.getByRole("button", { name: /Movies\. Moonlight/ }));

  expect(onSimilar).toHaveBeenCalledWith(movie);
  expect(onOpenDetail).toHaveBeenCalledWith(movie);
});

it("guards against two decisions before the exit animation completes", () => {
  const completions: Animated.EndCallback[] = [];
  jest.spyOn(Animated, "timing").mockImplementation(
    (() => ({
      start: (callback?: Animated.EndCallback) => {
        if (callback) completions.push(callback);
      },
      stop: jest.fn(),
      reset: jest.fn(),
    })) as typeof Animated.timing
  );
  const onCommit = jest.fn();
  renderDeck({ onCommit });

  const save = screen.getByRole("button", { name: "Save" });
  fireEvent.press(save);
  fireEvent.press(save);

  expect(completions).toHaveLength(1);
  expect(onCommit).not.toHaveBeenCalled();
  act(() => completions[0]?.({ finished: true }));
  expect(onCommit).toHaveBeenCalledTimes(1);
  expect(onCommit).toHaveBeenCalledWith(movie, "save", "button");
});

it("uses horizontal intent and maps a swipe through the guarded gesture path", () => {
  let responderConfig: Parameters<typeof PanResponder.create>[0] | undefined;
  jest.spyOn(PanResponder, "create").mockImplementation((config) => {
    responderConfig = config;
    return { panHandlers: {} } as ReturnType<typeof PanResponder.create>;
  });
  const onCommit = jest.fn();
  renderDeck({ reducedMotion: true, onCommit });

  expect(
    responderConfig?.onMoveShouldSetPanResponder?.({} as never, { dx: 12, dy: 4 } as never)
  ).toBe(true);
  expect(
    responderConfig?.onMoveShouldSetPanResponder?.({} as never, { dx: 12, dy: 14 } as never)
  ).toBe(false);
  act(() => {
    responderConfig?.onPanResponderRelease?.(
      {} as never,
      { dx: -110, dy: 4, vx: -0.2 } as never
    );
  });

  expect(onCommit).toHaveBeenCalledWith(movie, "skip", "gesture");
});

it("springs a below-threshold drag back to center", () => {
  let responderConfig: Parameters<typeof PanResponder.create>[0] | undefined;
  jest.spyOn(PanResponder, "create").mockImplementation((config) => {
    responderConfig = config;
    return { panHandlers: {} } as ReturnType<typeof PanResponder.create>;
  });
  const start = jest.fn();
  const spring = jest.spyOn(Animated, "spring").mockReturnValue({
    start,
    stop: jest.fn(),
    reset: jest.fn(),
  });
  const onCommit = jest.fn();
  renderDeck({ onCommit });

  act(() => {
    responderConfig?.onPanResponderRelease?.(
      {} as never,
      { dx: 25, dy: 2, vx: 0.1 } as never
    );
  });

  expect(spring).toHaveBeenCalledTimes(1);
  expect(start).toHaveBeenCalledTimes(1);
  expect(onCommit).not.toHaveBeenCalled();
});

it("caps the responsive deck width and hides stacked cards from accessibility", () => {
  const moreMovies = [
    movie,
    { ...movie, id: "movie-2", title: "Past Lives" },
    { ...movie, id: "movie-3", title: "Lady Bird" },
    { ...movie, id: "movie-4", title: "Arrival" },
  ];
  renderDeck({ items: moreMovies });

  const deck = screen.getByTestId("swipe-deck");
  expect(StyleSheet.flatten(deck.props.style).width).toBeLessThanOrEqual(440);
  const cards = screen.getAllByTestId("swipe-card", { includeHiddenElements: true });
  expect(cards).toHaveLength(3);
  expect(cards[1].props.accessibilityElementsHidden).toBe(true);
});
