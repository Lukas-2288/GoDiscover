import AsyncStorage from "@react-native-async-storage/async-storage";

import { DISCOVERY_MAP_STORAGE_KEY, loadMapSnapshot, recordMapTrailEvent } from "../discoveryMap";
import {
  disconnectSavedItemTrails,
  syncDiscoveryTrailEvents,
} from "../discoveryTrailSync";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

type RemoteEvent = {
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

let mockRemoteEvents: RemoteEvent[] = [];
let mockCurrentUserId: string | null = "user-a";
let mockSelectFailure: Error | null = null;
let mockAppendFailure: Error | null = null;
let mockAppendRequests: RemoteEvent[][] = [];
let mockSelectGate: Promise<void> | null = null;

jest.mock("../../supabase", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({
        data: {
          session: mockCurrentUserId ? { user: { id: mockCurrentUserId } } : null,
        },
      })),
    },
    from: jest.fn(() => ({
      select: jest.fn(async () => {
        if (mockSelectGate) await mockSelectGate;
        if (mockSelectFailure) throw mockSelectFailure;
        return {
          data: mockRemoteEvents.filter((event) => event.user_id === mockCurrentUserId),
          error: null,
        };
      }),
      upsert: jest.fn(async (rows: RemoteEvent[]) => {
        if (mockAppendFailure) throw mockAppendFailure;
        mockAppendRequests.push(rows);
        for (const row of rows) {
          if (!mockRemoteEvents.some((event) => event.user_id === row.user_id && event.event_id === row.event_id)) {
            mockRemoteEvents.push(row);
          }
        }
        return { error: null };
      }),
    })),
  },
}));

const localConnect = {
  id: "connect:movies:arrival->books:kindred:10",
  relationshipId: "movies:arrival->books:kindred",
  action: "connect" as const,
  source: "movies:arrival",
  target: "books:kindred",
  occurredAt: 10,
  origin: "anonymous" as const,
};

beforeEach(async () => {
  await AsyncStorage.clear();
  mockRemoteEvents = [];
  mockCurrentUserId = "user-a";
  mockSelectFailure = null;
  mockAppendFailure = null;
  mockAppendRequests = [];
  mockSelectGate = null;
});

it("claims an anonymous offline event for the signed-in user and merges a cloud event", async () => {
  await AsyncStorage.setItem(
    DISCOVERY_MAP_STORAGE_KEY,
    JSON.stringify({ version: 2, events: [localConnect] })
  );
  mockRemoteEvents = [
    {
      event_id: "connect:books:kindred->movies:moonlight:20",
      relationship_id: "books:kindred->movies:moonlight",
      action: "connect",
      source: "books:kindred",
      target: "movies:moonlight",
      occurred_at: new Date(20).toISOString(),
      reason: "shared creator",
      session_id: "session-1",
      user_id: "user-a",
    },
  ];

  await syncDiscoveryTrailEvents();

  expect(mockRemoteEvents).toEqual([
    {
      event_id: "connect:books:kindred->movies:moonlight:20",
      relationship_id: "books:kindred->movies:moonlight",
      action: "connect",
      source: "books:kindred",
      target: "movies:moonlight",
      occurred_at: new Date(20).toISOString(),
      reason: "shared creator",
      session_id: "session-1",
      user_id: "user-a",
    },
    {
      event_id: "connect:movies:arrival->books:kindred:10",
      relationship_id: "movies:arrival->books:kindred",
      action: "connect",
      source: "movies:arrival",
      target: "books:kindred",
      occurred_at: new Date(10).toISOString(),
      reason: null,
      session_id: null,
      user_id: "user-a",
    },
  ]);
  await expect(
    AsyncStorage.getItem(DISCOVERY_MAP_STORAGE_KEY).then((raw) =>
      raw ? JSON.parse(raw) : null
    )
  ).resolves.toEqual({
    version: 2,
    events: [
      { ...localConnect, origin: "account", userId: "user-a" },
      {
        id: "connect:books:kindred->movies:moonlight:20",
        relationshipId: "books:kindred->movies:moonlight",
        action: "connect",
        source: "books:kindred",
        target: "movies:moonlight",
        occurredAt: 20,
        origin: "account",
        reason: "shared creator",
        sessionId: "session-1",
        userId: "user-a",
      },
    ],
  });
});

