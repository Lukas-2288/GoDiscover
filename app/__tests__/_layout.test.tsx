import React from "react";
import { render, screen } from "@testing-library/react-native";

let mockWebHydrated = true;

jest.mock("expo-font", () => ({ useFonts: () => [true, null] }));
jest.mock("expo-splash-screen", () => ({
  hideAsync: jest.fn(),
  preventAutoHideAsync: jest.fn(),
}));
jest.mock("expo-router", () => {
  const React = require("react");
  const { View } = require("react-native");
  const Stack = ({ children }: { children: React.ReactNode }) =>
    React.createElement(View, { accessibilityLabel: "Root navigator" }, children);
  Stack.Screen = () => null;
  return { ErrorBoundary: () => null, Stack };
});
jest.mock("../../components/useClientOnlyValue", () => ({
  useClientOnlyValue: (server: boolean, client: boolean) =>
    mockWebHydrated ? client : server,
}));

import RootLayout from "../_layout";

it("does not hydrate the navigation tree before the browser client effect", () => {
  mockWebHydrated = false;

  render(<RootLayout />);

  expect(screen.queryByLabelText("Root navigator")).toBeNull();
});
