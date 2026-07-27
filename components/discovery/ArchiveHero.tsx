import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { Palette } from "../../lib/theme";
import { displayFont, monoFont } from "../../lib/typography";

/**
 * The app's front door, matching the archive landing the website opens on.
 *
 * The app used to drop you straight onto a category picker with no framing —
 * functional, but it never said what the place was. The copy here is
 * deliberately identical to the site's so the two read as one product.
 */
export function ArchiveHero({
  palette,
  onSurprise,
}: {
  palette: Palette;
  onSurprise(): void;
}) {
  return (
    <View style={styles.hero}>
      <View style={styles.copy}>
        <Text style={[styles.eyebrow, { color: palette.tangerine }]}>
          THE ARCHIVE IS OPEN
        </Text>
        <Text style={[styles.title, { color: palette.text }]}>
          Find a new{"\n"}favourite rabbit hole.
        </Text>
        <Text style={[styles.body, { color: palette.textMuted }]}>
          Browse the shelves, follow a strange connection, and let the next great
          thing find you.
        </Text>
        <Pressable
          accessibilityLabel="Surprise me"
          accessibilityRole="button"
          onPress={onSurprise}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: palette.accent, opacity: pressed ? 0.82 : 1 },
          ]}
        >
          <Text style={[styles.buttonText, { color: palette.onAccent }]}>
            Surprise me
          </Text>
          <FontAwesome
            accessible={false}
            name="long-arrow-right"
            size={15}
            color={palette.onAccent}
          />
        </Pressable>
      </View>

      {/* Decorative only — the copy above already says everything this does. */}
      <View
        accessible={false}
        aria-hidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.stamp, { borderColor: palette.tangerine }]}
      >
        <Text style={[styles.stampText, { color: palette.tangerine }]}>EST.</Text>
        <Text style={[styles.stampYear, { color: palette.text }]}>2026</Text>
        <Text style={[styles.stampText, { color: palette.tangerine }]}>
          KEEP LOOKING
        </Text>
      </View>
    </View>
  );
}

/** The site numbers its sections; the app now speaks the same way. */
export function SectionHeading({
  kicker,
  title,
  palette,
}: {
  kicker: string;
  title: string;
  palette: Palette;
}) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={[styles.sectionKicker, { color: palette.mint }]}>
        {kicker}
      </Text>
      <Text style={[styles.sectionTitle, { color: palette.text }]}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Wraps rather than forcing the stamp alongside the copy: on a narrow phone
  // there is no room for both, and a row that cannot give is what pushed the
  // same stamp off the edge of the website.
  hero: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 18,
    justifyContent: "space-between",
    paddingBottom: 8,
  },
  copy: { flexBasis: 0, flexGrow: 1, flexShrink: 1, minWidth: 240 },
  eyebrow: {
    fontFamily: monoFont,
    fontSize: 11,
    letterSpacing: 1.8,
  },
  title: {
    fontFamily: displayFont,
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: -1,
    lineHeight: 40,
    marginTop: 10,
  },
  body: {
    fontSize: 15,
    lineHeight: 23,
    marginTop: 14,
  },
  button: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: 999,
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    marginTop: 20,
    minHeight: 46,
    paddingHorizontal: 20,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "800",
  },
  stamp: {
    alignItems: "center",
    borderRadius: 100,
    borderWidth: 1,
    height: 116,
    justifyContent: "center",
    marginTop: 8,
    transform: [{ rotate: "8deg" }],
    width: 116,
  },
  stampText: {
    fontFamily: monoFont,
    fontSize: 8,
    letterSpacing: 1,
  },
  stampYear: {
    fontFamily: displayFont,
    fontSize: 24,
    fontWeight: "900",
    marginVertical: 3,
  },
  sectionHeading: { gap: 4 },
  sectionKicker: {
    fontFamily: monoFont,
    fontSize: 10,
    letterSpacing: 1.6,
  },
  sectionTitle: {
    fontFamily: displayFont,
    fontSize: 26,
    fontWeight: "900",
    marginTop: 2,
  },
});
