import { fireEvent, render, screen } from "@testing-library/react-native";
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

describe("DiscoveryControls", () => {
  beforeEach(() => jest.clearAllMocks());

  it("makes Surprise Me primary without hiding Search or Filter", () => {
    render(<DiscoveryControls {...baseProps} />);
    fireEvent.press(screen.getByRole("button", { name: "Surprise me with a movie" }));
    expect(baseProps.onSubmit).toHaveBeenCalledWith("randomize");
    expect(screen.getByRole("button", { name: "Search movies" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Filter movies" })).toBeTruthy();
  });

  it("submits a labeled search and keeps the input accessible", () => {
    render(<DiscoveryControls {...baseProps} activeAction="search" query="space" />);
    fireEvent.changeText(screen.getByLabelText("Search movies"), "moon");
    expect(baseProps.onQueryChange).toHaveBeenCalledWith("moon");
    fireEvent.press(screen.getByRole("button", { name: "Find movies" }));
    expect(baseProps.onSubmit).toHaveBeenCalledWith("search");
  });

  it("does not advertise unsupported album rating filters", () => {
    render(<DiscoveryControls {...baseProps} category="albums" activeAction="filter" />);
    expect(screen.queryByText("Rating")).toBeNull();
  });
});
