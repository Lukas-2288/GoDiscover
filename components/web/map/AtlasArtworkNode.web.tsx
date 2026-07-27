import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import type { AtlasArtworkData } from "./atlasGraph";
import { thumbnailUrl } from "../../../lib/api/imageSizes";
import { bodyFont, displayFont, monoFont } from "../../../lib/typography";

export type AtlasArtworkNodeDefinition = Node<
  AtlasArtworkData,
  "artwork"
>;

export function AtlasArtworkNode({
  data,
}: NodeProps<AtlasArtworkNodeDefinition>) {
  const { node, shape, imageUrl, selected, active, showTitle, showMeta, summary, faded, transient } = data;
  const categoryLabel =
    node.category === "movies"
      ? "FILM"
      : node.category === "books"
        ? "BOOK"
        : node.category === "albums"
          ? "ALBUM"
          : "ARTIST";

  return (
    <View
      aria-selected={selected}
      accessibilityState={{ selected }}
      style={[
        styles.frame,
        shape === "circle" && styles.circle,
        selected && styles.selected,
        active && styles.active,
        faded && styles.faded,
        transient && styles.transient,
      ]}
      testID={`atlas-artwork-${node.id}`}
    >
      <Handle
        isConnectable={false}
        position={Position.Left}
        style={hiddenHandleStyle}
        type="target"
      />
      <Handle
        isConnectable={false}
        position={Position.Right}
        style={hiddenHandleStyle}
        type="source"
      />
      {imageUrl ? (
        <View
          style={[
            styles.image,
            { backgroundImage: `url(${thumbnailUrl(imageUrl)})` } as any,
          ]}
        />
      ) : (
        <View style={styles.fallback}>
          <Text style={styles.fallbackCategory}>{categoryLabel}</Text>
          <Text numberOfLines={3} style={styles.fallbackTitle}>
            {node.title}
          </Text>
        </View>
      )}
      <View accessible={false} style={styles.wash} />
      <Text style={styles.category}>{categoryLabel}</Text>
      {selected ? <View accessible={false} style={styles.focusMark} /> : null}
      {summary ? <Text style={styles.summary}>{summary}</Text> : null}
      {showTitle ? (
        <View style={styles.caption}>
          <Text numberOfLines={2} style={styles.title}>
            {node.title}
          </Text>
          {showMeta ? (
            <>
              <Text numberOfLines={1} style={styles.subtitle}>
                {node.subtitle}
              </Text>
              <Text numberOfLines={1} style={styles.meta}>
                {node.meta}
              </Text>
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const hiddenHandleStyle: React.CSSProperties = {
  border: 0,
  height: 1,
  minHeight: 1,
  minWidth: 1,
  opacity: 0,
  pointerEvents: "none",
  width: 1,
};

const styles = StyleSheet.create({
  frame: {
    backgroundColor: "#292231",
    borderColor: "rgba(244, 241, 234, 0.28)",
    borderRadius: 3,
    borderWidth: 1,
    height: "100%",
    overflow: "visible",
    position: "relative",
    shadowColor: "#050309",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.38,
    shadowRadius: 13,
    width: "100%",
  },
  circle: { borderRadius: 999 },
  selected: {
    borderColor: "#7C5CFC",
    borderWidth: 2,
    shadowColor: "#7C5CFC",
    shadowOpacity: 0.34,
    shadowRadius: 16,
  },
  active: {
    borderColor: "#D7F36A",
    borderWidth: 2,
    shadowColor: "#D7F36A",
    shadowOpacity: 0.5,
    shadowRadius: 18,
  },
  faded: { opacity: 0.23 },
  transient: { borderColor: "#D7F36A", borderStyle: "dashed" },
  image: {
    backgroundPosition: "center" as any,
    backgroundRepeat: "no-repeat" as any,
    backgroundSize: "cover" as any,
    borderRadius: "inherit" as any,
    height: "100%",
    overflow: "hidden",
    width: "100%",
  },
  fallback: {
    height: "100%",
    justifyContent: "space-between",
    overflow: "hidden",
    padding: 9,
    width: "100%",
  },
  fallbackCategory: {
    color: "#91899B",
    fontFamily: monoFont,
    fontSize: 7,
    letterSpacing: 1.2,
  },
  fallbackTitle: {
    color: "#F4F1EA",
    fontFamily: displayFont,
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 16,
  },
  wash: {
    backgroundColor: "rgba(21, 17, 31, 0.07)",
    borderRadius: "inherit" as any,
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  category: {
    backgroundColor: "rgba(21, 17, 31, 0.84)",
    bottom: 6,
    color: "#D7D1DC",
    fontFamily: monoFont,
    fontSize: 7,
    left: 6,
    letterSpacing: 0.8,
    paddingHorizontal: 4,
    paddingVertical: 3,
    position: "absolute",
  },
  focusMark: {
    backgroundColor: "#D7F36A",
    borderColor: "#15111F",
    borderRadius: 999,
    borderWidth: 2,
    height: 12,
    position: "absolute",
    right: -6,
    top: -6,
    width: 12,
  },
  summary: {
    color: "#B9B2C1",
    fontFamily: monoFont,
    fontSize: 9,
    left: 0,
    position: "absolute",
    top: "calc(100% + 8px)" as any,
    width: 140,
  },
  caption: {
    left: 0,
    minWidth: 150,
    position: "absolute",
    top: "calc(100% + 8px)" as any,
  },
  title: {
    color: "#F4F1EA",
    fontFamily: bodyFont,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14,
    textShadowColor: "#15111F",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  subtitle: {
    color: "#AAA3B2",
    fontFamily: bodyFont,
    fontSize: 9,
    marginTop: 2,
  },
  meta: {
    color: "#85808D",
    fontFamily: monoFont,
    fontSize: 7,
    marginTop: 3,
  },
});
