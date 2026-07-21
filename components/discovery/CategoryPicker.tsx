import FontAwesome from "@expo/vector-icons/FontAwesome";
import type { ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

import {
  CATEGORY_ORDER,
  getCategoryTheme,
  type CategoryPattern,
} from "../../lib/discovery/categoryThemes";
import type { Palette } from "../../lib/theme";
import type { ContentCategory } from "../../types/content";

export type CategoryPickerProps = {
  selected: ContentCategory | null;
  compact: boolean;
  palette: Palette;
  onSelect(category: ContentCategory): void;
};

function CategoryPatternView({
  pattern,
  color,
}: {
  pattern: CategoryPattern;
  color: string;
}) {
  let shapes: ReactNode;

  if (pattern === "record") {
    shapes = (
      <>
        <View style={[styles.recordOuter, { borderColor: color }]} />
        <View style={[styles.recordInner, { borderColor: color }]} />
      </>
    );
  } else if (pattern === "paper") {
    shapes = [18, 42, 66, 90].map((top) => (
      <View key={top} style={[styles.paperLine, { top, backgroundColor: color }]} />
    ));
  } else if (pattern === "ticket") {
    shapes = [12, 38, 64, 90].map((top) => (
      <View key={top} style={[styles.ticketDot, { top, borderColor: color }]} />
    ));
  } else {
    shapes = (
      <>
        <View style={[styles.backstageStripe, { backgroundColor: color }]} />
        <View
          style={[
            styles.backstageStripe,
            styles.backstageStripeOffset,
            { backgroundColor: color },
          ]}
        />
      </>
    );
  }

  return (
    <View
      style={styles.pattern}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      aria-hidden
    >
      {shapes}
    </View>
  );
}

export function CategoryPicker({
  selected,
  compact,
  palette,
  onSelect,
}: CategoryPickerProps) {
  const { width } = useWindowDimensions();

  if (compact && selected) {
    const theme = getCategoryTheme(selected);
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Change category. ${theme.label} selected`}
        onPress={() => onSelect(selected)}
        style={({ pressed }) => [
          styles.compactButton,
          {
            backgroundColor: palette.surface,
            borderColor: theme.accent,
            opacity: pressed ? 0.75 : 1,
          },
        ]}
      >
        <FontAwesome name={theme.icon} size={16} color={theme.accent} />
        <Text style={[styles.compactLabel, { color: palette.text }]}>
          {theme.label}
        </Text>
        <FontAwesome name="chevron-down" size={12} color={palette.textMuted} />
      </Pressable>
    );
  }

  const isWide = width >= 760;

  return (
    <View style={styles.grid}>
      {CATEGORY_ORDER.map((category) => {
        const theme = getCategoryTheme(category);
        const isSelected = selected === category;
        return (
          <Pressable
            key={category}
            accessibilityRole="button"
            accessibilityLabel={theme.label}
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelect(category)}
            style={({ pressed }) => [
              styles.tile,
              isWide ? styles.tileWide : styles.tileNarrow,
              {
                backgroundColor: palette.isDark
                  ? theme.softDark
                  : theme.softLight,
                borderColor: isSelected ? theme.accent : palette.border,
                opacity: pressed ? 0.78 : 1,
              },
            ]}
          >
            <CategoryPatternView pattern={theme.pattern} color={theme.accent} />
            <View style={styles.tileContent}>
              <FontAwesome name={theme.icon} size={25} color={theme.accent} />
              <Text style={[styles.tileLabel, { color: palette.text }]}>
                {theme.label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    alignSelf: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "center",
    maxWidth: 960,
    width: "100%",
  },
  tile: {
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: "flex-end",
    minHeight: 112,
    overflow: "hidden",
    padding: 16,
  },
  tileNarrow: {
    width: "48%",
  },
  tileWide: {
    width: "23.5%",
  },
  tileContent: {
    gap: 10,
    zIndex: 1,
  },
  tileLabel: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  compactButton: {
    alignItems: "center",
    alignSelf: "center",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 9,
    height: 44,
    maxWidth: 960,
    paddingHorizontal: 14,
    width: "100%",
  },
  compactLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
  },
  pattern: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.14,
    overflow: "hidden",
  },
  recordOuter: {
    borderRadius: 64,
    borderWidth: 12,
    height: 128,
    position: "absolute",
    right: -24,
    top: -22,
    width: 128,
  },
  recordInner: {
    borderRadius: 26,
    borderWidth: 8,
    height: 52,
    position: "absolute",
    right: 14,
    top: 16,
    width: 52,
  },
  paperLine: {
    height: 2,
    left: 12,
    position: "absolute",
    right: 12,
  },
  ticketDot: {
    borderRadius: 7,
    borderWidth: 3,
    height: 14,
    position: "absolute",
    right: 10,
    width: 14,
  },
  backstageStripe: {
    height: 18,
    position: "absolute",
    right: -34,
    top: 24,
    transform: [{ rotate: "-35deg" }],
    width: 150,
  },
  backstageStripeOffset: {
    top: 72,
  },
});
