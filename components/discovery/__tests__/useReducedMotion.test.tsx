import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import { useReducedMotion } from "../useReducedMotion";

afterEach(() => {
  jest.restoreAllMocks();
});

it("tracks changes and removes its subscription", async () => {
  let onChange: ((enabled: boolean) => void) | undefined;
  const remove = jest.fn();
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, "addEventListener").mockImplementation(
    ((_event: string, handler: (enabled: boolean) => void) => {
      onChange = handler;
      return { remove };
    }) as unknown as typeof AccessibilityInfo.addEventListener
  );

  const { result, unmount } = renderHook(() => useReducedMotion());

  await waitFor(() => expect(result.current).toBe(false));
  act(() => onChange?.(true));
  expect(result.current).toBe(true);
  unmount();
  expect(remove).toHaveBeenCalledTimes(1);
});
