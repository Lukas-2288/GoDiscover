import React, { useMemo, useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
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
};

function SavedAtlasInner({
  nodes,
  edges,
  selectedId,
  onSelect,
  onClearSelection,
  onStart,
}: SavedAtlasProps) {
  const { width, height } = useWindowDimensions();
  const { setCenter } = useReactFlow<AtlasArtworkNodeDefinition, Edge>();
  const [view, setView] = useState<SavedAtlasView>("map");
  const [query, setQuery] = useState("");
  const [detailMode, setDetailMode] = useState<ZoomDetailMode>("medium");
  const showMiniMap = width >= 1_200 || (width >= 900 && width > height);

  const flowNodes = useMemo(
    () =>
      buildAtlasFlowNodes(nodes, edges, { detailMode, selectedId }).map(
        (node): AtlasArtworkNodeDefinition => ({
          ...node,
          ariaLabel: `${node.data.node.title}, ${node.data.node.category}`,
          style: { height: node.height, width: node.width },
        })
      ),
    [detailMode, edges, nodes, selectedId]
  );
  const flowEdges = useMemo(
    () => buildAtlasFlowEdges(edges, selectedId) as Edge[],
    [edges, selectedId]
  );
  const filteredListNodes = useMemo(() => {
    return filterAtlasSearchMatches(nodes, query);
  }, [nodes, query]);

  const focusSearchMatch = (nextQuery: string) => {
    setQuery(nextQuery);
    const match = findAtlasSearchMatch(nodes, nextQuery);
    if (!match) return;
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
    onSelect(node.data.node);
  };

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
          onSelect={onSelect}
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
});
