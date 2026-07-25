import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

jest.mock("@expo/vector-icons/FontAwesome", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return function MockIcon({ name }: { name: string }) {
    return React.createElement(Text, null, name);
  };
});

import {
  ArchiveAtlas,
  WebConstellation,
  resolveWebLayout,
} from "../WebHomeScreen";

describe("web digital arcade layout", () => {
  it("selects intentional phone, tablet, and desktop layout modes", () => {
    expect(resolveWebLayout(390, 844)).toBe("mobile");
    expect(resolveWebLayout(768, 1024)).toBe("tabletPortrait");
    expect(resolveWebLayout(1024, 768)).toBe("tabletLandscape");
    expect(resolveWebLayout(1440, 900)).toBe("desktop");
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

  it("labels an empty constellation as an example and provides a start action", () => {
    const onStart = jest.fn();
    const { getByText } = render(
      <WebConstellation nodes={[]} edges={[]} selectedId={null} empty onSelect={jest.fn()} onStart={onStart} />
    );

    expect(getByText("EXAMPLE CONSTELLATION")).toBeTruthy();
    fireEvent.press(getByText("Start discovering"));
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});
