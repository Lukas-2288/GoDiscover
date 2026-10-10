import { render } from "@testing-library/react-native";
import { AccessibilityInfo, Platform } from "react-native";

import DiscoveryAnnouncer from "../DiscoveryAnnouncer.native";

it("announces safe Save and Undo failures on iOS", () => {
  const announce = jest
    .spyOn(AccessibilityInfo, "announceForAccessibility")
    .mockImplementation(() => undefined);
  const originalPlatform = Platform.OS;
  Object.defineProperty(Platform, "OS", { configurable: true, value: "ios" });

  const { rerender } = render(
    <DiscoveryAnnouncer
      message={null}
      actionErrorMessage="Couldn't save that one. It's back in your deck."
    />
  );
  expect(announce).toHaveBeenLastCalledWith(
    "Couldn't save that one. It's back in your deck."
  );

  rerender(
    <DiscoveryAnnouncer
      message={null}
      actionErrorMessage="Couldn't undo that save. Try again."
    />
  );
  expect(announce).toHaveBeenLastCalledWith(
    "Couldn't undo that save. Try again."
  );

  Object.defineProperty(Platform, "OS", {
    configurable: true,
    value: originalPlatform,
  });
  announce.mockRestore();
});
