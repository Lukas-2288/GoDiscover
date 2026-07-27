import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useMemo, useRef, useState } from "react";
import {
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
} from "react-native";
import Svg, { Line, Text as SvgText } from "react-native-svg";

import {
  buildAtlasFlowEdges,
  buildAtlasFlowNodes,
  filterAtlasSearchMatches,
  findAtlasSearchMatch,
  type AtlasFlowNode,
} from "../../lib/discovery/atlasGraph";
import {
  centreOnNode,
  clampZoom,
  fitCameraToNodes,
  touchDistance,
  touchMidpoint,
  zoomAbout,
  type AtlasCamera,
} from "../../lib/discovery/atlasCamera";
import { createAtlasLayout, type ZoomDetailMode } from "../../lib/discovery/mapLayout";
import type { MapEdge, MapNode } from "../../lib/storage/discoveryMap";
import { getCategoryTheme } from "../../lib/discovery/categoryThemes";
import type { Palette } from "../../lib/theme";
import { displayFont, monoFont } from "../../lib/typography";
import { thumbnailUrl } from "../../lib/api/imageSizes";
import { SavedAtlasList } from "./SavedAtlasList";

export type SavedAtlasNativeProps = {
  nodes: readonly MapNode[];
  edges: readonly MapEdge[];
  selectedId: string | null;
  palette: Palette;
  onSelect(node: MapNode): void;
  onStart(): void;
};

/**
 * The Saved Atlas for the app.
 *
 * The website draws this with React Flow, which is web-only, so the renderer
 * here is hand-built — but only the renderer. The layout (`createAtlasLayout`),
 * the node and edge shapes (`buildAtlasFlow*`) and the search helpers are the
 * exact modules the web uses; they were always platform-free and were merely
 * filed under `components/web/`. The camera arithmetic lives in
 * `lib/discovery/atlasCamera.ts` so it can be tested without a gesture.
 */