it("appends stable disconnect tombstones for every active trail attached to an unsaved item", async () => {
  const secondConnect = {
    id: "connect:movies:arrival->movies:moonlight:11",
    relationshipId: "movies:arrival->movies:moonlight",
    action: "connect" as const,
    source: "movies:arrival",
    target: "movies:moonlight",
    occurredAt: 11,
    origin: "anonymous" as const,
  };
  await AsyncStorage.setItem(
    DISCOVERY_MAP_STORAGE_KEY,
    JSON.stringify({ version: 2, events: [localConnect, secondConnect] })
  );

  const events = await disconnectSavedItemTrails(
    { category: "movies", id: "arrival" },
    { occurredAt: 30, reason: "unsaved", sessionId: "session-2" }
  );

  expect(events).toEqual([
    localConnect,
    secondConnect,
    {
      id: "disconnect:movies:arrival->books:kindred:30",
      relationshipId: "movies:arrival->books:kindred",
      action: "disconnect",
      source: "movies:arrival",
      target: "books:kindred",
      occurredAt: 30,
      origin: "anonymous",
      reason: "unsaved",
      sessionId: "session-2",
      userId: undefined,
    },
    {
      id: "disconnect:movies:arrival->movies:moonlight:30",
      relationshipId: "movies:arrival->movies:moonlight",
      action: "disconnect",
      source: "movies:arrival",
      target: "movies:moonlight",
      occurredAt: 30,
      origin: "anonymous",
      reason: "unsaved",
      sessionId: "session-2",
      userId: undefined,
    },
  ]);
});

it("folds a real persisted connection into a persisted disconnect before the endpoint is removed", async () => {
  const savedItems = [
    { id: "arrival", category: "movies" as const, title: "Arrival", subtitle: "2016", meta: "Science fiction", savedAt: 10 },
    { id: "kindred", category: "books" as const, title: "Kindred", subtitle: "Octavia E. Butler", meta: "1979", savedAt: 9 },
  ];
  await recordMapTrailEvent(
    {
      source: { category: "movies", id: "arrival" },
      target: { category: "books", id: "kindred" },
      occurredAt: 10,
    },
    savedItems
  );
  await disconnectSavedItemTrails(
    { category: "movies", id: "arrival" },
    { occurredAt: 20, reason: "unsaved" }
  );

  await expect(loadMapSnapshot([savedItems[1]])).resolves.toMatchObject({
    edges: [],
    events: [
      expect.objectContaining({
        action: "connect",
        relationshipId: "movies:arrival->books:kindred",
      }),
      expect.objectContaining({
        action: "disconnect",
        relationshipId: "movies:arrival->books:kindred",
      }),
    ],
  });
  await expect(AsyncStorage.getItem(DISCOVERY_MAP_STORAGE_KEY).then((raw) => raw ? JSON.parse(raw) : null)).resolves.toEqual({
    version: 2,
    events: [
      expect.objectContaining({
        action: "connect",
        relationshipId: "movies:arrival->books:kindred",
      }),
      expect.objectContaining({
        action: "disconnect",
        relationshipId: "movies:arrival->books:kindred",
      }),
    ],
  });
});

it("preserves a connect recorded while cloud synchronization is awaiting its read", async () => {
  let releaseSelect: () => void = () => undefined;
  mockSelectGate = new Promise<void>((resolve) => {
    releaseSelect = resolve;
  });
  const sync = syncDiscoveryTrailEvents();
  await Promise.resolve();
  await Promise.resolve();

  await recordMapTrailEvent(
    {
      source: { category: "movies", id: "arrival" },
      target: { category: "books", id: "kindred" },
      occurredAt: 50,
    },
    [
      {
        id: "arrival",
        category: "movies",
        title: "Arrival",
        subtitle: "2016",
        meta: "Science fiction",
        savedAt: 2,
      },
      {
        id: "kindred",
        category: "books",
        title: "Kindred",
        subtitle: "Octavia E. Butler",
        meta: "1979",
        savedAt: 1,
      },
    ],
    "user-a"
  );
  releaseSelect();
  await sync;

  await expect(
    loadMapSnapshot(
      [
        {
          id: "arrival",
          category: "movies",
          title: "Arrival",
          subtitle: "2016",
          meta: "Science fiction",
          savedAt: 2,
        },
        {
          id: "kindred",
          category: "books",
          title: "Kindred",
          subtitle: "Octavia E. Butler",
          meta: "1979",
          savedAt: 1,
        },
      ],
      "user-a"
    )
  ).resolves.toMatchObject({
    edges: [
      expect.objectContaining({
        id: "movies:arrival->books:kindred",
      }),
    ],
  });
});

