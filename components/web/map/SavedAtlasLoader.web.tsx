import React from "react";
import { Text, View } from "react-native";

import { webPalette } from "../WebHomeScreen";
import type { SavedAtlasProps } from "./SavedAtlas.web";

/**
 * Defers the Saved Atlas — and with it React Flow and d3 — until the map is
 * actually opened.
 *
 * Those libraries are ~314 KB of the web bundle, and the app lands on the
 * archive, so every first visit was paying for a screen most sessions never
 * reach. Metro emits this dynamic import as its own chunk, taking 85 KB gzipped
 * off the critical path.
 *
 * The boundary lives in its own module so tests can substitute it synchronously
 * rather than every render having to await a lazy resolution.
 */
const SavedAtlas = React.lazy(() =>
  import("./SavedAtlas.web").then((module) => ({ default: module.SavedAtlas }))
);

export function SavedAtlasLoader(props: SavedAtlasProps) {
  return (
    <React.Suspense
      fallback={
        <View
          accessibilityLabel="Loading your Saved Atlas"
          style={{
            alignItems: "center",
            flex: 1,
            justifyContent: "center",
            minHeight: props.layout === "mobile" ? 0 : 520,
          }}
        >
          <Text
            style={{
              color: webPalette.muted,
              fontFamily: "IBM Plex Mono",
              fontSize: 10,
              letterSpacing: 1.5,
            }}
          >
            UNFOLDING THE ATLAS
          </Text>
        </View>
      }
    >
      <SavedAtlas {...props} />
    </React.Suspense>
  );
}
