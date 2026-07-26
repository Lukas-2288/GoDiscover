import {
  createAtlasLayout,
  projectOrbit,
  type AtlasPosition,
} from "../../../lib/discovery/mapLayout";
import type { MapEdge, MapNode } from "../../../lib/storage/discoveryMap";
import type { ContentCategory, ResultItem } from "../../../types/content";

const MAX_ORBIT_RECOMMENDATIONS = 8;

export type OrbitRecommendation = {
  category: ContentCategory;
  item: ResultItem;
  reason: { label: string };
};

export type OrbitGraphNode = MapNode & {
  transient: boolean;
  faded: boolean;
};

export type OrbitGraphEdge = MapEdge & {
  transient: boolean;
};

export type OrbitGraph = {
  nodes: OrbitGraphNode[];
  edges: OrbitGraphEdge[];
  positions: Record<string, { x: number; y: number }>;
};

export type TransientOrbitSeed = {
  id: string;
  category: ContentCategory;
  item: ResultItem;
};

export function recommendationNodeId(recommendation: OrbitRecommendation): string {
  return `${recommendation.category}:${recommendation.item.id}`;
}

function transientNode(recommendation: OrbitRecommendation): OrbitGraphNode {
  const id = recommendationNodeId(recommendation);
  return {
    id,
    category: recommendation.category,
    itemId: recommendation.item.id,
    title: recommendation.item.title,
    subtitle: recommendation.item.subtitle,
    meta: recommendation.item.meta,
    imageUrl: recommendation.item.imageUrl,
    savedAt: 0,
    x: 0.5,
    y: 0.5,
    transient: true,
    faded: false,
  };
}

function relatedNodeIds(
  seedId: string,
  nodes: readonly Pick<MapNode, "id">[],
  edges: readonly Pick<MapEdge, "source" | "target">[]
): Set<string> {
  const adjacency = new Map(nodes.map((node) => [node.id, new Set<string>()]));
  for (const edge of edges) {
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  }
  const direct = adjacency.get(seedId) ?? new Set<string>();
  const visible = new Set([seedId, ...direct]);
  for (const nodeId of direct) {
    for (const secondDegree of adjacency.get(nodeId) ?? []) visible.add(secondDegree);
  }
  return visible;
}

export function buildOrbitGraph(
  savedNodes: readonly MapNode[],
  savedEdges: readonly MapEdge[],
  seedId: string,
  recommendations: readonly OrbitRecommendation[],
  transientSeed?: TransientOrbitSeed,
  permanentPositions?: Readonly<Record<string, AtlasPosition>>
): OrbitGraph {
  const savedNodeIds = new Set(savedNodes.map((node) => node.id));
  const reservesTransientSeedSlot = Boolean(transientSeed && !savedNodeIds.has(seedId));
  const includedRecommendations = recommendations.slice(
    0,
    MAX_ORBIT_RECOMMENDATIONS - (reservesTransientSeedSlot ? 1 : 0)
  );
  const transientNodes = includedRecommendations
    .filter((recommendation) => !savedNodeIds.has(recommendationNodeId(recommendation)))
    .map(transientNode);
  if (
    transientSeed &&
    !savedNodeIds.has(seedId) &&
    !transientNodes.some((node) => node.id === seedId)
  ) {
    transientNodes.push(
      transientNode({
        category: transientSeed.category,
        item: transientSeed.item,
        reason: { label: "Reseeded discovery" },
      })
    );
  }
  const transientNodeIds = new Set(transientNodes.map((node) => node.id));
  const nodes = [...savedNodes, ...transientNodes];
  const suggestedEdges = includedRecommendations.map((recommendation) => {
    const target = recommendationNodeId(recommendation);
    return {
      id: `suggested:${seedId}->${target}`,
      source: seedId,
      target,
      createdAt: 0,
      reason: recommendation.reason.label,
      transient: true,
    };
  });
  const edges = [
    ...savedEdges.map((edge) => ({ ...edge, transient: false })),
    ...suggestedEdges,
  ];
  const related = relatedNodeIds(seedId, nodes, edges);
  const atlasPositions =
    permanentPositions ?? createAtlasLayout(savedNodes, savedEdges);
  const transientPositions = Object.fromEntries(
    transientNodes.map((node) => [
      node.id,
      {
        x: 0.5,
        y: 0.5,
      },
    ])
  );
  const positions = projectOrbit(seedId, nodes, edges, atlasPositions).positions;
  for (const [nodeId, position] of Object.entries(transientPositions)) {
    if (!(nodeId in positions)) positions[nodeId] = position;
  }

  return {
    nodes: nodes.map((node) => ({
      ...node,
      transient: transientNodeIds.has(node.id),
      faded: !related.has(node.id),
    })),
    edges,
    positions,
  };
}

export { MAX_ORBIT_RECOMMENDATIONS };
