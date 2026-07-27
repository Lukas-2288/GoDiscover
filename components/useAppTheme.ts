import { useSyncExternalStore } from "react";

import { useColorScheme } from "./useColorScheme";
import {
  getThemeMode,
  resolvePalette,
  subscribeThemeMode,
  type Palette,
  type ThemeMode,
} from "../lib/theme";

export type AppTheme = {
  mode: ThemeMode;
  palette: Palette;
};

/**
 * Resolves the palette every part of the app should be painting with.
 *
 * Both the root layout and the home screen call this, and they have to agree:
 * the layout sets the navigation theme and the status bar style, the screen
 * paints everything else. Reading from the shared store in `lib/theme` is what
 * makes "force dark on a light-mode phone" come out consistent instead of
 * leaving a dark status bar over a dark top bar.
 */
export function useAppTheme(): AppTheme {
  const mode = useSyncExternalStore(
    subscribeThemeMode,
    getThemeMode,
    getThemeMode
  );
  const systemScheme = useColorScheme();
  return { mode, palette: resolvePalette(mode, systemScheme === "dark") };
}
