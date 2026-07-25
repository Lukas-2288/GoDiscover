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
  data: AtlasArtworkData;
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

export function buildAtlasFlowNodes(
  nodes: readonly MapNode[],
  edges: readonly MapEdge[],
  {
    detailMode,
    selectedId,
  }: {
    detailMode: ZoomDetailMode;
    selectedId: string | null;
  }
): AtlasFlowNode[] {
  const positions = createAtlasLayout(nodes, edges);
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
    const position = positions[node.id] ?? { x: node.x, y: node.y };
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
      },
    };
  });
}

export function buildAtlasFlowEdges(
  edges: readonly MapEdge[],
  selectedId: string | null
): AtlasFlowEdge[] {
  return edges.map((edge, index) => {
    const focused =
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
        stroke: focused
          ? index % 2 === 0
            ? "#7C5CFC"
            : "#D7F36A"
          : "rgba(244, 241, 234, 0.28)",
        strokeWidth: focused ? 1.6 : 0.8,
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
    };
  });
}
