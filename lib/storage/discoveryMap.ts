import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ContentCategory } from "../../types/content";
import type { SavedItem } from "./saved";

export const DISCOVERY_MAP_STORAGE_KEY = "godiscover:discovery-map-edges:v1";

export type MapNode = {
  id: string;
  category: ContentCategory;
  itemId: string;
  title: string;
  subtitle: string;
  meta: string;
  imageUrl?: string;
  savedAt: number;
  x: number;
  y: number;
};

export type MapEdge = {
  id: string;
  source: string;
  target: string;
  createdAt: number;
};

export type MapTrailEvent = {
  source: Pick<SavedItem, "category" | "id">;
  target: Pick<SavedItem, "category" | "id">;
  occurredAt: number;
};

export type MapSnapshot = {
  version: 1;
  nodes: MapNode[];
  edges: MapEdge[];
};

function nodeId(item: Pick<SavedItem, "category" | "id">): string {
  return `${item.category}:${item.id}`;
}

function hashToUnitInterval(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) / 4_294_967_295;
}

function stableCoordinate(id: string, axis: "x" | "y"): number {
  return hashToUnitInterval(`${axis}:${id}`);
}

function isMapEdge(value: unknown): value is MapEdge {
  if (!value || typeof value !== "object") return false;
  const edge = value as Partial<MapEdge>;
  return (
    typeof edge.id === "string" &&
    typeof edge.source === "string" &&
    typeof edge.target === "string" &&
    typeof edge.createdAt === "number" &&
    Number.isFinite(edge.createdAt)
  );
}

async function readStoredEdges(): Promise<MapEdge[]> {
  let raw: string | null;
  try {
    raw = await AsyncStorage.getItem(DISCOVERY_MAP_STORAGE_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];

  let parsed: { version?: unknown; edges?: unknown };
  try {
    parsed = JSON.parse(raw) as { version?: unknown; edges?: unknown };
  } catch {
    await writeStoredEdges([]);
    return [];
  }
  if (
    parsed.version !== 1 ||
    !Array.isArray(parsed.edges) ||
    !parsed.edges.every(isMapEdge)
  ) {
    await writeStoredEdges([]);
    return [];
  }
  return parsed.edges;
}

async function writeStoredEdges(edges: readonly MapEdge[]): Promise<void> {
  await AsyncStorage.setItem(
    DISCOVERY_MAP_STORAGE_KEY,
    JSON.stringify({ version: 1, edges })
  );
}

function pruneEdges(
  edges: readonly MapEdge[],
  nodeIds: ReadonlySet<string>
): MapEdge[] {
  return edges.filter(
    (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)
  );
}

export function deriveMapNodes(savedItems: readonly SavedItem[]): MapNode[] {
  return savedItems.map((item) => {
    const id = nodeId(item);
    return {
      id,
      category: item.category,
      itemId: item.id,
      title: item.title,
      subtitle: item.subtitle,
      meta: item.meta,
      imageUrl: item.imageUrl,
      savedAt: item.savedAt,
      x: stableCoordinate(id, "x"),
      y: stableCoordinate(id, "y"),
    };
  });
}

export async function loadMapSnapshot(
  savedItems: readonly SavedItem[]
): Promise<MapSnapshot> {
  const nodes = deriveMapNodes(savedItems);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const storedEdges = await readStoredEdges();
  const edges = pruneEdges(storedEdges, nodeIds);
  if (edges.length !== storedEdges.length) await writeStoredEdges(edges);
  return { version: 1, nodes, edges };
}

export async function recordMapTrailEvent(
  event: MapTrailEvent,
  savedItems: readonly SavedItem[]
): Promise<MapSnapshot> {
  const nodes = deriveMapNodes(savedItems);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const source = nodeId(event.source);
  const target = nodeId(event.target);
  const storedEdges = pruneEdges(await readStoredEdges(), nodeIds);
  let edges = storedEdges;
  if (source !== target && nodeIds.has(source) && nodeIds.has(target)) {
    const edge: MapEdge = {
      id: `${source}->${target}`,
      source,
      target,
      createdAt: event.occurredAt,
    };
    edges = [...storedEdges.filter((stored) => stored.id !== edge.id), edge];
  }

  await writeStoredEdges(edges);

  return { version: 1, nodes, edges };
}
