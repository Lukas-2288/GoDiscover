import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ContentCategory } from "../../types/content";
import type { SavedItem } from "./saved";

export const DISCOVERY_MAP_STORAGE_KEY = "godiscover:discovery-map-edges:v1";
export const DISCOVERY_MAP_MALFORMED_STORAGE_KEY =
  "godiscover:discovery-map-edges:malformed";

export type MapExperienceMode = "atlas" | "orbit";

export type CulturalProfile = {
  vocabularyVersion: 1;
  genres: string[];
  styles: string[];
  subjects: string[];
  creators: string[];
  era?: string;
};

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
  culturalProfile?: CulturalProfile;
};

export type MapEdge = {
  id: string;
  source: string;
  target: string;
  createdAt: number;
  reason?: string;
};

export type MapTrailEvent = {
  source: Pick<SavedItem, "category" | "id">;
  target: Pick<SavedItem, "category" | "id">;
  occurredAt: number;
};

export type TrailMutationEvent = {
  id: string;
  relationshipId: string;
  action: "connect" | "disconnect";
  source: string;
  target: string;
  occurredAt: number;
  reason?: string;
  sessionId?: string;
  userId?: string;
};

export type LegacyMapSnapshot = {
  version: 1;
  nodes: MapNode[];
  edges: MapEdge[];
  events?: TrailMutationEvent[];
};

export type CurrentMapSnapshot = {
  version: 2;
  nodes: MapNode[];
  edges: MapEdge[];
  events: TrailMutationEvent[];
};

export type MapSnapshot = LegacyMapSnapshot | CurrentMapSnapshot;

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

function isTrailMutationEvent(value: unknown): value is TrailMutationEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<TrailMutationEvent>;
  return (
    typeof event.id === "string" &&
    typeof event.relationshipId === "string" &&
    (event.action === "connect" || event.action === "disconnect") &&
    typeof event.source === "string" &&
    typeof event.target === "string" &&
    typeof event.occurredAt === "number" &&
    Number.isFinite(event.occurredAt)
  );
}

function legacyEvent(edge: MapEdge): TrailMutationEvent {
  return {
    id: `legacy:${edge.id}:${edge.createdAt}`,
    relationshipId: edge.id,
    action: "connect",
    source: edge.source,
    target: edge.target,
    occurredAt: edge.createdAt,
  };
}

function uniqueEvents(events: readonly TrailMutationEvent[]): TrailMutationEvent[] {
  const byId = new Map<string, TrailMutationEvent>();
  for (const event of events) {
    byId.set(`${event.userId ?? "anonymous"}:${event.id}`, event);
  }
  return [...byId.values()];
}

function newestEventsByRelationship(
  events: readonly TrailMutationEvent[]
): TrailMutationEvent[] {
  const newest = new Map<string, TrailMutationEvent>();
  for (const event of events) {
    const previous = newest.get(event.relationshipId);
    if (
      !previous ||
      event.occurredAt > previous.occurredAt ||
      (event.occurredAt === previous.occurredAt && event.id > previous.id)
    ) {
      newest.set(event.relationshipId, event);
    }
  }
  return [...newest.values()];
}

async function readStoredEvents(): Promise<TrailMutationEvent[]> {
  let raw: string | null;
  try {
    raw = await AsyncStorage.getItem(DISCOVERY_MAP_STORAGE_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];

  let parsed: { version?: unknown; edges?: unknown; events?: unknown };
  try {
    parsed = JSON.parse(raw) as { version?: unknown; edges?: unknown; events?: unknown };
  } catch {
    await recoverMalformedStoredEvents(raw);
    return [];
  }

  if (parsed.version === 2 && Array.isArray(parsed.events) && parsed.events.every(isTrailMutationEvent)) {
    return uniqueEvents(parsed.events);
  }

  if (parsed.version === 1 && Array.isArray(parsed.edges) && parsed.edges.every(isMapEdge)) {
    const events = newestEventsByRelationship(parsed.edges.map(legacyEvent));
    await writeStoredEvents(events);
    return events;
  }

  await recoverMalformedStoredEvents(raw);
  return [];
}

async function writeStoredEvents(events: readonly TrailMutationEvent[]): Promise<void> {
  await AsyncStorage.setItem(
    DISCOVERY_MAP_STORAGE_KEY,
    JSON.stringify({ version: 2, events: uniqueEvents(events) })
  );
}

async function recoverMalformedStoredEvents(raw: string): Promise<void> {
  try {
    const previous = await AsyncStorage.getItem(DISCOVERY_MAP_MALFORMED_STORAGE_KEY);
    if (!previous) {
      await AsyncStorage.setItem(DISCOVERY_MAP_MALFORMED_STORAGE_KEY, raw);
    }
  } finally {
    await writeStoredEvents([]);
  }
}

export async function readDiscoveryTrailEvents(): Promise<TrailMutationEvent[]> {
  return readStoredEvents();
}

export async function writeDiscoveryTrailEvents(
  events: readonly TrailMutationEvent[]
): Promise<void> {
  await writeStoredEvents(events);
}

export async function appendDiscoveryTrailEvents(
  events: readonly TrailMutationEvent[]
): Promise<TrailMutationEvent[]> {
  const next = uniqueEvents([...await readStoredEvents(), ...events]);
  await writeStoredEvents(next);
  return next;
}

function pruneEvents(
  events: readonly TrailMutationEvent[],
  nodeIds: ReadonlySet<string>
): TrailMutationEvent[] {
  return events.filter(
    (event) =>
      event.action === "disconnect" ||
      (nodeIds.has(event.source) && nodeIds.has(event.target))
  );
}

function eventToEdge(event: TrailMutationEvent): MapEdge {
  return {
    id: event.relationshipId,
    source: event.source,
    target: event.target,
    createdAt: event.occurredAt,
  };
}

export function foldTrailMutationEvents(
  events: readonly TrailMutationEvent[]
): MapEdge[] {
  return newestEventsByRelationship(events)
    .filter((event) => event.action === "connect")
    .map(eventToEdge);
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
  const storedEvents = await readStoredEvents();
  const events = pruneEvents(storedEvents, nodeIds);
  if (events.length !== storedEvents.length) await writeStoredEvents(events);
  return { version: 2, nodes, edges: foldTrailMutationEvents(events), events };
}

export async function recordMapTrailEvent(
  event: MapTrailEvent,
  savedItems: readonly SavedItem[]
): Promise<MapSnapshot> {
  const nodes = deriveMapNodes(savedItems);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const source = nodeId(event.source);
  const target = nodeId(event.target);
  const storedEvents = pruneEvents(await readStoredEvents(), nodeIds);
  let events = storedEvents;
  if (source !== target && nodeIds.has(source) && nodeIds.has(target)) {
    const relationshipId = `${source}->${target}`;
    const trailEvent: TrailMutationEvent = {
      id: `connect:${relationshipId}:${event.occurredAt}`,
      relationshipId,
      action: "connect",
      source,
      target,
      occurredAt: event.occurredAt,
    };
    events = uniqueEvents([...storedEvents, trailEvent]);
  }

  await writeStoredEvents(events);

  return { version: 2, nodes, edges: foldTrailMutationEvents(events), events };
}
