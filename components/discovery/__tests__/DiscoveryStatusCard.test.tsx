import { fireEvent, render, screen } from "@testing-library/react-native";

import { darkPalette } from "../../../lib/theme";
import {
  DiscoveryStatusCard,
  type DiscoveryStatusCardProps,
} from "../DiscoveryStatusCard";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

describe("DiscoveryStatusCard", () => {
  it("shows a stable error message and Retry button", () => {
    const onRetry = jest.fn();
    render(
      <DiscoveryStatusCard
        kind="error"
        message="Movies could not be loaded."
        onRetry={onRetry}
        palette={darkPalette}
      />
    );

    expect(screen.getByText("Movies could not be loaded.")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows an empty state and its supplied action", () => {
    const onAction = jest.fn();
    render(
      <DiscoveryStatusCard
        kind="empty"
        label="No movies are waiting in this deck."
        actionLabel="Shuffle again"
        onAction={onAction}
        palette={darkPalette}
      />
    );

    expect(screen.getByText("No movies are waiting in this deck.")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Shuffle again" }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("gives the loading state a readable status label", () => {
    render(
      <DiscoveryStatusCard
        kind="loading"
        label="Shuffling movies"
        palette={darkPalette}
        reducedMotion={false}
      />
    );

    expect(screen.getByRole("progressbar", { name: "Shuffling movies" })).toBeTruthy();
    expect(screen.getByText("Shuffling movies")).toBeTruthy();
  });

  it("accepts only presentation-safe error messages", () => {
    type ErrorStatus = Extract<DiscoveryStatusCardProps, { kind: "error" }>;
    type RawErrorAccepted = Error extends ErrorStatus["message"] ? true : false;
    const rawErrorAccepted: RawErrorAccepted = false;

    expect(rawErrorAccepted).toBe(false);
  });
});
