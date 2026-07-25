import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import {
  ReactFlow,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type NodeMouseHandler,
  type NodeTypes,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { resolveZoomDetail, type ZoomDetailMode } from "../../../lib/discovery/mapLayout";
import type { MapEdge, MapNode } from "../../../lib/storage/discoveryMap";
import { AtlasArtworkNode, type AtlasArtworkNodeDefinition } from "./AtlasArtworkNode.web";
import {
  buildAtlasFlowEdges,
  buildAtlasFlowNodes,
  filterAtlasSearchMatches,
  findAtlasSearchMatch,
} from "./atlasGraph";
import {
  buildOrbitGraph,
  recommendationNodeId,
  type OrbitRecommendation,
} from "./orbitGraph";
import {
  SavedAtlasEmpty,
  SavedAtlasHeader,
  type SavedAtlasView,
} from "./SavedAtlasChrome";
import { SavedAtlasList } from "./SavedAtlasList";

const nodeTypes: NodeTypes = { artwork: AtlasArtworkNode };

const mapTheme = `
  .saved-atlas-flow .react-flow__pane { cursor: grab; }
  .saved-atlas-flow .react-flow__pane:active { cursor: grabbing; }
  .saved-atlas-flow .react-flow__node { cursor: pointer; }
  .saved-atlas-flow .react-flow__node:focus-visible {
    outline: 2px solid #D7F36A;
    outline-offset: 5px;
  }
  .saved-atlas-flow .react-flow__controls {
    background: #211B2A;
    border: 1px solid rgba(244, 241, 234, 0.16);
    border-radius: 7px;
    box-shadow: none;
    overflow: hidden;
  }
  .saved-atlas-flow .react-flow__controls-button {
    background: #211B2A;
    border-bottom-color: rgba(244, 241, 234, 0.12);
    color: #F4F1EA;
  }
  .saved-atlas-flow .react-flow__controls-button:hover { background: #2A2235; }
  .saved-atlas-flow .react-flow__controls-button svg { fill: #F4F1EA; }
  .saved-atlas-flow .react-flow__minimap {
    background: #211B2A;
    border: 1px solid rgba(244, 241, 234, 0.14);
    border-radius: 7px;
  }
  .saved-atlas-flow .react-flow__edge-textbg { rx: 3; ry: 3; }
  .saved-atlas-flow .react-flow__attribution {
    background: transparent;
    color: rgba(244, 241, 234, 0.35);
  }
`;

export function SavedAtlas(props: SavedAtlasProps) {
  return (
    <ReactFlowProvider>
      <SavedAtlasInner {...props} />
    </ReactFlowProvider>
  );
}

type SavedAtlasProps = {
  nodes: readonly MapNode[];
  edges: readonly MapEdge[];
  selectedId: string | null;
  onSelect(node: MapNode): void;
  onClearSelection(): void;
  onStart(): void;
  onFindSimilar?(seed: OrbitSeed): Promise<OrbitRecommendation[]>;
  onSaveRecommendation?(seed: OrbitSeed, recommendation: OrbitRecommendation): Promise<void> | void;
};

export type OrbitSeed = {
  id: string;
  category: MapNode["category"];
  item: {
    id: string;
    title: string;
    subtitle: string;
    meta: string;
    imageUrl?: string;
  };
};

function SavedAtlasInner({
  nodes,
  edges,
  selectedId,
  onSelect,
  onClearSelection,
  onStart,
  onFindSimilar,
  onSaveRecommendation,
}: SavedAtlasProps) {
  const { width, height } = useWindowDimensions();
  const { getViewport, setCenter, setViewport } = useReactFlow<AtlasArtworkNodeDefinition, Edge>();
  const [view, setView] = useState<SavedAtlasView>("map");
  const [query, setQuery] = useState("");
  const [detailMode, setDetailMode] = useState<ZoomDetailMode>("medium");
  const [orbitSeedId, setOrbitSeedId] = useState<string | null>(selectedId);
  const [transientOrbitSeed, setTransientOrbitSeed] = useState<OrbitSeed | null>(null);
  const [recommendations, setRecommendations] = useState<OrbitRecommendation[]>([]);
  const [recommendationError, setRecommendationError] = useState(false);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const overviewViewport = useRef<Viewport | null>(null);
  const orbitRequest = useRef(0);
  const activeOrbitSeedId = useRef<string | null>(selectedId);
  const previousSelectedId = useRef<string | null>(null);
  const showMiniMap = width >= 1_200 || (width >= 900 && width > height);

  const captureOverviewViewport = () => {
    if (!overviewViewport.current) overviewViewport.current = getViewport();
  };

  useEffect(() => {
    orbitRequest.current += 1;
    activeOrbitSeedId.current = selectedId;
    if (selectedId && !previousSelectedId.current) {
      captureOverviewViewport();
    }
    previousSelectedId.current = selectedId;
    if (selectedId) {
      setOrbitSeedId(selectedId);
      setTransientOrbitSeed(null);
      setRecommendations([]);
      setRecommendationError(false);
      setRecommendationsLoading(false);
      return;
    }
    setOrbitSeedId(null);
    setTransientOrbitSeed(null);
    setRecommendations([]);
    setRecommendationError(false);
    setRecommendationsLoading(false);
  }, [getViewport, selectedId]);

  const orbitGraph = useMemo(
    () => (orbitSeedId ? buildOrbitGraph(nodes, edges, orbitSeedId, recommendations, transientOrbitSeed ?? undefined) : null),
    [edges, nodes, orbitSeedId, recommendations, transientOrbitSeed]
  );
  const displayedNodes = orbitGraph?.nodes ?? nodes;
  const displayedEdges = orbitGraph?.edges ?? edges;

  const flowNodes = useMemo(
    () =>
      buildAtlasFlowNodes(displayedNodes, displayedEdges, {
        detailMode,
        selectedId: orbitSeedId ?? selectedId,
        positions: orbitGraph?.positions,
        fadedNodeIds: orbitGraph?.nodes.filter((node) => node.faded).map((node) => node.id),
        transientNodeIds: orbitGraph?.nodes.filter((node) => node.transient).map((node) => node.id),
      }).map(
        (node): AtlasArtworkNodeDefinition => ({
          ...node,
          ariaLabel: `${node.data.node.title}, ${node.data.node.category}`,
          style: { height: node.height, width: node.width },
        })
      ),
    [detailMode, displayedEdges, displayedNodes, orbitGraph?.nodes, orbitGraph?.positions, orbitSeedId, selectedId]
  );
  const flowEdges = useMemo(
    () => buildAtlasFlowEdges(displayedEdges, orbitSeedId ?? selectedId, {
      transientEdgeIds: orbitGraph?.edges.filter((edge) => edge.transient).map((edge) => edge.id),
    }) as Edge[],
    [displayedEdges, orbitGraph?.edges, orbitSeedId, selectedId]
  );
  const filteredListNodes = useMemo(() => {
    return filterAtlasSearchMatches(nodes, query);
  }, [nodes, query]);

  const focusSearchMatch = (nextQuery: string) => {
    setQuery(nextQuery);
    const match = findAtlasSearchMatch(nodes, nextQuery);
    if (!match) return;
    captureOverviewViewport();
    onSelect(match);
    const flowNode = flowNodes.find((node) => node.id === match.id);
    if (!flowNode) return;
    void setCenter(
      flowNode.position.x + (flowNode.width ?? 0) / 2,
      flowNode.position.y + (flowNode.height ?? 0) / 2,
      { duration: 420, zoom: 1.7 }
    );
  };

  const handleNodeClick: NodeMouseHandler<AtlasArtworkNodeDefinition> = (
    _event,
    node
  ) => {
    if (!node.data.transient) {
      captureOverviewViewport();
      onSelect(node.data.node);
    }
  };

  const seedFromNode = (node: MapNode): OrbitSeed => ({
    id: node.id,
    category: node.category,
    item: {
      id: node.itemId,
      title: node.title,
      subtitle: node.subtitle,
      meta: node.meta,
      imageUrl: node.imageUrl,
    },
  });
  const currentSeed = orbitSeedId
    ? displayedNodes.find((node) => node.id === orbitSeedId)
    : null;

  const requestRecommendations = async (
    seed: OrbitSeed,
    { reseeding = false }: { reseeding?: boolean } = {}
  ): Promise<boolean> => {
    if (!onFindSimilar) return false;
    const requestId = ++orbitRequest.current;
    const requestOwnerSeedId = activeOrbitSeedId.current;
    setRecommendationsLoading(true);
    setRecommendationError(false);
    try {
      const next = await onFindSimilar(seed);
      if (
        orbitRequest.current !== requestId ||
        activeOrbitSeedId.current !== (reseeding ? requestOwnerSeedId : seed.id)
      ) return false;
      setRecommendations(next.slice(0, 8));
      return true;
    } catch {
      if (
        orbitRequest.current !== requestId ||
        activeOrbitSeedId.current !== (reseeding ? requestOwnerSeedId : seed.id)
      ) return false;
      setRecommendationError(true);
      return false;
    } finally {
      if (
        orbitRequest.current === requestId &&
        activeOrbitSeedId.current === (reseeding ? requestOwnerSeedId : seed.id)
      ) setRecommendationsLoading(false);
    }
  };

  const restoreOverview = () => {
    orbitRequest.current += 1;
    activeOrbitSeedId.current = null;
    setOrbitSeedId(null);
    setTransientOrbitSeed(null);
    setRecommendations([]);
    setRecommendationError(false);
    if (overviewViewport.current) {
      void setViewport(overviewViewport.current, { duration: 0 });
    }
    overviewViewport.current = null;
    onClearSelection();
  };

  useEffect(() => {
    if (!orbitSeedId) return;
    void setCenter(800, 500, { duration: 220, zoom: 1.15 });
  }, [orbitSeedId, setCenter]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !orbitSeedId) return;
      event.preventDefault();
      restoreOverview();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const handleMoveEnd = (_event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
    const nextMode = resolveZoomDetail(viewport.zoom, nodes).mode;
    setDetailMode((current) => (current === nextMode ? current : nextMode));
  };

  return (
    <View style={styles.root}>
      <SavedAtlasHeader
        count={nodes.length}
        query={query}
        view={view}
        onQueryChange={focusSearchMatch}
        onViewChange={setView}
      />
      {nodes.length === 0 ? (
        <SavedAtlasEmpty onStart={onStart} />
      ) : view === "list" ? (
        <SavedAtlasList
          nodes={filteredListNodes}
          selectedId={selectedId}
          onSelect={(node) => {
            captureOverviewViewport();
            onSelect(node);
          }}
        />
      ) : (
        <div
          className="saved-atlas-flow"
          style={{
            background: "#15111F",
            flex: 1,
            minHeight: 520,
            position: "relative",
            width: "100%",
          }}
        >
          <style>{mapTheme}</style>
          <ReactFlow<AtlasArtworkNodeDefinition, Edge>
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            nodesDraggable={false}
            nodesConnectable={false}
            edgesReconnectable={false}
            elementsSelectable
            nodesFocusable
            edgesFocusable={false}
            deleteKeyCode={null}
            selectionKeyCode={null}
            multiSelectionKeyCode={null}
            panOnDrag
            panOnScroll={false}
            zoomOnPinch
            zoomOnScroll
            zoomOnDoubleClick={false}
            preventScrolling
            fitView
            fitViewOptions={{ maxZoom: 1.15, padding: 0.18 }}
            minZoom={0.35}
            maxZoom={2.2}
            onlyRenderVisibleElements
            onMoveEnd={handleMoveEnd}
            onNodeClick={handleNodeClick}
            onPaneClick={onClearSelection}
            proOptions={{ hideAttribution: true }}
          >
            <Controls
              position="bottom-left"
              showInteractive={false}
              aria-label="Atlas zoom and fit controls"
            />
            {showMiniMap ? (
              <MiniMap
                pannable
                zoomable
                maskColor="rgba(21, 17, 31, 0.76)"
                nodeColor="#8D8696"
                nodeStrokeColor="#F4F1EA"
                nodeStrokeWidth={1}
                position="bottom-right"
              />
            ) : null}
          </ReactFlow>
          {currentSeed ? (
            <View style={styles.orbitPanel} accessibilityLabel="Discovery Orbit">
              <Text style={styles.orbitKicker}>DISCOVERY ORBIT</Text>
              <Text style={styles.orbitTitle}>{currentSeed.title}</Text>
              <View style={styles.orbitActions}>
                <Pressable accessibilityLabel="Back to atlas" accessibilityRole="button" onPress={restoreOverview} style={styles.orbitButton}>
                  <Text style={styles.orbitButtonText}>Back</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel={`Find similar to ${currentSeed.title}`}
                  accessibilityRole="button"
                  disabled={recommendationsLoading || !onFindSimilar}
                  onPress={() => void requestRecommendations(seedFromNode(currentSeed))}
                  style={[styles.orbitButton, styles.orbitPrimary]}
                >
                  <Text style={styles.orbitPrimaryText}>
                    {recommendationsLoading ? "Looking…" : "Find similar"}
                  </Text>
                </Pressable>
                <Pressable accessibilityLabel="View whole atlas" accessibilityRole="button" onPress={restoreOverview} style={styles.orbitButton}>
                  <Text style={styles.orbitButtonText}>View whole atlas</Text>
                </Pressable>
              </View>
              {recommendationError ? (
                <View style={styles.orbitError}>
                  <Text style={styles.orbitErrorText}>Recommendations are unavailable right now.</Text>
                  <Pressable accessibilityLabel="Retry recommendations" accessibilityRole="button" onPress={() => void requestRecommendations(seedFromNode(currentSeed))}>
                    <Text style={styles.retryText}>Retry</Text>
                  </Pressable>
                </View>
              ) : null}
              {recommendations.map((recommendation) => (
                <View key={recommendationNodeId(recommendation)} style={styles.recommendationRow}>
                  <View style={styles.recommendationCopy}>
                    <Text numberOfLines={1} style={styles.recommendationTitle}>{recommendation.item.title}</Text>
                    <Text numberOfLines={1} style={styles.recommendationReason}>{recommendation.reason.label}</Text>
                  </View>
                  <Pressable
                    accessibilityLabel={`Save ${recommendation.item.title} to map`}
                    accessibilityRole="button"
                    onPress={() => void Promise.resolve(onSaveRecommendation?.(seedFromNode(currentSeed), recommendation)).then(() => {
                      setRecommendations((current) => current.filter((candidate) => recommendationNodeId(candidate) !== recommendationNodeId(recommendation)));
                    }).catch(() => setRecommendationError(true))}
                    style={[styles.recommendationAction, styles.recommendationSave]}
                  ><Text style={styles.recommendationSaveText}>Save</Text></Pressable>
                  <Pressable
                    accessibilityLabel={`Skip ${recommendation.item.title}`}
                    accessibilityRole="button"
                    onPress={() => setRecommendations((current) => current.filter((candidate) => recommendationNodeId(candidate) !== recommendationNodeId(recommendation)))}
                    style={styles.recommendationAction}
                  ><Text style={styles.recommendationSkipText}>Skip</Text></Pressable>
                  <Pressable
                    accessibilityLabel={`Reseed from ${recommendation.item.title}`}
                    accessibilityRole="button"
                    onPress={() => void requestRecommendations({ id: recommendationNodeId(recommendation), category: recommendation.category, item: recommendation.item }, { reseeding: true }).then((loaded) => {
                      if (loaded) {
                        activeOrbitSeedId.current = recommendationNodeId(recommendation);
                        setTransientOrbitSeed({ id: recommendationNodeId(recommendation), category: recommendation.category, item: recommendation.item });
                        setOrbitSeedId(recommendationNodeId(recommendation));
                      }
                    })}
                    style={styles.recommendationAction}
                  ><Text style={styles.recommendationSkipText}>Reseed</Text></Pressable>
                </View>
              ))}
            </View>
          ) : null}
        </div>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: "#15111F",
    flex: 1,
    minHeight: 620,
  },
  orbitPanel: { backgroundColor: "rgba(33, 27, 42, 0.96)", borderColor: "rgba(244, 241, 234, 0.18)", borderRadius: 8, borderWidth: 1, maxWidth: 390, padding: 15, position: "absolute", right: 20, top: 18, width: "42%" as any },
  orbitKicker: { color: "#D7F36A", fontFamily: "IBM Plex Mono", fontSize: 9, letterSpacing: 1.4 },
  orbitTitle: { color: "#F4F1EA", fontFamily: "Bricolage Grotesque", fontSize: 21, fontWeight: "900", marginTop: 4 },
  orbitActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  orbitButton: { alignItems: "center", borderColor: "rgba(244, 241, 234, 0.22)", borderRadius: 5, borderWidth: 1, justifyContent: "center", minHeight: 40, paddingHorizontal: 11 },
  orbitPrimary: { backgroundColor: "#D7F36A", borderColor: "#D7F36A" },
  orbitButtonText: { color: "#F4F1EA", fontFamily: "DM Sans", fontSize: 12, fontWeight: "800" },
  orbitPrimaryText: { color: "#15111F", fontFamily: "DM Sans", fontSize: 12, fontWeight: "900" },
  orbitError: { borderTopColor: "rgba(244, 241, 234, 0.13)", borderTopWidth: 1, marginTop: 12, paddingTop: 11 },
  orbitErrorText: { color: "#F4C7A1", fontFamily: "DM Sans", fontSize: 12 },
  retryText: { color: "#D7F36A", fontFamily: "DM Sans", fontSize: 12, fontWeight: "900", marginTop: 7 },
  recommendationRow: { alignItems: "center", borderTopColor: "rgba(244, 241, 234, 0.12)", borderTopWidth: 1, flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 11, paddingTop: 11 },
  recommendationCopy: { flexGrow: 1, minWidth: 150 },
  recommendationTitle: { color: "#F4F1EA", fontFamily: "DM Sans", fontSize: 13, fontWeight: "900" },
  recommendationReason: { color: "#A59EAE", fontFamily: "IBM Plex Mono", fontSize: 9, marginTop: 3 },
  recommendationAction: { borderColor: "rgba(244, 241, 234, 0.2)", borderRadius: 4, borderWidth: 1, minHeight: 32, justifyContent: "center", paddingHorizontal: 8 },
  recommendationSave: { backgroundColor: "#7C5CFC", borderColor: "#7C5CFC" },
  recommendationSaveText: { color: "#F4F1EA", fontFamily: "DM Sans", fontSize: 11, fontWeight: "900" },
  recommendationSkipText: { color: "#D7D1DC", fontFamily: "DM Sans", fontSize: 11, fontWeight: "800" },
});
