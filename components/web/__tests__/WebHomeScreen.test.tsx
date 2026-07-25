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
  WebShell,
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

  it("consolidates map and saved navigation into one Saved Atlas destination", () => {
    const onSectionChange = jest.fn();
    const { getByText, queryByText } = render(
      <WebShell
        section={"atlas" as any}
        onSectionChange={onSectionChange}
        savedCount={3}
      >
        <></>
      </WebShell>
    );

    fireEvent.press(getByText("Saved Atlas 3"));
    expect(onSectionChange).toHaveBeenCalledWith("atlas");
    expect(queryByText("Map")).toBeNull();
    expect(queryByText("Saved 3")).toBeNull();
  });
});
