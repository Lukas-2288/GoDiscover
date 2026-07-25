import type { ContentCategory } from "../../types/content";
import { supabase } from "../supabase";
import {
  appendDiscoveryTrailEvents,
  filterTrailMutationEventsForOwner,
  foldTrailMutationEvents,
  readDiscoveryTrailEvents,
  writeDiscoveryTrailEvents,
  type TrailMutationEvent,
} from "./discoveryMap";

type DiscoveryTrailEventRow = {
  event_id: string;
  relationship_id: string;
  action: "connect" | "disconnect";
  source: string;
  target: string;
  occurred_at: string;
  reason: string | null;
  session_id: string | null;
  user_id: string;
};

export type DisconnectSavedItemTrailsOptions = {
  occurredAt: number;
  reason?: string;
  sessionId?: string;
  userId?: string;
};

function eventKey(event: TrailMutationEvent): string {
  return `${event.origin}:${event.userId ?? "anonymous"}:${event.id}`;
}

function uniqueEvents(events: readonly TrailMutationEvent[]): TrailMutationEvent[] {
  const byKey = new Map<string, TrailMutationEvent>();
  for (const event of events) byKey.set(eventKey(event), event);
  return [...byKey.values()];
}

function rowToEvent(row: DiscoveryTrailEventRow): TrailMutationEvent | null {
  const occurredAt = new Date(row.occurred_at).getTime();
  if (
    typeof row.event_id !== "string" ||
    typeof row.relationship_id !== "string" ||
    (row.action !== "connect" && row.action !== "disconnect") ||
    typeof row.source !== "string" ||
    typeof row.target !== "string" ||
    !Number.isFinite(occurredAt) ||
    typeof row.user_id !== "string"
  ) {
    return null;
  }
  return {
    id: row.event_id,
    relationshipId: row.relationship_id,
    action: row.action,
    source: row.source,
    target: row.target,
    occurredAt,
    origin: "account",
    reason: row.reason ?? undefined,
    sessionId: row.session_id ?? undefined,
    userId: row.user_id,
  };
}

function eventToRow(event: TrailMutationEvent, userId: string): DiscoveryTrailEventRow {
  return {
    event_id: event.id,
    relationship_id: event.relationshipId,
    action: event.action,
    source: event.source,
    target: event.target,
    occurred_at: new Date(event.occurredAt).toISOString(),
    reason: event.reason ?? null,
    session_id: event.sessionId ?? null,
    user_id: userId,
  };
}

async function getUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id ?? null;
  } catch {
    return null;
  }
}

export async function syncDiscoveryTrailEvents(): Promise<TrailMutationEvent[]> {
  const userId = await getUserId();
  const localEvents = await readDiscoveryTrailEvents();
  if (!userId) return localEvents;

  let data: unknown;
  let error: unknown;
  try {
    ({ data, error } = await supabase
      .from("discovery_trail_events")
      .select("event_id,relationship_id,action,source,target,occurred_at,reason,session_id,user_id"));
  } catch {
    return localEvents;
  }
  if (error) return localEvents;

  const cloudEvents = ((data ?? []) as DiscoveryTrailEventRow[])
    .map(rowToEvent)
    .filter((event): event is TrailMutationEvent => event !== null && event.userId === userId);
  const cloudEventIds = new Set(cloudEvents.map((event) => event.id));
  const ownedEvents = filterTrailMutationEventsForOwner(localEvents, userId);
  const currentUserEvents = ownedEvents.map((event) =>
    event.origin === "anonymous"
      ? { ...event, origin: "account" as const, userId }
      : event
  );
  const foreignEvents = localEvents.filter((event) => !ownedEvents.includes(event));
  const eventsToAppend = currentUserEvents.filter(
    (event) => !cloudEventIds.has(event.id)
  );

  if (eventsToAppend.length > 0) {
    let appendError: unknown;
    try {
      ({ error: appendError } = await supabase
        .from("discovery_trail_events")
        .upsert(eventsToAppend.map((event) => eventToRow(event, userId)), {
          onConflict: "user_id,event_id",
          ignoreDuplicates: true,
        }));
    } catch {
      return localEvents;
    }
    if (appendError) return localEvents;
  }

  const merged = uniqueEvents([...foreignEvents, ...currentUserEvents, ...cloudEvents]);
  await writeDiscoveryTrailEvents(merged);
  return merged;
}

export async function disconnectSavedItemTrails(
  item: { category: ContentCategory; id: string },
  options: DisconnectSavedItemTrailsOptions
): Promise<TrailMutationEvent[]> {
  const itemNodeId = `${item.category}:${item.id}`;
  const events = await readDiscoveryTrailEvents();
  const ownedEvents = filterTrailMutationEventsForOwner(events, options.userId);
  const disconnects = foldTrailMutationEvents(ownedEvents)
    .filter((edge) => edge.source === itemNodeId || edge.target === itemNodeId)
    .map((edge) => ({
      id: `disconnect:${edge.id}:${options.occurredAt}`,
      relationshipId: edge.id,
      action: "disconnect" as const,
      source: edge.source,
      target: edge.target,
      occurredAt: options.occurredAt,
      origin: options.userId ? ("account" as const) : ("anonymous" as const),
      reason: options.reason,
      sessionId: options.sessionId,
      userId: options.userId,
    }));
  return appendDiscoveryTrailEvents(disconnects);
}
