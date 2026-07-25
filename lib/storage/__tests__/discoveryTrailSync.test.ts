import AsyncStorage from "@react-native-async-storage/async-storage";

import { DISCOVERY_MAP_STORAGE_KEY } from "../discoveryMap";
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
};

beforeEach(async () => {
  await AsyncStorage.clear();
  mockRemoteEvents = [];
  mockCurrentUserId = "user-a";
  mockSelectFailure = null;
  mockAppendFailure = null;
  mockAppendRequests = [];
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
      { ...localConnect, userId: "user-a" },
      {
        id: "connect:books:kindred->movies:moonlight:20",
        relationshipId: "books:kindred->movies:moonlight",
        action: "connect",
        source: "books:kindred",
        target: "movies:moonlight",
        occurredAt: 20,
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
      reason: "unsaved",
      sessionId: "session-2",
    },
    {
      id: "disconnect:movies:arrival->movies:moonlight:30",
      relationshipId: "movies:arrival->movies:moonlight",
      action: "disconnect",
      source: "movies:arrival",
      target: "movies:moonlight",
      occurredAt: 30,
      reason: "unsaved",
      sessionId: "session-2",
    },
  ]);
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
    events: [otherUsersDisconnect, { ...localConnect, userId: "user-a" }],
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
