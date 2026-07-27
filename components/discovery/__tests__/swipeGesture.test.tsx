import React from "react";
import { PanResponder } from "react-native";
import { render } from "@testing-library/react-native";

jest.mock("@expo/vector-icons/FontAwesome", () => "FontAwesome");

import { SwipeDeck } from "../SwipeDeck";
import { SavedAtlasNative } from "../../atlas/SavedAtlasNative";
import { darkPalette } from "../../../lib/theme";
import type { MapNode } from "../../../lib/storage/discoveryMap";

/**
 * These pin *who owns the finger*, which is what was actually broken on device:
 * the card agreed to hand a swipe over to the ScrollView it sits in, and the
 * atlas never received a drag that began on one of its nodes.
 *
 * No test here can say how a swipe feels. They can say that nothing is allowed
 * to take it away, which is the mechanism that made it feel broken.
 */

const capturedConfigs: Parameters<typeof PanResponder.create>[0][] = [];
const realCreate = PanResponder.create;

beforeEach(() => {
  capturedConfigs.length = 0;
  jest.spyOn(PanResponder, "create").mockImplementation((config) => {
    capturedConfigs.push(config);
    return realCreate(config);
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

const item = {
  id: "arrival",
  title: "Arrival",
  subtitle: "Denis Villeneuve",
  meta: "2016",
};

const deckProps = {
  category: "movies" as const,
  palette: darkPalette,
  reducedMotion: false,
  onCommit: jest.fn(),
  onOpenDetail: jest.fn(),
  onSimilar: jest.fn(),
};

const sideways = { dx: 40, dy: 4 } as never;
const still = { dx: 0, dy: 0 } as never;

describe("the discovery card's grip on a swipe", () => {
  it("never lets the enclosing scroll view take a swipe away", () => {
    render(<SwipeDeck {...deckProps} items={[item]} />);
    const [config] = capturedConfigs;

    // The bug, exactly: this returned true, so the ScrollView could reclaim the
    // gesture part-way through and the card stopped following the finger.
    expect(config.onPanResponderTerminationRequest?.(null as never, still)).toBe(
      false
    );
  });

  it("claims a sideways drag on the capture phase, ahead of the scroll view", () => {
    render(<SwipeDeck {...deckProps} items={[item]} />);
    const [config] = capturedConfigs;

    expect(
      config.onMoveShouldSetPanResponderCapture?.(null as never, sideways)
    ).toBe(true);
  });

  it("still lets a tap through to open the detail sheet", () => {
    render(<SwipeDeck {...deckProps} items={[item]} />);
    const [config] = capturedConfigs;

    expect(config.onStartShouldSetPanResponder?.(null as never, still)).toBeFalsy();
    expect(
      config.onMoveShouldSetPanResponderCapture?.(null as never, still)
    ).toBe(false);
  });

  it("tells the screen when a swipe owns the finger, so the page can hold still", () => {
    const onSwipeActiveChange = jest.fn();
    render(
      <SwipeDeck
        {...deckProps}
        items={[item]}
        onSwipeActiveChange={onSwipeActiveChange}
      />
    );
    const [config] = capturedConfigs;

    config.onPanResponderGrant?.(null as never, sideways);
    expect(onSwipeActiveChange).toHaveBeenLastCalledWith(true);

    config.onPanResponderRelease?.(null as never, still);
    expect(onSwipeActiveChange).toHaveBeenLastCalledWith(false);
  });

  it("releases the page again if the gesture is cut short", () => {
    const onSwipeActiveChange = jest.fn();
    render(
      <SwipeDeck
        {...deckProps}
        items={[item]}
        onSwipeActiveChange={onSwipeActiveChange}
      />
    );
    const [config] = capturedConfigs;

    config.onPanResponderGrant?.(null as never, sideways);
    config.onPanResponderTerminate?.(null as never, still);

    // Otherwise an interrupted swipe would leave the screen unable to scroll.
    expect(onSwipeActiveChange).toHaveBeenLastCalledWith(false);
  });
});

const mapNode = (id: string): MapNode => ({
  id: `movies:${id}`,
  category: "movies",
  itemId: id,
  title: id,
  subtitle: "",
  meta: "",
  savedAt: 1,
  x: 0.4,
  y: 0.4,
});

describe("the atlas map's grip on a drag", () => {
  const atlasProps = {
    edges: [],
    selectedId: null,
    palette: darkPalette,
    onSelect: jest.fn(),
    onStart: jest.fn(),
  };

  it("claims a drag on the capture phase, so one starting on a node still pans", () => {
    render(<SavedAtlasNative {...atlasProps} nodes={[mapNode("arrival")]} />);
    const [config] = capturedConfigs;

    // The nodes are Pressables covering most of the canvas. On the bubble phase
    // the map never saw these drags at all.
    expect(
      config.onMoveShouldSetPanResponderCapture?.(null as never, {
        dx: 20,
        dy: 20,
      } as never)
    ).toBe(true);
  });

  it("keeps a drag until the finger lifts", () => {
    render(<SavedAtlasNative {...atlasProps} nodes={[mapNode("arrival")]} />);
    const [config] = capturedConfigs;

    expect(config.onPanResponderTerminationRequest?.(null as never, still)).toBe(
      false
    );
  });

  it("leaves a tap alone so a node can still be opened", () => {
    render(<SavedAtlasNative {...atlasProps} nodes={[mapNode("arrival")]} />);
    const [config] = capturedConfigs;

    expect(
      config.onMoveShouldSetPanResponderCapture?.(null as never, {
        dx: 2,
        dy: 1,
      } as never)
    ).toBe(false);
  });
});
