import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

jest.mock("@expo/vector-icons/FontAwesome", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return function MockIcon({ name }: { name: string }) {
    return React.createElement(Text, null, name);
  };
});

import { ScrollView, Text } from "react-native";

import {
  ArchiveAtlas,
  WebDiscoveryStage,
  WebShell,
  resolveWebLayout,
} from "../WebHomeScreen";

const card = {
  id: "arrival",
  title: "Arrival",
  subtitle: "Denis Villeneuve",
  meta: "2016",
};

const stageProps = {
  category: "movies" as const,
  activeItem: null,
  nextItem: null,
  loading: false,
  onSkip: jest.fn(),
  onSave: jest.fn(),
  onSimilar: jest.fn(),
  onOpen: jest.fn(),
};

describe("web digital arcade layout", () => {
  it("selects intentional phone, tablet, and desktop layout modes", () => {
    expect(resolveWebLayout(375, 667)).toBe("mobile"); // iPhone SE
    expect(resolveWebLayout(390, 844)).toBe("mobile");
    expect(resolveWebLayout(768, 1024)).toBe("tabletPortrait"); // iPad
    expect(resolveWebLayout(800, 600)).toBe("tabletLandscape");
    expect(resolveWebLayout(1024, 768)).toBe("tabletLandscape");
    expect(resolveWebLayout(1440, 900)).toBe("desktop");
  });

  // A phone held sideways is wide but very short. Keying "mobile" off width
  // alone handed it the two-column workspace and a fixed 360px detail rail on a
  // 393px-tall viewport.
  it("treats a short viewport as mobile however wide it is", () => {
    expect(resolveWebLayout(852, 393)).toBe("mobile"); // iPhone 15 landscape
    expect(resolveWebLayout(932, 430)).toBe("mobile"); // iPhone Pro Max landscape
    expect(resolveWebLayout(1024, 480)).toBe("mobile"); // a short desktop window
    // Just past the threshold it is a real landscape layout again.
    expect(resolveWebLayout(1024, 500)).toBe("tabletLandscape");
  });

  // Body scrolling is disabled app-wide (`ScrollViewStyleReset` in
  // `app/+html.tsx`), so a section without a ScrollView cannot be scrolled at
  // all — the action row, the undo bar and the keyboard hint below the deck
  // were unreachable on every phone and on a 900px-tall laptop.
  it.each([
    ["a card", { activeItem: card }],
    ["the loading state", { activeItem: null, loading: true }],
    ["the exhausted state", { activeItem: null, exhausted: true }],
  ])("keeps the deck scrollable while showing %s", (_name, overrides) => {
    const { UNSAFE_getAllByType } = render(
      <WebDiscoveryStage {...stageProps} {...(overrides as object)} />
    );
    expect(UNSAFE_getAllByType(ScrollView).length).toBeGreaterThan(0);
  });

  // The site had no way to filter at all. The controls have to survive every
  // stage state, not just the one with a card — an exhausted deck is exactly
  // when someone wants to change the query, and sending them back to the
  // archive to start over would be the wrong answer.
  it.each([
    ["a card", { activeItem: card }],
    ["the loading state", { activeItem: null, loading: true }],
    ["the exhausted state", { activeItem: null, exhausted: true }],
    ["the refilling state", { activeItem: null }],
  ])("keeps search and filters reachable while showing %s", (_name, overrides) => {
    const { getByText } = render(
      <WebDiscoveryStage
        {...stageProps}
        {...(overrides as object)}
        controls={<Text>Search and filters</Text>}
      />
    );
    expect(getByText("Search and filters")).toBeTruthy();
  });

  it("opens archive category portals and surprise mode", () => {
    const onSelect = jest.fn();
    const onSurprise = jest.fn();
    const { getByLabelText, getByText } = render(
      <ArchiveAtlas recentItems={[]} onSelect={onSelect} onOpenRecent={jest.fn()} onSurprise={onSurprise} />
    );

    fireEvent.press(getByLabelText("Explore Movies"));
    fireEvent.press(getByText("Surprise me"));

    expect(onSelect).toHaveBeenCalledWith("movies");
    expect(onSurprise).toHaveBeenCalledTimes(1);
  });

  // Web reaches saved items only through this nav item — there is no bookmark
  // sheet here the way there is on native, so losing it strands the collection.
  it("gives saved items their own destination, counted", () => {
    const onSectionChange = jest.fn();
    const { getByText, queryByText } = render(
      <WebShell
        section="saved"
        onSectionChange={onSectionChange}
        savedCount={3}
      >
        <></>
      </WebShell>
    );

    fireEvent.press(getByText("Saved 3"));
    expect(onSectionChange).toHaveBeenCalledWith("saved");
    expect(queryByText("Saved Atlas 3")).toBeNull();
  });

  it("drops the count from the label when nothing is saved", () => {
    const { getByText } = render(
      <WebShell section="saved" onSectionChange={jest.fn()} savedCount={0}>
        <></>
      </WebShell>
    );

    expect(getByText("Saved")).toBeTruthy();
  });
});
