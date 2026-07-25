import {
  createAtlasLayout,
  resolveZoomDetail,
  type ZoomDetailMode,
} from "../../../lib/discovery/mapLayout";
import type { MapEdge, MapNode } from "../../../lib/storage/discoveryMap";
import type { ContentCategory } from "../../../types/content";

export type AtlasArtworkShape = "cover" | "square" | "circle";

export type AtlasArtworkData = {
  [key: string]: unknown;
  node: MapNode;
  shape: AtlasArtworkShape;
  imageUrl?: string;
  selected: boolean;
  showTitle: boolean;
  showMeta: boolean;
  summary?: string;
  faded?: boolean;
  transient?: boolean;
};

export type AtlasFlowNode = {
  id: string;
  type: "artwork";
  position: { x: number; y: number };
  width: number;
  height: number;
  hidden: boolean;
  draggable: false;
  connectable: false;
  selectable: true;
  focusable?: boolean;
  data: AtlasArtworkData;
};

export type AtlasDirection = "up" | "down" | "left" | "right";
type SpatialAtlasNode = Pick<AtlasFlowNode, "id" | "position" | "data"> & {
  hidden?: boolean;
};

export type AtlasFlowEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
  focusable: false;
  selectable: false;
  style: {
    stroke: string;
    strokeWidth: number;
  };
  labelStyle?: {
    fill: string;
    fontFamily: string;
    fontSize: number;
    fontWeight: number;
  };
  labelBgStyle?: {
    fill: string;
    fillOpacity: number;
  };
  animated?: boolean;
};

const CANVAS_WIDTH = 1_600;
const CANVAS_HEIGHT = 1_000;

const CATEGORY_LABELS: Record<ContentCategory, [string, string]> = {
  movies: ["movie", "movies"],
  books: ["book", "books"],
  albums: ["album", "albums"],
  artists: ["artist", "artists"],
};

function artworkDimensions(category: ContentCategory): {
  shape: AtlasArtworkShape;
  width: number;
  height: number;
} {
  if (category === "movies" || category === "books") {
    return { shape: "cover", width: 96, height: 144 };
  }
  if (category === "artists") {
    return { shape: "circle", width: 108, height: 108 };
  }
  return { shape: "square", width: 112, height: 112 };
}

function categorySummary(category: ContentCategory, count: number): string {
  const labels = CATEGORY_LABELS[category];
  return `${count} ${labels[count === 1 ? 0 : 1]}`;
}

export function normalizeAtlasSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .trim();
}

export function matchesAtlasSearch(node: MapNode, query: string): boolean {
  const normalizedQuery = normalizeAtlasSearchText(query);
  if (!normalizedQuery) return true;
  return [node.title, node.subtitle, node.meta].some((value) =>
    normalizeAtlasSearchText(value).includes(normalizedQuery)
  );
}

export function filterAtlasSearchMatches(
  nodes: readonly MapNode[],
  query: string
): MapNode[] {
  return nodes.filter((node) => matchesAtlasSearch(node, query));
}

export function findAtlasSearchMatch(
  nodes: readonly MapNode[],
  query: string
): MapNode | null {
  const normalizedQuery = normalizeAtlasSearchText(query);
  if (!normalizedQuery) return null;
  return nodes.find((node) => matchesAtlasSearch(node, normalizedQuery)) ?? null;
}

/**
 * Returns the nearest visible artwork in a cardinal direction. This stays
 * independent of React Flow so keyboard travel follows the same settled map
 * positions as pointer navigation.
 */
export function findNearestAtlasNodeInDirection<
  T extends SpatialAtlasNode
>(
  nodes: readonly T[],
  fromId: string,
  direction: AtlasDirection
): T | null {
  const origin = nodes.find((node) => node.id === fromId);
  if (!origin) return null;

  const directionVector = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  }[direction];
  let nearest: T | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const node of nodes) {
    if (node.id === origin.id || node.hidden || node.data.faded) continue;
    const deltaX = node.position.x - origin.position.x;
    const deltaY = node.position.y - origin.position.y;
    if (deltaX * directionVector.x + deltaY * directionVector.y <= 0) continue;
    const distance = deltaX ** 2 + deltaY ** 2;
    if (distance < nearestDistance) {
      nearest = node;
      nearestDistance = distance;
    }
  }
  return nearest;
}

