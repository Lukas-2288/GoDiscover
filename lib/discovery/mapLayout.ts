import type { MapEdge, MapNode } from "../storage/discoveryMap";
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
} from "d3-force";

export type AtlasPosition = { x: number; y: number };

export type AtlasLayoutOptions = {
  seed?: string;
};

export type OrbitProjection = {
  positions: Record<string, AtlasPosition>;
};

export type ZoomDetailMode = "far" | "medium" | "close";

export type ZoomDetail = {
  mode: ZoomDetailMode;
  representativeNodeIds: string[];
};

const CATEGORY_ANCHORS: Record<MapNode["category"], AtlasPosition> = {
  artists: { x: 0.2, y: 0.25 },
  albums: { x: 0.3, y: 0.72 },
  books: { x: 0.72, y: 0.28 },
  movies: { x: 0.72, y: 0.72 },
};

const BASE_CANVAS_WIDTH = 1_600;
const BASE_CANVAS_HEIGHT = 1_000;
const LAYOUT_TICKS = 300;
const layoutCache = new Map<string, Record<string, AtlasPosition>>();

function hashToUnitInterval(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) / 4_294_967_295;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function seededRandom(seed: string): () => number {
  let state = Math.floor(hashToUnitInterval(seed) * 4_294_967_295) >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function artworkSize(category: MapNode["category"]): {
  width: number;
  height: number;
} {
  if (category === "movies" || category === "books") {
    return { width: 96, height: 144 };
  }
  if (category === "artists") {
    return { width: 108, height: 108 };
  }
  return { width: 112, height: 112 };
}

function nodeRadius(category: MapNode["category"]): number {
  const size = artworkSize(category);
  const width = size.width / BASE_CANVAS_WIDTH;
  const height = size.height / BASE_CANVAS_HEIGHT;
  return Math.hypot(width, height) / 2 + 0.009;
}

export function buildGraphSignature(
  nodes: readonly Pick<MapNode, "id">[],
  edges: readonly Pick<MapEdge, "source" | "target">[]
): string {
  const nodeIds = nodes.map((node) => node.id).sort();
  const edgeIds = edges
    .map((edge) => `${edge.source}->${edge.target}`)
    .sort();
  return `atlas:v1:nodes=${nodeIds.join(",")};edges=${edgeIds.join(",")}`;
}

export function createAtlasLayout(
  nodes: readonly Pick<MapNode, "id" | "category">[],
  edges: readonly Pick<MapEdge, "source" | "target">[],
  options: AtlasLayoutOptions = {}
): Record<string, AtlasPosition> {
  const signature = buildGraphSignature(nodes, edges);
  const cacheKey = `${signature};seed=${options.seed ?? "permanent"}`;
  const cached = layoutCache.get(cacheKey);
  if (cached) return cached;

  const densityScale = Math.max(1, Math.sqrt(nodes.length / 32));
  const sortedNodes = [...nodes].sort((left, right) =>
    left.id.localeCompare(right.id)
  );
  const forceNodes = sortedNodes.map((node) => {
    const anchor = CATEGORY_ANCHORS[node.category];
    const jitterSeed = options.seed ?? "permanent";
    return {
      id: node.id,
      category: node.category,
      radius: nodeRadius(node.category),
      x:
        anchor.x * densityScale +
        (hashToUnitInterval(`${jitterSeed}:x:${node.id}`) - 0.5) * 0.2,
      y:
        anchor.y * densityScale +
        (hashToUnitInterval(`${jitterSeed}:y:${node.id}`) - 0.5) * 0.2,
      vx: 0,
      vy: 0,
    };
  });
  const forceNodeIds = new Set(forceNodes.map((node) => node.id));
  const links = [...edges]
    .filter(
      (edge) =>
        forceNodeIds.has(edge.source) && forceNodeIds.has(edge.target)
    )
    .sort((left, right) =>
      `${left.source}->${left.target}`.localeCompare(
        `${right.source}->${right.target}`
      )
    )
    .map((edge) => ({ source: edge.source, target: edge.target }));

  const simulation = forceSimulation(forceNodes)
    .randomSource(seededRandom(`${cacheKey}:simulation`))
    .alpha(1)
    .alphaMin(0.001)
    .velocityDecay(0.38)
    .force(
      "category-x",
      forceX((node: (typeof forceNodes)[number]) =>
        CATEGORY_ANCHORS[node.category].x * densityScale
      ).strength(0.055)
    )
    .force(
      "category-y",
      forceY((node: (typeof forceNodes)[number]) =>
        CATEGORY_ANCHORS[node.category].y * densityScale
      ).strength(0.055)
    )
    .force(
      "links",
      forceLink(links)
        .id((node: (typeof forceNodes)[number]) => node.id)
        .distance(0.22)
        .strength(0.11)
    )
    .force(
      "collision",
      forceCollide((node: (typeof forceNodes)[number]) => node.radius)
        .strength(1)
        .iterations(4)
    )
    .force(
      "charge",
      forceManyBody().strength(-0.003 * Math.max(1, densityScale))
    )
    .stop();

  for (let tick = 0; tick < LAYOUT_TICKS; tick += 1) {
    simulation.tick();
    for (const node of forceNodes) {
      node.x = clamp(node.x, node.radius, densityScale - node.radius);
      node.y = clamp(node.y, node.radius, densityScale - node.radius);
    }
  }

  const positions = Object.fromEntries(
    forceNodes.map((node) => {
      const size = artworkSize(node.category);
      return [
        node.id,
        {
          x: node.x - size.width / BASE_CANVAS_WIDTH / 2,
          y: node.y - size.height / BASE_CANVAS_HEIGHT / 2,
        },
      ];
    })
  );
  layoutCache.set(cacheKey, positions);
  return positions;
}

export function projectOrbit(
  seedId: string,
  nodes: readonly Pick<MapNode, "id">[],
  edges: readonly Pick<MapEdge, "source" | "target">[],
  atlasPositions: Readonly<Record<string, AtlasPosition>>
): OrbitProjection {
  const adjacency = new Map(nodes.map((node) => [node.id, new Set<string>()]));
  for (const edge of edges) {
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  }
  const directNeighbors = [...(adjacency.get(seedId) ?? [])].sort();
  const directNeighborSet = new Set(directNeighbors);
  const secondDegreeNeighbors = [...directNeighborSet]
    .flatMap((nodeId) => [...(adjacency.get(nodeId) ?? [])])
    .filter((nodeId) => nodeId !== seedId && !directNeighborSet.has(nodeId))
    .filter((nodeId, index, values) => values.indexOf(nodeId) === index)
    .sort();
  const positions: Record<string, AtlasPosition> = {
    ...atlasPositions,
    [seedId]: { x: 0.5, y: 0.5 },
  };

  const placeOnRing = (nodeIds: readonly string[], radius: number) => {
    nodeIds.forEach((nodeId, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / nodeIds.length;
      positions[nodeId] = {
        x: 0.5 + Math.cos(angle) * radius,
        y: 0.5 + Math.sin(angle) * radius,
      };
    });
  };

  placeOnRing(directNeighbors, 0.22);
  placeOnRing(secondDegreeNeighbors, 0.4);

  return { positions };
}

export function resolveZoomDetail(
  zoom: number,
  nodes: readonly Pick<MapNode, "id" | "category">[]
): ZoomDetail {
  if (zoom >= 1.5) {
    return { mode: "close", representativeNodeIds: [] };
  }
  if (zoom >= 0.75) {
    return { mode: "medium", representativeNodeIds: [] };
  }
  const representatives = new Map<MapNode["category"], string>();
  for (const node of [...nodes].sort((left, right) => left.id.localeCompare(right.id))) {
    if (!representatives.has(node.category)) representatives.set(node.category, node.id);
  }
  return {
    mode: "far",
    representativeNodeIds: [...representatives.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, id]) => id),
  };
}
