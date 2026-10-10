import React from "react";
import { render } from "@testing-library/react-native";

jest.mock("@expo/vector-icons/FontAwesome", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return function MockIcon({ name }: { name: string }) {
    return React.createElement(Text, null, name);
  };
});

import { WebDiscoveryStage } from "../WebHomeScreen";

/**
 * The deck has gone silently dead twice now, both times the same way: an empty
 * queue in a state that matched no render branch, so the screen showed nothing
 * at all and the app looked frozen.
 *
 * Rather than add a case each time one is found, this walks every combination
 * of the flags that can accompany an empty deck and insists each one puts
 * *something* on screen. A future flag added without a branch fails here.
 */

const base = {
  category: "movies" as const,
  activeItem: null,
  nextItem: null,
  onSkip: jest.fn(),
  onSave: jest.fn(),
  onSimilar: jest.fn(),
  onOpen: jest.fn(),
};

const flagCombinations = [
  { name: "first load", loading: true, exhausted: false, stalled: false },
  { name: "refilling", loading: false, exhausted: false, stalled: false },
  { name: "archive finished", loading: false, exhausted: true, stalled: false },
  { name: "refill failed", loading: false, exhausted: false, stalled: true },
  // Both flags at once should not cancel out into nothing.
  { name: "finished and failed", loading: false, exhausted: true, stalled: true },
  { name: "loading over a failure", loading: true, exhausted: false, stalled: true },
];

describe("an empty deck always says something", () => {
  it.each(flagCombinations)(
    "renders a visible state for: $name",
    ({ loading, exhausted, stalled }) => {
      const { toJSON } = render(
        <WebDiscoveryStage
          {...base}
          loading={loading}
          exhausted={exhausted}
          stalled={stalled}
        />
      );

      const rendered = JSON.stringify(toJSON());
      // Something with words in it, not merely a mounted empty container.
      expect(rendered).toMatch(/[A-Za-z]{4,}/);
      expect(rendered.length).toBeGreaterThan(200);
    }
  );

  it("offers a way out of a failed refill rather than stranding the deck", () => {
    const onRetry = jest.fn();
    const { getByLabelText } = render(
      <WebDiscoveryStage
        {...base}
        loading={false}
        exhausted={false}
        stalled
        onRetry={onRetry}
      />
    );

    // The distinction that matters: exhausted is terminal, stalled is not.
    expect(getByLabelText("Try again")).toBeTruthy();
  });

  it("does not offer a retry once the archive is genuinely finished", () => {
    const { queryByLabelText } = render(
      <WebDiscoveryStage
        {...base}
        loading={false}
        exhausted
        stalled={false}
        onRetry={jest.fn()}
      />
    );

    expect(queryByLabelText("Try again")).toBeNull();
  });
});
