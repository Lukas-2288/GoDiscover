import type { MapEdge, MapNode } from "../storage/discoveryMap";

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

function hashToUnitInterval(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) / 4_294_967_295;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
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
  const seed = options.seed ?? buildGraphSignature(nodes, edges);
  const positions = Object.fromEntries(
    nodes.map((node) => {
      const anchor = CATEGORY_ANCHORS[node.category];
      const xOffset = (hashToUnitInterval(`${seed}:x:${node.id}`) - 0.5) * 0.18;
      const yOffset = (hashToUnitInterval(`${seed}:y:${node.id}`) - 0.5) * 0.18;
      return [node.id, { x: clamp(anchor.x + xOffset), y: clamp(anchor.y + yOffset) }];
    })
  );

  for (const edge of [...edges].sort((left, right) =>
    `${left.source}->${left.target}`.localeCompare(`${right.source}->${right.target}`)
  )) {
    const source = positions[edge.source];
    const target = positions[edge.target];
    if (!source || !target) continue;
    const sourceX = source.x;
    const sourceY = source.y;
    source.x = clamp(sourceX + (target.x - sourceX) * 0.32);
    source.y = clamp(sourceY + (target.y - sourceY) * 0.32);
    target.x = clamp(target.x + (sourceX - target.x) * 0.32);
    target.y = clamp(target.y + (sourceY - target.y) * 0.32);
  }

  const nodeIds = Object.keys(positions).sort();
  const minimumDistance = 0.07;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    for (let sourceIndex = 0; sourceIndex < nodeIds.length; sourceIndex += 1) {
      for (let targetIndex = sourceIndex + 1; targetIndex < nodeIds.length; targetIndex += 1) {
        const source = positions[nodeIds[sourceIndex]];
        const target = positions[nodeIds[targetIndex]];
        const xDifference = target.x - source.x;
        const yDifference = target.y - source.y;
        const distance = Math.hypot(xDifference, yDifference);
        if (distance >= minimumDistance) continue;

        const angle =
          distance === 0
            ? hashToUnitInterval(`${seed}:${nodeIds[sourceIndex]}:${nodeIds[targetIndex]}`) * Math.PI * 2
            : Math.atan2(yDifference, xDifference);
        const adjustment = (minimumDistance - distance) / 2;
        const xAdjustment = Math.cos(angle) * adjustment;
        const yAdjustment = Math.sin(angle) * adjustment;
        source.x = clamp(source.x - xAdjustment);
        source.y = clamp(source.y - yAdjustment);
        target.x = clamp(target.x + xAdjustment);
        target.y = clamp(target.y + yAdjustment);
      }
    }
  }

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
