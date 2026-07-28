import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { createRef } from "react";
import { Animated, PanResponder, StyleSheet } from "react-native";

import { darkPalette } from "../../../lib/theme";
import type { ResultItem } from "../../../types/content";
import { SwipeDeck, type SwipeDeckHandle } from "../SwipeDeck";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("@expo/vector-icons/FontAwesome", () => "FontAwesome");
jest.mock("../DiscoveryCard", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const actual = jest.requireActual<typeof import("../DiscoveryCard")>("../DiscoveryCard");
  const activeCardFocus = jest.fn();

  return {
    ...actual,
    activeCardFocus,
    DiscoveryCard: React.forwardRef((props: any, ref: any) => {
      React.useImperativeHandle(ref, () => ({ focus: activeCardFocus }));
      return React.createElement(actual.DiscoveryCard, props);
    }),
  };
});

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

it("focuses the active card through its imperative handle", () => {
  const ref = createRef<SwipeDeckHandle>();
  const { activeCardFocus } = jest.requireMock("../DiscoveryCard") as {
    activeCardFocus: jest.Mock;
  };
  activeCardFocus.mockClear();

  render(
    <SwipeDeck
      ref={ref}
      category="movies"
      items={[movie]}
      palette={darkPalette}
      reducedMotion
      onCommit={jest.fn()}
      onOpenDetail={jest.fn()}
      onSimilar={jest.fn()}
    />
  );

  expect(ref.current).not.toBeNull();
  act(() => ref.current?.focusActiveCard());

  expect(activeCardFocus).toHaveBeenCalledTimes(1);
});

it("guards against two decisions on the same card before the parent advances the queue", () => {
  const setValue = jest.spyOn(Animated.ValueXY.prototype, "setValue");
  const onCommit = jest.fn();
  renderDeck({ reducedMotion: true, onCommit });

  const save = screen.getByRole("button", { name: "Save" });
  fireEvent.press(save);

  expect(onCommit).toHaveBeenCalledTimes(1);
  expect(onCommit).toHaveBeenCalledWith(movie, "save", "button");
  // The slot this card occupied resets immediately — the next card, whatever
  // it turns out to be, starts at rest rather than mid-drag.
  expect(setValue).toHaveBeenCalledWith({ x: 0, y: 0 });

  fireEvent.press(save);
  expect(onCommit).toHaveBeenCalledTimes(1);
});

it("accepts a fresh decision once the deck has moved on to a new card", () => {
  const onCommit = jest.fn();
  const { rerender } = render(
    <SwipeDeck
      category="movies"
      items={[movie]}
      palette={darkPalette}
      reducedMotion
      onCommit={onCommit}
      onOpenDetail={jest.fn()}
      onSimilar={jest.fn()}
    />
  );

  fireEvent.press(screen.getByRole("button", { name: "Save" }));
  expect(onCommit).toHaveBeenCalledTimes(1);

  const nextMovie = { ...movie, id: "movie-2", title: "Past Lives" };
  rerender(
    <SwipeDeck
      category="movies"
      items={[nextMovie]}
      palette={darkPalette}
      reducedMotion
      onCommit={onCommit}
      onOpenDetail={jest.fn()}
      onSimilar={jest.fn()}
    />
  );

  fireEvent.press(screen.getByRole("button", { name: "Save" }));
  expect(onCommit).toHaveBeenCalledTimes(2);
  expect(onCommit).toHaveBeenLastCalledWith(nextMovie, "save", "button");
});

it("claims the next card's gesture while the previous card's exit animation is still playing", () => {
  let responderConfig: Parameters<typeof PanResponder.create>[0] | undefined;
  jest.spyOn(PanResponder, "create").mockImplementation((config) => {
    responderConfig = config;
    return { panHandlers: {} } as ReturnType<typeof PanResponder.create>;
  });
  // Captured but never invoked — simulates the exit animation still in
  // flight when the next gesture starts. The old design gated the gesture
  // claim on this animation finishing; the fix does not, because dismissal
  // already happened synchronously on press, before this animation began.
  jest.spyOn(Animated, "timing").mockImplementation(
    (() => ({
      start: () => {},
      stop: jest.fn(),
      reset: jest.fn(),
    })) as typeof Animated.timing
  );
  const onCommit = jest.fn();
  renderDeck({ onCommit });

  fireEvent.press(screen.getByRole("button", { name: "Save" }));
  expect(onCommit).toHaveBeenCalledTimes(1);

  expect(
    responderConfig?.onMoveShouldSetPanResponderCapture?.(
      {} as never,
      { dx: 12, dy: 2 } as never
    )
  ).toBe(true);
});

it("creates the pan responder once per mount, not once per render", () => {
  const create = jest
    .spyOn(PanResponder, "create")
    .mockImplementation(() => ({ panHandlers: {} }) as ReturnType<typeof PanResponder.create>);
  const baseProps = {
    category: "movies" as const,
    items: [movie],
    palette: darkPalette,
    reducedMotion: false,
  };
  const { rerender } = render(
    <SwipeDeck
      {...baseProps}
      onCommit={jest.fn()}
      onOpenDetail={jest.fn()}
      onSimilar={jest.fn()}
    />
  );
  expect(create).toHaveBeenCalledTimes(1);

  // Fresh inline callbacks on every render, exactly like an unmemoized parent
  // — this is what used to force PanResponder.create() to run again and hand
  // an in-progress touch to a responder that had never been granted it.
  for (let i = 0; i < 4; i += 1) {
    rerender(
      <SwipeDeck
        {...baseProps}
        onCommit={jest.fn()}
        onOpenDetail={jest.fn()}
        onSimilar={jest.fn()}
      />
    );
  }

  expect(create).toHaveBeenCalledTimes(1);
});

it("uses horizontal intent and maps a swipe through the guarded gesture path", () => {
  let responderConfig: Parameters<typeof PanResponder.create>[0] | undefined;
  jest.spyOn(require("react-native"), "useWindowDimensions").mockReturnValue({
    fontScale: 1,
    height: 844,
    scale: 3,
    width: 390,
  });
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
  ).toBe(true);
  expect(
    responderConfig?.onMoveShouldSetPanResponder?.({} as never, { dx: 12, dy: 20 } as never)
  ).toBe(false);
  act(() => {
    responderConfig?.onPanResponderRelease?.(
      {} as never,
      { dx: -70, dy: 35, vx: -0.2 } as never
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
