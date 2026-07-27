import FontAwesome from "@expo/vector-icons/FontAwesome";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "react-native-reanimated";

import { useAppTheme } from "@/components/useAppTheme";
import { useClientOnlyValue } from "@/components/useClientOnlyValue";
import { hydrateThemeMode } from "@/lib/theme";

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from "expo-router";

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: "index",
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
    ...FontAwesome.font,
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  // Read the stored light/dark preference before anything paints, so the app
  // does not flash the system theme on the way to the chosen one.
  useEffect(() => {
    void hydrateThemeMode();
  }, []);

  const hydrated = useClientOnlyValue(false, true);
  if (!hydrated || !loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  // The user's own light/dark choice, not the raw system scheme. Reading the
  // system scheme here meant forcing dark on a light-mode phone left the
  // navigation theme and the status bar on the wrong side of the app.
  const { palette } = useAppTheme();

  return (
    <SafeAreaProvider>
      <ThemeProvider value={palette.isDark ? DarkTheme : DefaultTheme}>
        <StatusBar style={palette.isDark ? "light" : "dark"} />
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: "modal" }} />
        </Stack>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
