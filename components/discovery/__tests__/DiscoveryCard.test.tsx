import { fireEvent, render, screen } from "@testing-library/react-native";

import { darkPalette } from "../../../lib/theme";
import type { ResultItem } from "../../../types/content";
import { DiscoveryCard } from "../DiscoveryCard";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("@expo/vector-icons/FontAwesome", () => "FontAwesome");

const movie: ResultItem = {
  id: "movie-1",
  title: "The Assassination of Jesse James by the Coward Robert Ford",
  subtitle: "Andrew Dominik · 2007",
  meta: "Western · 2h 40m · ★ 7.5",
  imageUrl: "https://example.com/jesse-james.jpg",
};

describe("DiscoveryCard", () => {
  it("falls back from remote artwork without truncating essential text", () => {
    render(
      <DiscoveryCard
        category="movies"
        item={movie}
        palette={darkPalette}
        active
        swipeCue={null}
        onPress={jest.fn()}
      />
    );

    fireEvent(screen.getByTestId("discovery-artwork"), "error");

    expect(screen.getByTestId("artwork-fallback")).toBeTruthy();
    expect(screen.getByText(movie.title).props.numberOfLines).toBeUndefined();
    expect(screen.getByText(movie.subtitle).props.numberOfLines).toBeUndefined();
  });

  it("combines the item details in its accessible label", () => {
    render(
      <DiscoveryCard
        category="movies"
        item={movie}
        palette={darkPalette}
        active
        swipeCue="save"
        onPress={jest.fn()}
      />
    );

    expect(
      screen.getByRole("button", {
        name: `Movies. ${movie.title}. ${movie.subtitle}. ${movie.meta}`,
      })
    ).toBeTruthy();
    expect(screen.getByText("SAVE")).toBeTruthy();
    expect(screen.queryByText("SKIP")).toBeNull();
  });
});
