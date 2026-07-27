import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { MapNode } from "../../../lib/storage/discoveryMap";
import type { ContentCategory } from "../../../types/content";
import { thumbnailUrl } from "../../../lib/api/imageSizes";
import { bodyFont, displayFont, monoFont } from "../../../lib/typography";

const CATEGORY_ORDER: readonly ContentCategory[] = [
  "movies",
  "books",
  "albums",
  "artists",
];

const CATEGORY_LABELS: Record<ContentCategory, string> = {
  movies: "Movies",
  books: "Books",
  albums: "Albums",
  artists: "Artists",
};

const CATEGORY_MARKS: Record<ContentCategory, string> = {
  movies: "#9D8CD0",
  books: "#C5AE9A",
  albums: "#8EAAA2",
  artists: "#AAA3B5",
};

export function SavedAtlasList({
  nodes,
  selectedId,
  onSelect,
}: {
  nodes: readonly MapNode[];
  selectedId: string | null;
  onSelect(node: MapNode): void;
}) {
  return (
    <ScrollView
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
    >
      {CATEGORY_ORDER.map((category) => {
        const categoryNodes = nodes.filter((node) => node.category === category);
        if (categoryNodes.length === 0) return null;
        return (
          <View key={category} style={styles.section}>
            <View style={styles.sectionHeader}>
              <View
                accessible={false}
                style={[
                  styles.categoryMark,
                  { backgroundColor: CATEGORY_MARKS[category] },
                ]}
              />
              <Text style={styles.sectionTitle}>{CATEGORY_LABELS[category]}</Text>
              <Text style={styles.count}>{categoryNodes.length}</Text>
            </View>
            <View style={styles.rows}>
              {categoryNodes
                .slice()
                .sort((left, right) => right.savedAt - left.savedAt)
                .map((node) => {
                  const selected = node.id === selectedId;
                  return (
                    <Pressable
                      key={node.id}
                      accessibilityLabel={`Open ${node.title}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => onSelect(node)}
                      style={({ pressed }) => [
                        styles.row,
                        selected && styles.rowSelected,
                        pressed && styles.rowPressed,
                      ]}
                    >
                      <View
                        style={[
                          styles.thumbnail,
                          node.category === "artists" && styles.thumbnailCircle,
                          (node.category === "movies" ||
                            node.category === "books") &&
                            styles.thumbnailCover,
                        ]}
                      >
                        {node.imageUrl ? (
                          <View
                            style={[
                              styles.thumbnailImage,
                              { backgroundImage: `url(${thumbnailUrl(node.imageUrl)})` } as any,
                            ]}
                          />
                        ) : (
                          <Text style={styles.fallbackLetter}>
                            {node.title.slice(0, 1).toUpperCase()}
                          </Text>
                        )}
                      </View>
                      <View style={styles.copy}>
                        <Text numberOfLines={1} style={styles.title}>
                          {node.title}
                        </Text>
                        <Text numberOfLines={1} style={styles.subtitle}>
                          {node.subtitle}
                        </Text>
                      </View>
                      <Text numberOfLines={1} style={styles.meta}>
                        {node.meta}
                      </Text>
                      <Text
                        accessibilityElementsHidden
                        importantForAccessibility="no"
                        style={[styles.arrow, selected && styles.arrowSelected]}
                      >
                        →
                      </Text>
                    </Pressable>
                  );
                })}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: {
    alignSelf: "center",
    gap: 32,
    maxWidth: 980,
    paddingBottom: 64,
    paddingHorizontal: 28,
    paddingTop: 22,
    width: "100%",
  },
  section: { gap: 12 },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
    paddingHorizontal: 4,
  },
  categoryMark: { borderRadius: 999, height: 7, width: 7 },
  sectionTitle: {
    color: "#F4F1EA",
    fontFamily: displayFont,
    fontSize: 21,
    fontWeight: "800",
  },
  count: {
    color: "#8E8799",
    fontFamily: monoFont,
    fontSize: 10,
    marginLeft: "auto",
  },
  rows: {
    borderColor: "rgba(244, 241, 234, 0.13)",
    borderTopWidth: 1,
  },
  row: {
    alignItems: "center",
    borderBottomColor: "rgba(244, 241, 234, 0.13)",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 15,
    minHeight: 82,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  rowSelected: {
    backgroundColor: "rgba(124, 92, 252, 0.11)",
    borderLeftColor: "#7C5CFC",
    borderLeftWidth: 2,
  },
  rowPressed: { backgroundColor: "rgba(244, 241, 234, 0.06)" },
  thumbnail: {
    alignItems: "center",
    backgroundColor: "#272131",
    height: 52,
    justifyContent: "center",
    overflow: "hidden",
    width: 52,
  },
  thumbnailCover: { height: 58, width: 40 },
  thumbnailCircle: { borderRadius: 999 },
  thumbnailImage: {
    backgroundPosition: "center" as any,
    backgroundSize: "cover" as any,
    height: "100%",
    width: "100%",
  },
  fallbackLetter: {
    color: "#F4F1EA",
    fontFamily: displayFont,
    fontSize: 20,
    fontWeight: "800",
  },
  copy: { flex: 1, minWidth: 0 },
  title: {
    color: "#F4F1EA",
    fontFamily: bodyFont,
    fontSize: 15,
    fontWeight: "800",
  },
  subtitle: {
    color: "#A59EAE",
    fontFamily: bodyFont,
    fontSize: 12,
    marginTop: 4,
  },
  meta: {
    color: "#8E8799",
    fontFamily: monoFont,
    fontSize: 9,
    maxWidth: 210,
    textAlign: "right",
  },
  arrow: {
    color: "#8E8799",
    fontFamily: monoFont,
    fontSize: 15,
  },
  arrowSelected: { color: "#D7F36A" },
});
