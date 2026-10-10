import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { darkPalette } from "../../../lib/theme";
import { DiscoveryActions } from "../DiscoveryActions";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("@expo/vector-icons/FontAwesome", () => "FontAwesome");

describe("DiscoveryActions", () => {
  it("exposes all three decisions as labeled buttons", () => {
    const onSave = jest.fn();
    const onSkip = jest.fn();
    const onSimilar = jest.fn();
    render(
      <DiscoveryActions
        disabled={false}
        palette={darkPalette}
        accent="#FF5CA8"
        onAccent="#19000C"
        onSave={onSave}
        onSkip={onSkip}
        onSimilar={onSimilar}
      />
    );

    fireEvent.press(screen.getByRole("button", { name: "Save" }));
    fireEvent.press(screen.getByRole("button", { name: "Not for me" }));
    fireEvent.press(screen.getByRole("button", { name: "Find similar" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onSimilar).toHaveBeenCalledTimes(1);
  });

  it("uses growable 44-point targets and exposes disabled state", () => {
    render(
      <DiscoveryActions
        disabled
        palette={darkPalette}
        accent="#FF5CA8"
        onAccent="#19000C"
        onSave={jest.fn()}
        onSkip={jest.fn()}
        onSimilar={jest.fn()}
      />
    );

    ["Save", "Not for me", "Find similar"].forEach((name) => {
      const button = screen.getByRole("button", { name });
      const style = StyleSheet.flatten(button.props.style);

      expect(button.props.accessibilityState).toEqual({ disabled: true });
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
      expect(style.minWidth).toBeGreaterThanOrEqual(44);
      expect(style.height).toBeUndefined();
    });
  });

  it("keeps action buttons and labels contained when text scales", () => {
    render(
      <DiscoveryActions
        disabled={false}
        palette={darkPalette}
        accent="#FF5CA8"
        onAccent="#19000C"
        onSave={jest.fn()}
        onSkip={jest.fn()}
        onSimilar={jest.fn()}
      />
    );

    ["Save", "Not for me", "Find similar"].forEach((name) => {
      const button = screen.getByRole("button", { name });
      const buttonStyle = StyleSheet.flatten(button.props.style);
      const labelStyle = StyleSheet.flatten(screen.getByText(name).props.style);

      expect(buttonStyle.maxWidth).toBe("100%");
      expect(buttonStyle.flexShrink).toBeGreaterThanOrEqual(1);
      expect(labelStyle.flexShrink).toBeGreaterThanOrEqual(1);
      expect(labelStyle.flexWrap).toBe("wrap");
      expect(labelStyle.textAlign).toBe("center");
      expect(labelStyle.numberOfLines).toBeUndefined();
    });
  });
});