it("serializes a connect followed by disconnect so the tombstone covers the new relationship", async () => {
  const savedItems = [
    {
      id: "arrival",
      category: "movies" as const,
      title: "Arrival",
      subtitle: "2016",
      meta: "Science fiction",
      savedAt: 2,
    },
    {
      id: "kindred",
      category: "books" as const,
      title: "Kindred",
      subtitle: "Octavia E. Butler",
      meta: "1979",
      savedAt: 1,
    },
  ];

  const connect = recordMapTrailEvent(
    {
      source: { category: "movies", id: "arrival" },
      target: { category: "books", id: "kindred" },
      occurredAt: 60,
    },
    savedItems,
    "user-a"
  );
  const disconnect = disconnectSavedItemTrails(
    { category: "movies", id: "arrival" },
    { occurredAt: 61, userId: "user-a" }
  );
  await Promise.all([connect, disconnect]);

  await expect(loadMapSnapshot(savedItems, "user-a")).resolves.toMatchObject({
    edges: [],
    events: [
      expect.objectContaining({ action: "connect", occurredAt: 60 }),
      expect.objectContaining({ action: "disconnect", occurredAt: 61 }),
    ],
  });
});

it("keeps an offline event queued when its cloud read fails", async () => {
  await AsyncStorage.setItem(
    DISCOVERY_MAP_STORAGE_KEY,
    JSON.stringify({ version: 2, events: [localConnect] })
  );
  mockSelectFailure = new Error("offline");

  await expect(syncDiscoveryTrailEvents()).resolves.toEqual([localConnect]);
  await expect(
    AsyncStorage.getItem(DISCOVERY_MAP_STORAGE_KEY).then((raw) =>
      raw ? JSON.parse(raw) : null
    )
  ).resolves.toEqual({ version: 2, events: [localConnect] });
});

it("keeps an offline event queued when its cloud append fails", async () => {
  await AsyncStorage.setItem(
    DISCOVERY_MAP_STORAGE_KEY,
    JSON.stringify({ version: 2, events: [localConnect] })
  );
  mockAppendFailure = new Error("offline");

  await expect(syncDiscoveryTrailEvents()).resolves.toEqual([localConnect]);
  await expect(
    AsyncStorage.getItem(DISCOVERY_MAP_STORAGE_KEY).then((raw) =>
      raw ? JSON.parse(raw) : null
    )
  ).resolves.toEqual({ version: 2, events: [localConnect] });
});

it("preserves another user's local trail events while syncing the current user", async () => {
  const otherUsersDisconnect = {
    id: "disconnect:movies:arrival->books:kindred:20",
    relationshipId: "movies:arrival->books:kindred",
    action: "disconnect" as const,
    source: "movies:arrival",
    target: "books:kindred",
    occurredAt: 20,
    origin: "account" as const,
    userId: "user-b",
  };
  await AsyncStorage.setItem(
    DISCOVERY_MAP_STORAGE_KEY,
    JSON.stringify({ version: 2, events: [otherUsersDisconnect, localConnect] })
  );

  await syncDiscoveryTrailEvents();

  expect(mockRemoteEvents).toEqual([
    {
      event_id: "connect:movies:arrival->books:kindred:10",
      relationship_id: "movies:arrival->books:kindred",
      action: "connect",
      source: "movies:arrival",
      target: "books:kindred",
      occurred_at: new Date(10).toISOString(),
      reason: null,
      session_id: null,
      user_id: "user-a",
    },
  ]);
  await expect(
    AsyncStorage.getItem(DISCOVERY_MAP_STORAGE_KEY).then((raw) =>
      raw ? JSON.parse(raw) : null
    )
  ).resolves.toEqual({
    version: 2,
    events: [otherUsersDisconnect, { ...localConnect, origin: "account", userId: "user-a" }],
  });
});

it("does not append an already-synchronized event on a repeated sync", async () => {
  await AsyncStorage.setItem(
    DISCOVERY_MAP_STORAGE_KEY,
    JSON.stringify({ version: 2, events: [localConnect] })
  );

  await syncDiscoveryTrailEvents();
  await syncDiscoveryTrailEvents();

  expect(mockAppendRequests).toEqual([
    [
      {
        event_id: "connect:movies:arrival->books:kindred:10",
        relationship_id: "movies:arrival->books:kindred",
        action: "connect",
        source: "movies:arrival",
        target: "books:kindred",
        occurred_at: new Date(10).toISOString(),
        reason: null,
        session_id: null,
        user_id: "user-a",
      },
    ],
  ]);
  expect(mockRemoteEvents).toHaveLength(1);
});

