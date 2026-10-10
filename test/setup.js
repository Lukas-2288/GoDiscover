// Shared jest setup, registered as `setupFiles` in jest.config.js.

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

// Deliberately *not* the library's own jest mock, which reports zero insets on
// every edge. Padding computed from a zero inset is indistinguishable from
// padding that ignores insets altogether — which is exactly the bug the native
// screen used to have, with a hardcoded 54pt top and 40pt bottom. Realistic
// notch metrics let a test tell the two apart.
const MOCK_INSETS = { bottom: 34, left: 0, right: 0, top: 59 };
const MOCK_FRAME = { height: 844, width: 390, x: 0, y: 0 };

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaProvider: ({ children }) => children,
  SafeAreaView: ({ children }) => children,
  SafeAreaInsetsContext: {
    Consumer: ({ children }) => children(MOCK_INSETS),
    Provider: ({ children }) => children,
  },
  useSafeAreaInsets: () => MOCK_INSETS,
  useSafeAreaFrame: () => MOCK_FRAME,
  initialWindowMetrics: { frame: MOCK_FRAME, insets: MOCK_INSETS },
}));

// Exposed so a test can assert against the same numbers the mock serves.
global.__MOCK_SAFE_AREA_INSETS__ = MOCK_INSETS;
