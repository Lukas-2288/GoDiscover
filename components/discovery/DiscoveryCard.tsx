import FontAwesome from "@expo/vector-icons/FontAwesome";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type View as NativeView,
} from "react-native";

import {
  getCategoryTheme,
  resolveCategorySecondary,
  type CategoryPattern,
} from "../../lib/discovery/categoryThemes";
import type { Palette } from "../../lib/theme";
import type { ContentCategory, ResultItem } from "../../types/content";

export type DiscoveryCardHandle = {
  focus(): void;
};

export type DiscoveryCardProps = {
  category: ContentCategory;
  item: ResultItem;
  palette: Palette;
  active: boolean;
  swipeCue: "save" | "skip" | null;
  onPress(): void;
};

function HiddenDecoration({
  children,
  style,
}: {
  children?: React.ReactNode;
  style: object;
}) {
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
      style={style}
    >
      {children}
    </View>
  );
}

function CardPattern({ pattern, color }: { pattern: CategoryPattern; color: string }) {
  if (pattern === "record") {
    return (
      <HiddenDecoration style={styles.pattern}>
        <View style={[styles.record, { borderColor: color }]} />
        <View style={[styles.recordCenter, { backgroundColor: color }]} />
      </HiddenDecoration>
    );
  }

  if (pattern === "paper") {
    return (
      <HiddenDecoration style={styles.pattern}>
        {[24, 54, 84, 114].map((top) => (
          <View key={top} style={[styles.paperLine, { top, backgroundColor: color }]} />
        ))}
      </HiddenDecoration>
    );
  }

  if (pattern === "ticket") {
    return (
      <HiddenDecoration style={styles.pattern}>
        {[18, 54, 90, 126].map((top) => (
          <View key={top} style={[styles.ticketDot, { top, borderColor: color }]} />
        ))}
      </HiddenDecoration>
    );
  }

  return (
    <HiddenDecoration style={styles.pattern}>
      <View style={[styles.backstageStripe, { backgroundColor: color }]} />
      <View style={[styles.backstageStripe, styles.backstageStripeOffset, { backgroundColor: color }]} />
    </HiddenDecoration>
  );
}

export const DiscoveryCard = forwardRef<DiscoveryCardHandle, DiscoveryCardProps>(
  function DiscoveryCard(
    { category, item, palette, active, swipeCue, onPress },
    forwardedRef
  ) {
    const cardRef = useRef<NativeView>(null);
    const [imageFailed, setImageFailed] = useState(false);
    const theme = getCategoryTheme(category);
    const showArtwork = Boolean(item.imageUrl) && !imageFailed;
    const accessibleLabel = [theme.label, item.title, item.subtitle, item.meta]
      .filter(Boolean)
      .join(". ");

    useEffect(() => {
      setImageFailed(false);
    }, [item.imageUrl]);

    useImperativeHandle(
      forwardedRef,
      () => ({
        focus() {
          cardRef.current?.focus();
        },
      }),
      []
    );

    return (
      <Pressable
        ref={cardRef}
        accessible={active}
        accessibilityElementsHidden={!active}
        accessibilityLabel={accessibleLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled: !active }}
        aria-hidden={!active}
        disabled={!active}
        importantForAccessibility={active ? "yes" : "no-hide-descendants"}
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: palette.surface,
            borderColor: active ? theme.accent : palette.border,
            opacity: pressed ? 0.94 : 1,
          },
        ]}
      >
        <CardPattern pattern={theme.pattern} color={theme.accent} />
        <HiddenDecoration
          style={[
            styles.tape,
            { backgroundColor: resolveCategorySecondary(theme, palette.isDark) },
          ]}
        />
        <HiddenDecoration style={[styles.stamp, { borderColor: theme.accent }]}>
          <FontAwesome name={theme.icon} size={17} color={theme.accent} />
        </HiddenDecoration>

        <View style={styles.badgeRow}>
          <View style={[styles.badge, { backgroundColor: theme.accent }]}>
            <Text style={[styles.badgeText, { color: theme.onAccent }]}>{theme.badge}</Text>
          </View>
        </View>

        <View style={styles.artworkFrame}>
          {showArtwork ? (
            <Image
              accessible={false}
              onError={() => setImageFailed(true)}
              resizeMode="cover"
              source={{ uri: item.imageUrl }}
              style={styles.artwork}
              testID="discovery-artwork"
            />
          ) : (
            <View
              style={[
                styles.fallback,
                {
                  backgroundColor: palette.isDark ? theme.softDark : theme.softLight,
                },
              ]}
              testID="artwork-fallback"
            >
              <FontAwesome
                accessible={false}
                name={theme.icon}
                size={58}
                color={theme.accent}
              />
              <Text style={[styles.fallbackText, { color: theme.accent }]}>{theme.label}</Text>
            </View>
          )}

          {swipeCue ? (
            <View
              style={[
                styles.swipeCue,
                swipeCue === "save" ? styles.saveCue : styles.skipCue,
                {
                  backgroundColor: palette.overlay,
                  borderColor: swipeCue === "save" ? palette.success : palette.danger,
                },
              ]}
            >
              <Text
                style={[
                  styles.swipeCueText,
                  { color: swipeCue === "save" ? palette.success : palette.danger },
                ]}
              >
                {swipeCue === "save" ? "SAVE" : "SKIP"}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.copy}>
          <Text style={[styles.title, { color: palette.text }]}>{item.title}</Text>
          <Text style={[styles.subtitle, { color: palette.textSecondary }]}>{item.subtitle}</Text>
          {item.meta ? (
            <Text style={[styles.meta, { color: palette.textMuted }]}>{item.meta}</Text>
          ) : null}
        </View>
      </Pressable>
    );
  }
);

