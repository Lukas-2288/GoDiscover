import AntDesign from "@expo/vector-icons/AntDesign";
import { useMemo } from "react";
import {
  Image,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { thumbnailUrl } from "../../lib/api/imageSizes";
import { CATEGORY_ORDER, getCategoryTheme } from "../../lib/discovery/categoryThemes";
import type { SavedItem } from "../../lib/storage/saved";
import type { Palette } from "../../lib/theme";
import { bodyFont, displayFont, monoFont } from "../../lib/typography";
import type { ContentCategory } from "../../types/content";

/**
 * Everything saved, grouped by category, newest first inside each.
 *
 * A `SectionList` rather than the `ScrollView` + `.map()` this replaces: that
 * built every row on every render whether or not it was on screen, which is
 * fine for six saves and not for six hundred. `SectionList` is also the
 * primitive that matches the shape of the data, so the category headers come
 * for free instead of being hand-rolled per platform.
 *
 * Deliberately not `FlashList`: a personal collection sits far below the
 * scale where its extra dependency earns anything.
 */

export type SavedListProps = {
  items: readonly SavedItem[];
  palette: Palette;
  onOpen(item: SavedItem): void;
  /**
   * Saved things are the ones a person liked most, so they are the best
   * similarity seeds in the app — and until now the slowest place to start
   * one, because it meant opening the detail sheet first.
   */
  onSimilar(item: SavedItem): void;
  onRemove(item: SavedItem): void;
  /** Disables every row action while a save or removal is in flight. */
  busy?: boolean;
  ListHeaderComponent?: React.ComponentProps<
    typeof SectionList
  >["ListHeaderComponent"];
};

type SavedSection = { category: ContentCategory; title: string; data: SavedItem[] };

function buildSections(items: readonly SavedItem[]): SavedSection[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    title: getCategoryTheme(category).label,
    data: items
      .filter((item) => item.category === category)
      .sort((left, right) => right.savedAt - left.savedAt),
  })).filter((section) => section.data.length > 0);
}

export function SavedList({
  items,
  palette,
  onOpen,
  onSimilar,
  onRemove,
  busy = false,
  ListHeaderComponent,
}: SavedListProps) {
  const sections = useMemo(() => buildSections(items), [items]);
  const styles = useMemo(() => makeStyles(palette), [palette]);

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => `${item.category}:${item.id}`}
      ListHeaderComponent={ListHeaderComponent}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      stickySectionHeadersEnabled={false}
      renderSectionHeader={({ section }) => {
        const theme = getCategoryTheme((section as SavedSection).category);
        return (
          <View style={styles.sectionHeader}>
            <View
              accessible={false}
              style={[styles.categoryMark, { backgroundColor: theme.accent }]}
            />
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.count}>{section.data.length}</Text>
          </View>
        );
      }}
      renderItem={({ item }) => (
        <SavedRow
          item={item}
          styles={styles}
          palette={palette}
          busy={busy}
          onOpen={onOpen}
          onSimilar={onSimilar}
          onRemove={onRemove}
        />
      )}
    />
  );
}

function SavedRow({
  item,
  styles,
  palette,
  busy,
  onOpen,
  onSimilar,
  onRemove,
}: {
  item: SavedItem;
  styles: ReturnType<typeof makeStyles>;
  palette: Palette;
  busy: boolean;
  onOpen(item: SavedItem): void;
  onSimilar(item: SavedItem): void;
  onRemove(item: SavedItem): void;
}) {
  const theme = getCategoryTheme(item.category);
  // Artists read as portraits, films and books as covers, records as squares.
  const shape =
    item.category === "artists"
      ? styles.thumbnailCircle
      : item.category === "movies" || item.category === "books"
      ? styles.thumbnailCover
      : null;
  // Artist rows carry an empty `meta`, so this avoids a stranded separator.
  const detail = [item.subtitle, item.meta].filter(Boolean).join(" · ");

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityLabel={`Open ${item.title} details`}
        accessibilityRole="button"
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={() => onOpen(item)}
        style={({ pressed }) => [styles.rowMain, pressed && styles.rowPressed]}
      >
        <View style={[styles.thumbnail, shape]}>
          {item.imageUrl ? (
            <Image
              accessible={false}
              source={{ uri: thumbnailUrl(item.imageUrl) }}
              style={styles.thumbnailImage}
            />
          ) : (
            <Text style={styles.fallbackLetter}>
              {item.title.slice(0, 1).toUpperCase()}
            </Text>
          )}
        </View>
        <View style={styles.copy}>
          <Text numberOfLines={1} style={styles.title}>
            {item.title}
          </Text>
          {detail ? (
            <Text numberOfLines={1} style={styles.subtitle}>
              {detail}
            </Text>
          ) : null}
        </View>
      </Pressable>

      <Pressable
        accessibilityLabel={`Find ${theme.singular}s similar to ${item.title}`}
        accessibilityRole="button"
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={() => onSimilar(item)}
        style={({ pressed }) => [styles.rowAction, pressed && styles.rowPressed]}
      >
        <AntDesign
          accessible={false}
          name="star"
          size={17}
          color={palette.textMuted}
        />
      </Pressable>

      <Pressable
        accessibilityLabel={`Remove ${item.title} from saved discoveries`}
        accessibilityRole="button"
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={() => onRemove(item)}
        style={({ pressed }) => [styles.rowAction, pressed && styles.rowPressed]}
      >
        <AntDesign
          accessible={false}
          name="close"
          size={17}
          color={palette.textMuted}
        />
      </Pressable>
    </View>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    content: {
      gap: 8,
      paddingBottom: 40,
    },
    sectionHeader: {
      alignItems: "center",
      flexDirection: "row",
      gap: 9,
      paddingBottom: 8,
      paddingTop: 20,
    },
    categoryMark: { borderRadius: 999, height: 7, width: 7 },
    sectionTitle: {
      color: c.text,
      fontFamily: displayFont,
      fontSize: 19,
      fontWeight: "800",
    },
    count: {
      color: c.textFaint,
      fontFamily: monoFont,
      fontSize: 10,
      marginLeft: "auto",
    },
    row: {
      alignItems: "center",
      borderBottomColor: c.border,
      borderBottomWidth: 1,
      flexDirection: "row",
    },
    rowMain: {
      alignItems: "center",
      flex: 1,
      flexDirection: "row",
      gap: 14,
      // The 44pt floor every interactive control in this app clears.
      minHeight: 44,
      paddingVertical: 10,
    },
    rowAction: {
      alignItems: "center",
      justifyContent: "center",
      minHeight: 44,
      minWidth: 44,
    },
    rowPressed: { opacity: 0.6 },
    thumbnail: {
      alignItems: "center",
      backgroundColor: c.surfaceAlt,
      borderRadius: 6,
      height: 52,
      justifyContent: "center",
      overflow: "hidden",
      width: 52,
    },
    thumbnailCover: { height: 58, width: 40 },
    thumbnailCircle: { borderRadius: 999 },
    thumbnailImage: { height: "100%", width: "100%" },
    fallbackLetter: {
      color: c.textMuted,
      fontFamily: displayFont,
      fontSize: 20,
      fontWeight: "800",
    },
    copy: { flex: 1, minWidth: 0 },
    title: {
      color: c.text,
      fontFamily: bodyFont,
      fontSize: 15,
      fontWeight: "700",
    },
    subtitle: {
      color: c.textMuted,
      fontFamily: bodyFont,
      fontSize: 12,
      marginTop: 3,
    },
  });
}
