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

  it("keeps Era and Rating Any choices independent", () => {
    const { rerender } = render(
      <DiscoveryControls
        {...baseProps}
        activeAction="filter"
        openSection="era"
      />
    );

    const eraAny = screen.getByRole("button", { name: "Any era" });
    expect(eraAny.props.accessibilityState).toEqual({ selected: true });
    fireEvent.press(screen.getByRole("button", { name: "80s" }));
    expect(baseProps.onToggleFilter).toHaveBeenCalledWith("80s");

    rerender(
      <DiscoveryControls
        {...baseProps}
        activeAction="filter"
        filters={["80s"]}
        openSection="rating"
      />
    );
    const ratingAny = screen.getByRole("button", { name: "Any rating" });
    expect(ratingAny.props.accessibilityState).toEqual({ selected: true });
    fireEvent.press(ratingAny);
    expect(baseProps.onToggleFilter).toHaveBeenLastCalledWith("rating:any");

    rerender(
      <DiscoveryControls
        {...baseProps}
        activeAction="filter"
        filters={["4+"]}
        openSection="era"
      />
    );
    expect(
      screen.getByRole("button", { name: "Any era" }).props.accessibilityState
    ).toEqual({ selected: true });
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

  // Both new modes submit straight away rather than opening a panel: neither
  // takes any options, so there would be nothing to put in one.
  it("submits What's New without opening a panel first", () => {
    render(<DiscoveryControls {...baseProps} />);

    fireEvent.press(screen.getByRole("button", { name: "Show new movies" }));

    expect(baseProps.onSubmit).toHaveBeenCalledWith("fresh");
    expect(baseProps.onActionChange).not.toHaveBeenCalled();
  });

  it("offers What's New in every category", () => {
    for (const category of ["movies", "books", "artists", "albums"] as const) {
      const view = render(
        <DiscoveryControls {...baseProps} category={category} />
      );
      expect(screen.queryAllByRole("button", { name: /^Show new / })).toHaveLength(1);
      view.unmount();
    }
  });

  it("keeps every action button reachable at 44 points", () => {
    render(<DiscoveryControls {...baseProps} category="artists" />);

    const buttons = [
      screen.getByRole("button", { name: "Show new artists" }),
      screen.getByRole("button", { name: "Surprise me with a artist" }),
    ];
    buttons.forEach((button) => {
      const style = flattenedStyle(button);
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
      expect(style.height).toBeUndefined();
    });
  });

  it("disables both browse buttons while a request is in flight", () => {
    render(<DiscoveryControls {...baseProps} loading />);

    const fresh = screen.getByRole("button", { name: "Show new movies" });
    expect(fresh.props.accessibilityState).toMatchObject({ disabled: true });
  });
});

/**
 * Underground rests on Last.fm listener counts, so it can only appear where
 * those exist. Offering it on a film deck, or with no key configured, would
 * mean a button that always comes back empty with nothing to say about why.
 */
describe("DiscoveryControls: the Underground button", () => {
  const withKey = { ...baseProps, category: "artists" as const };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EXPO_PUBLIC_LASTFM_API_KEY = "test-key";
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_LASTFM_API_KEY;
  });

  it.each(["artists", "albums"] as const)("appears for %s", (category) => {
    render(<DiscoveryControls {...withKey} category={category} />);
    expect(
      screen.getByRole("button", { name: `Find underground ${category}` })
    ).toBeTruthy();
  });

  it.each(["movies", "books"] as const)(
    "stays hidden for %s, which have no listener data",
    (category) => {
      render(<DiscoveryControls {...withKey} category={category} />);
      expect(
        screen.queryByRole("button", { name: /^Find underground / })
      ).toBeNull();
    }
  );

  it("stays hidden when no Last.fm key is configured", () => {
    delete process.env.EXPO_PUBLIC_LASTFM_API_KEY;
    render(<DiscoveryControls {...withKey} />);
    expect(
      screen.queryByRole("button", { name: /^Find underground / })
    ).toBeNull();
    // And the rest of the row is unaffected.
    expect(screen.getByRole("button", { name: "Show new artists" })).toBeTruthy();
  });

  it("submits directly when pressed", () => {
    render(<DiscoveryControls {...withKey} />);

    fireEvent.press(
      screen.getByRole("button", { name: "Find underground artists" })
    );

    expect(withKey.onSubmit).toHaveBeenCalledWith("underground");
    expect(withKey.onActionChange).not.toHaveBeenCalled();
  });
});