it("disconnects only the active owner's relationship when another account disconnected the same ID", async () => {
  const accountAConnect = {
    ...localConnect,
    origin: "account" as const,
    userId: "user-a",
  };
  const accountBDisconnect = {
    id: "disconnect:movies:arrival->books:kindred:20",
    relationshipId: "movies:arrival->books:kindred",
    action: "disconnect" as const,
    source: "movies:arrival",
    target: "books:kindred",
    occurredAt: 20,
    origin: "account" as const,
    userId: "user-b",
  };
  await AsyncStorage.setItem(
    DISCOVERY_MAP_STORAGE_KEY,
    JSON.stringify({ version: 2, events: [accountAConnect, accountBDisconnect] })
  );

  const events = await disconnectSavedItemTrails(
    { category: "movies", id: "arrival" },
    { occurredAt: 30, userId: "user-a" }
  );

  expect(events).toContainEqual({
    id: "disconnect:movies:arrival->books:kindred:30",
    relationshipId: "movies:arrival->books:kindred",
    action: "disconnect",
    source: "movies:arrival",
    target: "books:kindred",
    occurredAt: 30,
    origin: "account",
    userId: "user-a",
  });
  expect(events).toContainEqual(accountBDisconnect);
});

it("does not let a second account claim signed-in offline history", async () => {
  const savedItems = [
    {
      id: "arrival",
      category: "movies" as const,
      title: "Arrival",
      subtitle: "2016",
      meta: "Science fiction",
      savedAt: 10,
    },
    {
      id: "kindred",
      category: "books" as const,
      title: "Kindred",
      subtitle: "Octavia E. Butler",
      meta: "1979",
      savedAt: 9,
    },
  ];
  await recordMapTrailEvent(
    {
      source: { category: "movies", id: "arrival" },
      target: { category: "books", id: "kindred" },
      occurredAt: 10,
    },
    savedItems,
    "user-a"
  );
  mockCurrentUserId = "user-b";

  await syncDiscoveryTrailEvents();

  expect(mockRemoteEvents).toEqual([]);
  await expect(
    AsyncStorage.getItem(DISCOVERY_MAP_STORAGE_KEY).then((raw) =>
      raw ? JSON.parse(raw) : null
    )
  ).resolves.toEqual({
    version: 2,
    events: [
      {
        ...localConnect,
        origin: "account",
        userId: "user-a",
      },
    ],
  });
});

// An anonymous trail event belongs to whichever account claims it first. Two
// overlapping syncs must not both convert and upload it, or one signed-out
// user's discovery history is copied into two different accounts.
it("uploads an anonymous event to exactly one account when two syncs overlap", async () => {
  await AsyncStorage.setItem(
    DISCOVERY_MAP_STORAGE_KEY,
    JSON.stringify({ version: 2, events: [localConnect] })
  );

  let releaseSelect: () => void = () => undefined;
  mockSelectGate = new Promise<void>((resolve) => {
    releaseSelect = resolve;
  });

  mockCurrentUserId = "user-a";
  const firstSync = syncDiscoveryTrailEvents("user-a");
  // Owner B starts its own sync while A's cloud read is still parked.
  mockCurrentUserId = "user-b";
  const secondSync = syncDiscoveryTrailEvents("user-b");

  releaseSelect();
  await Promise.all([
    firstSync.catch(() => undefined),
    secondSync.catch(() => undefined),
  ]);

  const uploadsOfAnonymousEvent = mockRemoteEvents.filter(
    (event) => event.relationship_id === "movies:arrival->books:kindred"
  );
  expect(uploadsOfAnonymousEvent).toHaveLength(1);
  expect(new Set(uploadsOfAnonymousEvent.map((event) => event.user_id)).size).toBe(1);
});

it("keeps an anonymous event claimable when its upload fails", async () => {
  await AsyncStorage.setItem(
    DISCOVERY_MAP_STORAGE_KEY,
    JSON.stringify({ version: 2, events: [localConnect] })
  );
  mockCurrentUserId = "user-a";
  mockAppendFailure = new Error("offline");

  await syncDiscoveryTrailEvents("user-a").catch(() => undefined);

  const stored = JSON.parse(
    (await AsyncStorage.getItem(DISCOVERY_MAP_STORAGE_KEY)) ?? "{}"
  );
  const preserved = stored.events.find(
    (event: { relationshipId: string }) =>
      event.relationshipId === "movies:arrival->books:kindred"
  );
  // Still unclaimed, so a later successful sync can upload it.
  expect(preserved.origin).toBe("anonymous");
  expect(mockRemoteEvents).toHaveLength(0);

  mockAppendFailure = null;
  await syncDiscoveryTrailEvents("user-a");
  expect(mockRemoteEvents).toHaveLength(1);
  expect(mockRemoteEvents[0].user_id).toBe("user-a");
});
