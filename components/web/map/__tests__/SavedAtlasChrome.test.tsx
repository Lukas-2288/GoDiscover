import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { SavedAtlasEmpty, SavedAtlasHeader } from "../SavedAtlasChrome";

describe("Saved Atlas chrome", () => {
  it("switches between map and list from one Saved Atlas destination", () => {
    const onViewChange = jest.fn();
    const { getByRole, getByText } = render(
      <SavedAtlasHeader
        count={7}
        query=""
        view="map"
        onQueryChange={jest.fn()}
        onViewChange={onViewChange}
      />
    );

    expect(getByText("Saved Atlas")).toBeTruthy();
    expect(getByText("7 works in your collection")).toBeTruthy();
    fireEvent.press(getByRole("tab", { name: "List" }));
    expect(onViewChange).toHaveBeenCalledWith("list");
  });

  it("makes search a first-class focus control", () => {
    const onQueryChange = jest.fn();
    const { getByLabelText } = render(
      <SavedAtlasHeader
        count={2}
        query=""
        view="map"
        onQueryChange={onQueryChange}
        onViewChange={jest.fn()}
      />
    );

    fireEvent.changeText(getByLabelText("Search saved atlas"), "arrival");
    expect(onQueryChange).toHaveBeenCalledWith("arrival");
  });

  it("guides an empty collection with a calm example and start action", () => {
    const onStart = jest.fn();
    const { getByText } = render(<SavedAtlasEmpty onStart={onStart} />);

    expect(getByText("A quiet example")).toBeTruthy();
    expect(
      getByText("Save a film, book, album, or artist. Their paths will gather here.")
    ).toBeTruthy();
    fireEvent.press(getByText("Start discovering"));
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});