export function SavedAtlasNative({
  nodes,
  edges,
  selectedId,
  palette,
  onSelect,
  onStart,
}: SavedAtlasNativeProps) {
  const [view, setView] = useState<"map" | "list">("map");
  const [query, setQuery] = useState("");
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [camera, setCamera] = useState<AtlasCamera>({ x: 0, y: 0, scale: 1 });
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  // A pinch needs the camera and finger spread from the moment it began; the
  // gesture reports absolute positions, not deltas.
  const gestureStart = useRef<{
    camera: AtlasCamera;
    distance: number;
    focus: { x: number; y: number };
  } | null>(null);
  const fittedSignature = useRef<string | null>(null);

  const detailMode: ZoomDetailMode =
    camera.scale >= 1.5 ? "close" : camera.scale >= 0.75 ? "medium" : "far";

  const positions = useMemo(() => createAtlasLayout(nodes, edges), [edges, nodes]);
  const flowNodes = useMemo(
    () =>
      buildAtlasFlowNodes(nodes, edges, {
        detailMode,
        positions,
        selectedId,
      }),
    [detailMode, edges, nodes, positions, selectedId]
  );
  const flowEdges = useMemo(
    () => buildAtlasFlowEdges(edges, selectedId),
    [edges, selectedId]
  );
  const nodeById = useMemo(
    () => new Map(flowNodes.map((node) => [node.id, node])),
    [flowNodes]
  );
  const searchMatches = useMemo(
    () => filterAtlasSearchMatches(nodes, query),
    [nodes, query]
  );

  const applyCamera = (next: AtlasCamera) => {
    cameraRef.current = next;
    setCamera(next);
  };

  // Frame the whole atlas the first time it has both a size and some nodes, and
  // again whenever the set of nodes changes — but not on every pan, or the
  // camera would fight the user.
  const signature = `${nodes.length}:${edges.length}:${viewport.width}x${viewport.height}`;
  if (
    viewport.width > 0 &&
    flowNodes.length > 0 &&
    fittedSignature.current !== signature
  ) {
    fittedSignature.current = signature;
    const fitted = fitCameraToNodes(flowNodes, viewport);
    cameraRef.current = fitted;
    // Safe during render: this is derived state reacting to a changed input,
    // and the guard above makes it run once per signature rather than looping.
    setCamera(fitted);
  }

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        // Let a tap through to a node; only claim the gesture once it moves.
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4,
        onPanResponderGrant: (event) => {
          const touches = event.nativeEvent.touches;
          gestureStart.current = {
            camera: cameraRef.current,
            distance: touchDistance(touches),
            focus: touchMidpoint(touches),
          };
        },
        onPanResponderMove: (event, gesture) => {
          const start = gestureStart.current;
          if (!start) return;
          const touches = event.nativeEvent.touches;

          if (touches.length >= 2 && start.distance > 0) {
            const factor = touchDistance(touches) / start.distance;
            applyCamera(zoomAbout(start.camera, factor, start.focus));
            return;
          }

          applyCamera({
            scale: start.camera.scale,
            x: start.camera.x + gesture.dx,
            y: start.camera.y + gesture.dy,
          });
        },
        onPanResponderRelease: () => {
          gestureStart.current = null;
        },
        onPanResponderTerminate: () => {
          gestureStart.current = null;
        },
      }),
    []
  );

  const zoomBy = (factor: number) => {
    applyCamera(
      zoomAbout(cameraRef.current, factor, {
        x: viewport.width / 2,
        y: viewport.height / 2,
      })
    );
  };

  const focusSearch = (next: string) => {
    setQuery(next);
    const match = findAtlasSearchMatch(nodes, next);
    const target = match ? nodeById.get(match.id) : undefined;
    if (!target || viewport.width === 0) return;
    applyCamera(centreOnNode(cameraRef.current, target, viewport));
  };

  const onCanvasLayout = (event: LayoutChangeEvent) => {
    const { height, width } = event.nativeEvent.layout;
    setViewport((current) =>
      current.width === width && current.height === height
        ? current
        : { height, width }
    );
  };

  if (nodes.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={[styles.emptyKicker, { color: palette.tangerine }]}>
          NOTHING SAVED YET
        </Text>
        <Text style={[styles.emptyTitle, { color: palette.text }]}>
          Your atlas fills up as you save.
        </Text>
        <Pressable
          accessibilityLabel="Start discovering"
          accessibilityRole="button"
          onPress={onStart}
          style={({ pressed }) => [
            styles.emptyAction,
            { backgroundColor: palette.accent, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Text style={[styles.emptyActionText, { color: palette.onAccent }]}>
            Start discovering
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.chrome}>
        <View style={[styles.searchFrame, { backgroundColor: palette.surfaceAlt, borderColor: palette.border }]}>
          <FontAwesome accessible={false} name="search" size={13} color={palette.textMuted} />
          <TextInput
            accessibilityLabel="Search saved atlas"
            onChangeText={focusSearch}
            placeholder="Find a saved work"
            placeholderTextColor={palette.textFaint}
            style={[styles.search, { color: palette.text }]}
            value={query}
          />
        </View>
        <View accessibilityRole="tablist" style={[styles.viewToggle, { backgroundColor: palette.surfaceAlt, borderColor: palette.border }]}>
          {(["map", "list"] as const).map((option) => {
            const active = option === view;
            return (
              <Pressable
                key={option}
                accessibilityLabel={option === "map" ? "Map" : "List"}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => setView(option)}
                style={[
                  styles.viewOption,
                  active && { backgroundColor: palette.accent },
                ]}
              >
                <Text
                  style={[
                    styles.viewOptionText,
                    { color: active ? palette.onAccent : palette.textMuted },
                  ]}
                >
                  {option === "map" ? "Map" : "List"}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {view === "list" ? (
        <SavedAtlasList
          nodes={query ? searchMatches : nodes}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ) : (
        <View
          accessibilityLabel="Atlas map"
          onLayout={onCanvasLayout}
          style={[styles.canvas, { backgroundColor: palette.bg }]}
          testID="atlas-canvas"
          {...panResponder.panHandlers}
        >
          <View
            style={[
              styles.world,
              {
                transform: [
                  { translateX: camera.x },
                  { translateY: camera.y },
                  { scale: camera.scale },
                ],
              },
            ]}
          >
            {/* Edges first so nodes sit above them. The SVG layer is sized to
                the canvas rather than the viewport because it lives inside the
                transformed world. */}
            <Svg
              height={CANVAS_HEIGHT}
              pointerEvents="none"
              style={styles.edgeLayer}
              width={CANVAS_WIDTH}
            >
              {flowEdges.map((edge) => {
                const source = nodeById.get(edge.source);
                const target = nodeById.get(edge.target);
                if (!source || !target) return null;
                const from = centreOf(source);
                const to = centreOf(target);
                return (
                  <React.Fragment key={edge.id}>
                    <Line
                      stroke={edge.style.stroke}
                      strokeWidth={edge.style.strokeWidth}
                      x1={from.x}
                      x2={to.x}
                      y1={from.y}
                      y2={to.y}
                    />
                    {edge.label ? (
                      <SvgText
                        fill={edge.labelStyle?.fill ?? palette.textMuted}
                        fontSize={edge.labelStyle?.fontSize ?? 11}
                        textAnchor="middle"
                        x={(from.x + to.x) / 2}
                        y={(from.y + to.y) / 2 - 6}
                      >
                        {edge.label}
                      </SvgText>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </Svg>

            {flowNodes
              .filter((node) => !node.hidden)
              .map((node) => (
                <AtlasNode
                  key={node.id}
                  node={node}
                  palette={palette}
                  onPress={() => onSelect(node.data.node)}
                />
              ))}
          </View>

          <View style={styles.zoomControls}>
            {([
              ["Zoom in", "plus", 1.25],
              ["Zoom out", "minus", 0.8],
            ] as const).map(([label, icon, factor]) => (
              <Pressable
                key={label}
                accessibilityLabel={label}
                accessibilityRole="button"
                onPress={() => zoomBy(factor)}
                style={[styles.zoomButton, { backgroundColor: palette.surface, borderColor: palette.border }]}
              >
                <FontAwesome accessible={false} name={icon} size={14} color={palette.text} />
              </Pressable>
            ))}
            <Pressable
              accessibilityLabel="Fit view"
              accessibilityRole="button"
              onPress={() => applyCamera(fitCameraToNodes(flowNodes, viewport))}
              style={[styles.zoomButton, { backgroundColor: palette.surface, borderColor: palette.border }]}
            >
              <FontAwesome accessible={false} name="compress" size={14} color={palette.text} />
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

// Matches the canvas the shared layout projects node positions into.
const CANVAS_WIDTH = 1_600;
const CANVAS_HEIGHT = 1_000;

function centreOf(node: AtlasFlowNode): { x: number; y: number } {
  return {
    x: node.position.x + node.width / 2,
    y: node.position.y + node.height / 2,
  };
}

function AtlasNode({
  node,
  palette,
  onPress,
}: {
  node: AtlasFlowNode;
  palette: Palette;
  onPress(): void;
}) {
  const theme = getCategoryTheme(node.data.node.category);
  const { data } = node;
  return (
    <Pressable
      accessibilityLabel={`${data.node.title}, ${data.node.category}`}
      accessibilityRole="button"
      accessibilityState={{ selected: data.selected }}
      onPress={onPress}
      style={[
        styles.node,
        {
          borderColor: data.selected ? theme.accent : palette.border,
          borderWidth: data.selected ? 2 : 1,
          height: node.height,
          left: node.position.x,
          opacity: data.faded ? 0.4 : 1,
          top: node.position.y,
          width: node.width,
        },
        data.shape === "circle" && { borderRadius: node.width / 2 },
      ]}
      testID={`atlas-node-${node.id}`}
    >
      <View style={[styles.nodeArt, { backgroundColor: theme.softDark }]}>
        {data.imageUrl ? (
          <Image
            accessible={false}
            resizeMode="cover"
            source={{ uri: thumbnailUrl(data.imageUrl) }}
            style={styles.nodeImage}
          />
        ) : (
          <FontAwesome accessible={false} name={theme.icon} size={18} color={theme.accent} />
        )}
      </View>
      {data.showTitle ? (
        <Text numberOfLines={2} style={[styles.nodeTitle, { color: palette.text }]}>
          {data.summary ?? data.node.title}
        </Text>
      ) : null}
      {data.showMeta ? (
        <Text numberOfLines={1} style={[styles.nodeMeta, { color: palette.textMuted }]}>
          {data.node.subtitle}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  chrome: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  searchFrame: {
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    flexGrow: 1,
    flexShrink: 1,
    gap: 8,
    minHeight: 44,
    minWidth: 180,
    paddingHorizontal: 12,
  },
  // 16px or iOS Safari zooms the page on focus; the app has no such problem but
  // the two platforms should not disagree about the control's size.
  search: { flex: 1, fontSize: 16, minHeight: 44 },
  viewToggle: {
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    padding: 3,
  },
  viewOption: {
    alignItems: "center",
    borderRadius: 7,
    justifyContent: "center",
    minHeight: 38,
    minWidth: 54,
    paddingHorizontal: 12,
  },
  viewOptionText: { fontFamily: monoFont, fontSize: 11, fontWeight: "700" },
  canvas: { flex: 1, overflow: "hidden", position: "relative" },
  world: {
    height: CANVAS_HEIGHT,
    left: 0,
    position: "absolute",
    top: 0,
    transformOrigin: "0 0" as never,
    width: CANVAS_WIDTH,
  },
  edgeLayer: { left: 0, position: "absolute", top: 0 },
  node: {
    alignItems: "center",
    borderRadius: 12,
    justifyContent: "center",
    overflow: "hidden",
    padding: 4,
    position: "absolute",
  },
  nodeArt: {
    alignItems: "center",
    borderRadius: 8,
    flex: 1,
    justifyContent: "center",
    overflow: "hidden",
    width: "100%",
  },
  nodeImage: { height: "100%", width: "100%" },
  nodeTitle: {
    fontFamily: displayFont,
    fontSize: 11,
    fontWeight: "900",
    marginTop: 3,
    textAlign: "center",
  },
  nodeMeta: { fontFamily: monoFont, fontSize: 8, marginTop: 1, textAlign: "center" },
  zoomControls: { bottom: 16, gap: 8, left: 16, position: "absolute" },
  zoomButton: {
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  empty: { alignItems: "center", flex: 1, gap: 12, justifyContent: "center", padding: 32 },
  emptyKicker: { fontFamily: monoFont, fontSize: 10, letterSpacing: 1.5 },
  emptyTitle: {
    fontFamily: displayFont,
    fontSize: 24,
    fontWeight: "900",
    textAlign: "center",
  },
  emptyAction: {
    alignItems: "center",
    borderRadius: 999,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: 22,
  },
  emptyActionText: { fontSize: 14, fontWeight: "800" },
});
