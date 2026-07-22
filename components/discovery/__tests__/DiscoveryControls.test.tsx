import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { darkPalette } from "../../../lib/theme";
import { DiscoveryControls } from "../DiscoveryControls";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("@expo/vector-icons/FontAwesome", () => "FontAwesome");

const baseProps = {
  category: "movies" as const,
  activeAction: null,
  query: "",
  filters: [] as string[],
  openSection: null as string | null,
  loading: false,
  palette: darkPalette,
  onActionChange: jest.fn(),
  onQueryChange: jest.fn(),
  onToggleFilter: jest.fn(),
  onOpenSection: jest.fn(),
  onClearFilters: jest.fn(),
  onSubmit: jest.fn(),
};

function flattenedStyle(element: { props: { style: unknown } }) {
  const style = element.props.style;
  return StyleSheet.flatten(
    typeof style === "function" ? style({ pressed: false }) : style
  );
}

describe("DiscoveryControls", () => {
  beforeEach(() => jest.clearAllMocks());

  it("makes Surprise Me primary without hiding Search or Filter", () => {
    render(<DiscoveryControls {...baseProps} />);
    fireEvent.press(screen.getByRole("button", { name: "Surprise me with a movie" }));
    expect(baseProps.onSubmit).toHaveBeenCalledWith("randomize");
    expect(screen.getByRole("button", { name: "Search movies" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Filter movies" })).toBeTruthy();
  });

  it("sets exact labels on the Search and Filter buttons", () => {
    render(<DiscoveryControls {...baseProps} />);
    const search = screen.getByRole("button", { name: "Search movies" });
    const filter = screen.getByRole("button", { name: "Filter movies" });
    expect(search.props.accessibilityLabel).toBe("Search movies");
    expect(filter.props.accessibilityLabel).toBe("Filter movies");
  });

  it("submits a labeled search and keeps the input accessible", () => {
    render(<DiscoveryControls {...baseProps} activeAction="search" query="space" />);
    fireEvent.changeText(screen.getByDisplayValue("space"), "moon");
    expect(baseProps.onQueryChange).toHaveBeenCalledWith("moon");
    fireEvent.press(screen.getByRole("button", { name: "Find movies" }));
    expect(baseProps.onSubmit).toHaveBeenCalledWith("search");
  });

  it("does not advertise unsupported album rating filters", () => {
    render(<DiscoveryControls {...baseProps} category="albums" activeAction="filter" />);
    expect(screen.queryByText("Rating")).toBeNull();
  });

  it("uses growable 44-point controls and chips for Dynamic Type", () => {
    render(
      <DiscoveryControls
        {...baseProps}
        activeAction="filter"
        openSection="genre"
      />
    );

    const controls = [
      screen.getByRole("button", { name: "Search movies" }),
      screen.getByRole("button", { name: "Filter movies" }),
      screen.getByRole("button", { name: "Surprise me with a movie" }),
      screen.getByRole("button", { name: "Apply filters" }),
    ];

    controls.forEach((control) => {
      const style = flattenedStyle(control);
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
      expect(style.height).toBeUndefined();
    });

    const chip = screen.getByRole("button", { name: "Action" });
    const chipStyle = flattenedStyle(chip);
    expect(chipStyle.minHeight).toBeGreaterThanOrEqual(44);
    expect(chipStyle.height).toBeUndefined();
  });

  it("uses growable search controls for Dynamic Type", () => {
    render(<DiscoveryControls {...baseProps} activeAction="search" query="space" />);

    const searchInput = screen.getByDisplayValue("space");
    const findButton = screen.getByRole("button", { name: "Find movies" });

    [searchInput, findButton].forEach((control) => {
      const style = flattenedStyle(control);
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
      expect(style.height).toBeUndefined();
    });
  });
});