export function buildAtlasFlowNodes(
  nodes: readonly MapNode[],
  edges: readonly MapEdge[],
  {
    detailMode,
    selectedId,
    positions,
    fadedNodeIds = [],
    transientNodeIds = [],
  }: {
    detailMode: ZoomDetailMode;
    selectedId: string | null;
    positions?: Readonly<Record<string, { x: number; y: number }>>;
    fadedNodeIds?: readonly string[];
    transientNodeIds?: readonly string[];
  }
): AtlasFlowNode[] {
  const resolvedPositions = positions ?? createAtlasLayout(nodes, edges);
  const faded = new Set(fadedNodeIds);
  const transient = new Set(transientNodeIds);
  const detail = resolveZoomDetail(
    detailMode === "far" ? 0.5 : detailMode === "medium" ? 1 : 1.75,
    nodes
  );
  const representatives = new Set(detail.representativeNodeIds);
  if (detailMode === "medium") {
    const mediumRepresentatives = resolveZoomDetail(0.5, nodes).representativeNodeIds;
    mediumRepresentatives.forEach((id) => representatives.add(id));
  }
  const categoryCounts = nodes.reduce<Record<ContentCategory, number>>(
    (counts, node) => ({ ...counts, [node.category]: counts[node.category] + 1 }),
    { movies: 0, books: 0, artists: 0, albums: 0 }
  );

  return nodes.map((node) => {
    const dimensions = artworkDimensions(node.category);
    const selected = node.id === selectedId;
    const representative = representatives.has(node.id);
    const position = resolvedPositions[node.id] ?? { x: node.x, y: node.y };
    return {
      id: node.id,
      type: "artwork",
      position: {
        x: position.x * CANVAS_WIDTH,
        y: position.y * CANVAS_HEIGHT,
      },
      width: dimensions.width,
      height: dimensions.height,
      hidden: detailMode === "far" && !representative && !selected,
      draggable: false,
      connectable: false,
      selectable: true,
      data: {
        node,
        shape: dimensions.shape,
        imageUrl: node.imageUrl,
        selected,
        showTitle:
          detailMode === "close" ||
          selected ||
          (detailMode === "medium" && representative),
        showMeta: detailMode === "close" || selected,
        summary:
          detailMode === "far"
            ? categorySummary(node.category, categoryCounts[node.category])
            : undefined,
        faded: faded.has(node.id),
        transient: transient.has(node.id),
      },
    };
  });
}

export function buildAtlasFlowEdges(
  edges: readonly MapEdge[],
  selectedId: string | null,
  options: { transientEdgeIds?: readonly string[]; reducedMotion?: boolean } = {}
): AtlasFlowEdge[] {
  const transient = new Set(options.transientEdgeIds);
  return edges.map((edge, index) => {
    const suggested = transient.has(edge.id);
    const focused = suggested ||
      selectedId !== null &&
      (edge.source === selectedId || edge.target === selectedId);
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: focused ? edge.reason : undefined,
      focusable: false,
      selectable: false,
      style: {
        stroke: suggested
          ? "#D7F36A"
          : focused
          ? index % 2 === 0
            ? "#7C5CFC"
            : "#D7F36A"
          : "rgba(244, 241, 234, 0.28)",
        strokeWidth: suggested ? 1.25 : focused ? 1.6 : 0.8,
      },
      ...(focused && edge.reason
        ? {
            labelStyle: {
              fill: "#F4F1EA",
              fontFamily: "IBM Plex Mono, monospace",
              fontSize: 10,
              fontWeight: 500,
            },
            labelBgStyle: {
              fill: "#15111F",
              fillOpacity: 0.94,
            },
          }
        : {}),
      ...(options.reducedMotion || suggested ? { animated: false } : {}),
    };
  });
}
