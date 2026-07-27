import React from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

export type SavedAtlasView = "map" | "list";

export function SavedAtlasHeader({
  count,
  query,
  view,
  onQueryChange,
  onViewChange,
  compact = false,
}: {
  count: number;
  query: string;
  view: SavedAtlasView;
  onQueryChange(query: string): void;
  onViewChange(view: SavedAtlasView): void;
  /** Trims the header on a phone so the map itself still fits the viewport. */
  compact?: boolean;
}) {
  return (
    <View style={[styles.header, compact && styles.headerCompact]}>
      <View style={styles.heading}>
        <Text style={styles.kicker}>YOUR COLLECTION</Text>
        <Text style={[styles.title, compact && styles.titleCompact]}>Saved Atlas</Text>
        <Text style={styles.count}>
          {count} {count === 1 ? "work" : "works"} in your collection
        </Text>
      </View>
      <View style={styles.tools}>
        <View style={styles.searchFrame}>
          <Text accessibilityElementsHidden style={styles.searchGlyph}>
            ⌕
          </Text>
          <TextInput
            accessibilityLabel="Search saved atlas"
            onChangeText={onQueryChange}
            placeholder="Find a saved work"
            placeholderTextColor="#777080"
            style={styles.search}
            value={query}
          />
        </View>
        <View accessibilityRole="tablist" style={styles.viewToggle}>
          {(["map", "list"] as const).map((option) => {
            const selected = option === view;
            return (
              <Pressable
                key={option}
                accessibilityLabel={option === "map" ? "Map" : "List"}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => onViewChange(option)}
                style={[styles.viewOption, selected && styles.viewOptionSelected]}
              >
                <Text
                  style={[
                    styles.viewOptionText,
                    selected && styles.viewOptionTextSelected,
                  ]}
                >
                  {option === "map" ? "Map" : "List"}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

export function SavedAtlasEmpty({ onStart }: { onStart(): void }) {
  return (
    <View style={styles.empty}>
      <View accessible={false} style={styles.example}>
        <View style={[styles.exampleLine, styles.exampleLineOne]} />
        <View style={[styles.exampleLine, styles.exampleLineTwo]} />
        <View style={[styles.exampleArt, styles.exampleCover]}>
          <Text style={styles.exampleLetter}>F</Text>
        </View>
        <View style={[styles.exampleArt, styles.exampleSquare]}>
          <Text style={styles.exampleLetter}>A</Text>
        </View>
        <View style={[styles.exampleArt, styles.exampleCircle]}>
          <Text style={styles.exampleLetter}>◎</Text>
        </View>
      </View>
      <Text style={styles.emptyKicker}>A quiet example</Text>
      <Text style={styles.emptyTitle}>The atlas begins with one thing worth keeping.</Text>
      <Text style={styles.emptyCopy}>
        Save a film, book, album, or artist. Their paths will gather here.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onStart}
        style={styles.startButton}
      >
        <Text style={styles.startButtonText}>Start discovering</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "flex-end",
    borderBottomColor: "rgba(244, 241, 234, 0.12)",
    borderBottomWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 22,
    justifyContent: "space-between",
    paddingHorizontal: 28,
    paddingVertical: 20,
  },
  headerCompact: { gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  heading: { minWidth: 220 },
  kicker: {
    color: "#958E9F",
    fontFamily: "IBM Plex Mono",
    fontSize: 9,
    letterSpacing: 1.6,
  },
  title: {
    color: "#F4F1EA",
    fontFamily: "Bricolage Grotesque",
    fontSize: 31,
    fontWeight: "900",
    letterSpacing: -0.6,
    marginTop: 3,
  },
  titleCompact: { fontSize: 22 },
  count: {
    color: "#9B94A4",
    fontFamily: "DM Sans",
    fontSize: 12,
    marginTop: 3,
  },
  tools: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  searchFrame: {
    alignItems: "center",
    backgroundColor: "#211B2A",
    borderColor: "rgba(244, 241, 234, 0.15)",
    borderRadius: 7,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 44,
    minWidth: 230,
    paddingHorizontal: 11,
  },
  searchGlyph: {
    color: "#958E9F",
    fontFamily: "IBM Plex Mono",
    fontSize: 18,
    marginRight: 7,
  },
  search: {
    color: "#F4F1EA",
    flex: 1,
    fontFamily: "DM Sans",
    // Anything under 16px makes iOS Safari zoom the page on focus, and the
    // viewport meta's shrink-to-fit=no leaves the user stuck zoomed in.
    fontSize: 16,
    // The frame around it was already 44px tall, but the input is the thing a
    // finger has to land on.
    minHeight: 44,
    outlineStyle: "none",
  } as any,
  viewToggle: {
    alignItems: "center",
    backgroundColor: "#211B2A",
    borderColor: "rgba(244, 241, 234, 0.15)",
    borderRadius: 7,
    borderWidth: 1,
    flexDirection: "row",
    padding: 3,
  },
  viewOption: {
    alignItems: "center",
    borderRadius: 5,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 54,
    paddingHorizontal: 12,
  },
  viewOptionSelected: { backgroundColor: "#F4F1EA" },
  viewOptionText: {
    color: "#9B94A4",
    fontFamily: "IBM Plex Mono",
    fontSize: 10,
  },
  viewOptionTextSelected: { color: "#15111F", fontWeight: "700" },
  empty: {
    alignItems: "center",
    alignSelf: "center",
    justifyContent: "center",
    maxWidth: 520,
    minHeight: 520,
    padding: 30,
  },
  example: {
    height: 150,
    marginBottom: 30,
    position: "relative",
    width: 260,
  },
  exampleLine: {
    backgroundColor: "rgba(244, 241, 234, 0.24)",
    height: 1,
    left: 68,
    position: "absolute",
    top: 72,
    transformOrigin: "left center" as any,
    width: 130,
  },
  exampleLineOne: { transform: [{ rotate: "-18deg" }] },
  exampleLineTwo: { transform: [{ rotate: "22deg" }] },
  exampleArt: {
    alignItems: "center",
    backgroundColor: "#2A2334",
    borderColor: "rgba(244, 241, 234, 0.28)",
    borderWidth: 1,
    justifyContent: "center",
    overflow: "hidden",
    position: "absolute",
  },
  exampleCover: { height: 82, left: 18, top: 30, width: 55 },
  exampleSquare: { height: 70, left: 103, top: 5, width: 70 },
  exampleCircle: {
    borderRadius: 999,
    height: 68,
    left: 176,
    top: 77,
    width: 68,
  },
  exampleLetter: {
    color: "#C9C3D0",
    fontFamily: "Bricolage Grotesque",
    fontSize: 22,
    fontWeight: "800",
  },
  emptyKicker: {
    color: "#D7F36A",
    fontFamily: "IBM Plex Mono",
    fontSize: 9,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  emptyTitle: {
    color: "#F4F1EA",
    fontFamily: "Bricolage Grotesque",
    fontSize: 28,
    fontWeight: "900",
    lineHeight: 32,
    marginTop: 10,
    textAlign: "center",
  },
  emptyCopy: {
    color: "#A59EAE",
    fontFamily: "DM Sans",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
    textAlign: "center",
  },
  startButton: {
    alignItems: "center",
    backgroundColor: "#F4F1EA",
    borderRadius: 6,
    justifyContent: "center",
    marginTop: 22,
    minHeight: 44,
    paddingHorizontal: 18,
  },
  startButtonText: {
    color: "#15111F",
    fontFamily: "DM Sans",
    fontSize: 13,
    fontWeight: "800",
  },
});
