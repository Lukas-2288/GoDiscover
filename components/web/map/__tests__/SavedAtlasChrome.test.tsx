import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

function loadMapChrome(): Record<string, React.ComponentType<any>> {
  try {
    return require("../SavedAtlasChrome") as Record<string, React.ComponentType<any>>;
  } catch {
    return {};
  }
}

describe("Saved Atlas chrome", () => {
  it("switches between map and list from one Saved Atlas destination", () => {
    const onViewChange = jest.fn();
    const SavedAtlasHeader =
      loadMapChrome().SavedAtlasHeader ?? (() => React.createElement(React.Fragment));
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
    const SavedAtlasHeader =
      loadMapChrome().SavedAtlasHeader ?? (() => React.createElement(React.Fragment));
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
    const SavedAtlasEmpty =
      loadMapChrome().SavedAtlasEmpty ?? (() => React.createElement(React.Fragment));
    const { getByText } = render(<SavedAtlasEmpty onStart={onStart} />);

    expect(getByText("A quiet example")).toBeTruthy();
    expect(
      getByText("Save a film, book, album, or artist. Their paths will gather here.")
    ).toBeTruthy();
    fireEvent.press(getByText("Start discovering"));
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});
