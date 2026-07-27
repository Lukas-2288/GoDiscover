import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import type { MapNode } from "../../../lib/storage/discoveryMap";
import { SavedAtlasList } from "../SavedAtlasList";

const savedNodes: MapNode[] = [
  {
    id: "movies:arrival",
    category: "movies",
    itemId: "arrival",
    title: "Arrival",
    subtitle: "Denis Villeneuve",
    meta: "2016 · Science fiction",
    savedAt: 2,
    x: 0.2,
    y: 0.3,
  },
  {
    id: "albums:vespertine",
    category: "albums",
    itemId: "vespertine",
    title: "Vespertine",
    subtitle: "Björk",
    meta: "2001 · Electronic",
    savedAt: 1,
    x: 0.4,
    y: 0.5,
  },
];

describe("Saved Atlas list", () => {
  it("offers every saved discovery as a detail selection", () => {
    const onSelect = jest.fn();
    const { getByLabelText, getByText } = render(
      <SavedAtlasList
        nodes={savedNodes}
        selectedId={null}
        onSelect={onSelect}
      />
    );

    expect(getByText("Movies")).toBeTruthy();
    expect(getByText("Albums")).toBeTruthy();
    fireEvent.press(getByLabelText("Open Arrival"));
    expect(onSelect).toHaveBeenCalledWith(savedNodes[0]);
  });

  it("marks the selected discovery without making the list editable", () => {
    const { getByLabelText, queryByLabelText } = render(
      <SavedAtlasList
        nodes={savedNodes}
        selectedId="albums:vespertine"
        onSelect={jest.fn()}
      />
    );

    expect(getByLabelText("Open Vespertine").props.accessibilityState).toEqual({
      selected: true,
    });
    expect(queryByLabelText("Remove Vespertine")).toBeNull();
  });
});
