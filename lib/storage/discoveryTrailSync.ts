import type { ContentCategory } from "../../types/content";
import { supabase } from "../supabase";
import {
  filterTrailMutationEventsForOwner,
  foldTrailMutationEvents,
  readDiscoveryTrailEvents,
  updateDiscoveryTrailEvents,
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

// Synchronizations are serialized so two accounts cannot interleave their
// claims on the same anonymous history. Without this, overlapping syncs both
// read the events as unclaimed and both upload them.
let syncTail: Promise<unknown> = Promise.resolve();

function serializeSync<T>(run: () => Promise<T>): Promise<T> {
  const result = syncTail.then(run, run);
  syncTail = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

export async function syncDiscoveryTrailEvents(
  expectedUserId?: string
): Promise<TrailMutationEvent[]> {
  return serializeSync(() => runDiscoveryTrailSync(expectedUserId));
}

async function runDiscoveryTrailSync(
  expectedUserId?: string
): Promise<TrailMutationEvent[]> {
  const userId = await getUserId();
  const localEvents = await readDiscoveryTrailEvents();
  if (!userId || (expectedUserId !== undefined && userId !== expectedUserId)) {
    return localEvents;
  }

  // Claim the anonymous history for this account durably, before any cloud
  // call. A later sync for a different account then reads these as already
  // owned and leaves them alone. Claiming only in memory — as this did — lets
  // both accounts believe they own the same events.
  const claimedEventIds = new Set<string>();
  await updateDiscoveryTrailEvents((events) =>
    events.map((event) => {
      if (event.origin !== "anonymous") return event;
      claimedEventIds.add(event.id);
      return { ...event, origin: "account" as const, userId };
    })
  );

  // Any abandoned sync must hand the claim back, or the events become
  // unreachable: owned by an account that never uploaded them, and no longer
  // anonymous for anyone else to claim.
  const releaseClaim = async (): Promise<TrailMutationEvent[]> => {
    if (claimedEventIds.size === 0) return readDiscoveryTrailEvents();
    return updateDiscoveryTrailEvents((events) =>
      events.map((event) =>
        claimedEventIds.has(event.id) &&
        event.origin === "account" &&
        event.userId === userId
          ? { ...event, origin: "anonymous" as const, userId: undefined }
          : event
      )
    );
  };

  const ownerStillActive = async (): Promise<boolean> =>
    (await getUserId()) === userId;

  let data: unknown;
  let error: unknown;
  try {
    ({ data, error } = await supabase
      .from("discovery_trail_events")
      .select("event_id,relationship_id,action,source,target,occurred_at,reason,session_id,user_id"));
  } catch {
    return releaseClaim();
  }
  if (error) return releaseClaim();
  if (!(await ownerStillActive())) return releaseClaim();

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
      return releaseClaim();
    }
    if (appendError) return releaseClaim();
    if (!(await ownerStillActive())) return releaseClaim();
  }

  return updateDiscoveryTrailEvents((latestEvents) => {
    const latestOwnedEvents = filterTrailMutationEventsForOwner(
      latestEvents,
      userId
    );
    const latestCurrentUserEvents = latestOwnedEvents.map((event) =>
      event.origin === "anonymous"
        ? { ...event, origin: "account" as const, userId }
        : event
    );
    const latestForeignEvents = latestEvents.filter(
      (event) => !latestOwnedEvents.includes(event)
    );
    return uniqueEvents([
      ...latestForeignEvents,
      ...latestCurrentUserEvents,
      ...cloudEvents,
    ]);
  });
}

export async function disconnectSavedItemTrails(
  item: { category: ContentCategory; id: string },
  options: DisconnectSavedItemTrailsOptions
): Promise<TrailMutationEvent[]> {
  const itemNodeId = `${item.category}:${item.id}`;
  return updateDiscoveryTrailEvents((events) => {
    const ownedEvents = filterTrailMutationEventsForOwner(
      events,
      options.userId
    );
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
    return [...events, ...disconnects];
  });
}
