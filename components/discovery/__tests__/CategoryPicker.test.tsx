import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { darkPalette } from "../../../lib/theme";
import { CategoryPicker } from "../CategoryPicker";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("@expo/vector-icons/FontAwesome", () => "FontAwesome");

describe("CategoryPicker", () => {
  it("labels all four choices and reports the selected category", () => {
    const onSelect = jest.fn();
    render(
      <CategoryPicker
        selected="movies"
        compact={false}
        palette={darkPalette}
        onSelect={onSelect}
      />
    );
    const movies = screen.getByRole("button", { name: "Movies" });
    expect(movies.props.accessibilityState).toEqual({ selected: true });
    fireEvent.press(screen.getByRole("button", { name: "Books" }));
    expect(onSelect).toHaveBeenCalledWith("books");
    expect(screen.getByRole("button", { name: "Artists" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Albums" })).toBeTruthy();
  });

  it("shows one active-category control in compact mode", () => {
    render(
      <CategoryPicker
        selected="albums"
        compact
        palette={darkPalette}
        onSelect={jest.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Change category. Albums selected" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Movies" })).toBeNull();
  });

  it("lets the compact control grow for Dynamic Type", () => {
    render(
      <CategoryPicker
        selected="albums"
        compact
        palette={darkPalette}
        onSelect={jest.fn()}
      />
    );

    const button = screen.getByRole("button", {
      name: "Change category. Albums selected",
    });
    const style = StyleSheet.flatten(button.props.style);

    expect(style.minHeight).toBeGreaterThanOrEqual(44);
    expect(style.height).toBeUndefined();
  });
});