const styles = StyleSheet.create({
  card: {
    borderRadius: 26,
    borderWidth: 1,
    gap: 16,
    maxWidth: 560,
    overflow: "hidden",
    padding: 18,
    width: "100%",
  },
  pattern: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.08,
    overflow: "hidden",
  },
  tape: {
    height: 26,
    opacity: 0.25,
    position: "absolute",
    right: 42,
    top: 5,
    transform: [{ rotate: "-5deg" }],
    width: 82,
  },
  stamp: {
    alignItems: "center",
    borderRadius: 24,
    borderWidth: 2,
    bottom: 20,
    height: 46,
    justifyContent: "center",
    opacity: 0.34,
    position: "absolute",
    right: 18,
    transform: [{ rotate: "9deg" }],
    width: 46,
  },
  record: {
    borderRadius: 90,
    borderWidth: 22,
    height: 180,
    position: "absolute",
    right: -48,
    top: 46,
    width: 180,
  },
  recordCenter: {
    borderRadius: 12,
    height: 24,
    position: "absolute",
    right: 30,
    top: 124,
    width: 24,
  },
  paperLine: {
    height: 2,
    left: 16,
    position: "absolute",
    right: 16,
  },
  ticketDot: {
    borderRadius: 8,
    borderWidth: 3,
    height: 16,
    position: "absolute",
    right: 14,
    width: 16,
  },
  backstageStripe: {
    height: 24,
    position: "absolute",
    right: -44,
    top: 70,
    transform: [{ rotate: "-32deg" }],
    width: 210,
  },
  backstageStripeOffset: {
    top: 126,
  },
  badgeRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    paddingRight: 68,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  artworkFrame: {
    aspectRatio: 4 / 5,
    borderRadius: 20,
    overflow: "hidden",
    position: "relative",
    width: "100%",
  },
  artwork: {
    height: "100%",
    width: "100%",
  },
  fallback: {
    alignItems: "center",
    gap: 12,
    height: "100%",
    justifyContent: "center",
    padding: 24,
    width: "100%",
  },
  fallbackText: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  swipeCue: {
    borderRadius: 12,
    borderWidth: 3,
    paddingHorizontal: 16,
    paddingVertical: 9,
    position: "absolute",
    top: 24,
  },
  saveCue: {
    right: 22,
    transform: [{ rotate: "7deg" }],
  },
  skipCue: {
    left: 22,
    transform: [{ rotate: "-7deg" }],
  },
  swipeCueText: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  copy: {
    gap: 7,
    paddingBottom: 4,
    paddingRight: 44,
  },
  title: {
    fontSize: 27,
    fontWeight: "900",
    letterSpacing: -0.5,
    lineHeight: 32,
  },
  subtitle: {
    fontSize: 17,
    fontWeight: "600",
    lineHeight: 23,
  },
  meta: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },
});
