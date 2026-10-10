import AsyncStorage from "@react-native-async-storage/async-storage";

import type { SavedItem } from "../saved";
import {
  LEGACY_SAVED_STORAGE_KEY,
  SAVED_ANONYMOUS_STORAGE_KEY,
  listSaved,
  listSavedForOwner,
  savedStorageKeyForOwner,
} from "../saved";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

type RemoteRow = {
  user_id: string;
  category: SavedItem["category"];
  item_id: string;
  title: string;
  subtitle: string;
  meta: string;
  image_url: string | null;
  saved_at: string;
};

let mockCurrentUserId: string | null = null;
let mockRemoteRows: RemoteRow[] = [];
let mockCloudReadFails = false;
let mockCloudWriteFails = false;
const mockUpsertCalls: RemoteRow[][] = [];

jest.mock("../../supabase", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({
        data: {
          session: mockCurrentUserId
            ? { user: { id: mockCurrentUserId } }
            : null,
        },
      })),
    },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        order: jest.fn(async () => ({
          data: mockCloudReadFails
            ? null
            : mockRemoteRows.filter(
                (row) => row.user_id === mockCurrentUserId
              ),
          error: mockCloudReadFails ? { message: "offline" } : null,
        })),
      })),
      upsert: jest.fn(async (rows: RemoteRow | RemoteRow[]) => {
        const batch = (Array.isArray(rows) ? rows : [rows]).map((row) => ({
          ...row,
          saved_at: row.saved_at ?? new Date(100).toISOString(),
        }));
        mockUpsertCalls.push(batch);
        if (mockCloudWriteFails) return { error: { message: "offline" } };
        for (const row of batch) {
          const existing = mockRemoteRows.findIndex(
            (candidate) =>
              candidate.user_id === row.user_id &&
              candidate.category === row.category &&
              candidate.item_id === row.item_id
          );
          if (existing === -1) mockRemoteRows.push(row);
        }
        return { error: null };
      }),
    })),
  },
}));

function saved(id: string, savedAt: number): SavedItem {
  return {
    id,
    category: "movies",
    title: id,
    subtitle: "subtitle",
    meta: "meta",
    savedAt,
  };
}

function remote(ownerId: string, item: SavedItem): RemoteRow {
  return {
    user_id: ownerId,
    category: item.category,
    item_id: item.id,
    title: item.title,
    subtitle: item.subtitle,
    meta: item.meta,
    image_url: item.imageUrl ?? null,
    saved_at: new Date(item.savedAt).toISOString(),
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  mockCurrentUserId = null;
  mockRemoteRows = [];
  mockCloudReadFails = false;
  mockCloudWriteFails = false;
  mockUpsertCalls.length = 0;
});

it("keeps owner A's saved cache out of the anonymous bucket after sign-out", async () => {
  await AsyncStorage.setItem(
    savedStorageKeyForOwner("owner-a"),
    JSON.stringify([saved("owner-a-only", 10)])
  );
  await AsyncStorage.setItem(
    SAVED_ANONYMOUS_STORAGE_KEY,
    JSON.stringify([saved("anonymous-only", 20)])
  );

  mockCurrentUserId = null;

  await expect(listSaved()).resolves.toEqual([saved("anonymous-only", 20)]);
});

it("migrates the unowned legacy cache once into the active owner without exposing it after sign-out", async () => {
  await AsyncStorage.setItem(
    LEGACY_SAVED_STORAGE_KEY,
    JSON.stringify([saved("legacy-owner-a", 10)])
  );
  mockCurrentUserId = "owner-a";
  mockCloudReadFails = true;

  await expect(listSavedForOwner("owner-a")).resolves.toEqual([
    saved("legacy-owner-a", 10),
  ]);

  mockCurrentUserId = null;
  await expect(listSavedForOwner(null)).resolves.toEqual([]);
});

it("merges anonymous saves into a signed-in owner idempotently before cloud hydration", async () => {
  const anonymous = saved("anonymous-save", 30);
  const cloud = saved("cloud-save", 20);
  await AsyncStorage.setItem(
    SAVED_ANONYMOUS_STORAGE_KEY,
    JSON.stringify([anonymous])
  );
  mockCurrentUserId = "owner-a";
  mockRemoteRows = [remote("owner-a", cloud)];

  await expect(
    listSavedForOwner("owner-a").then((items) => items.map((item) => item.id))
  ).resolves.toEqual(["anonymous-save", "cloud-save"]);
  await expect(
    listSavedForOwner("owner-a").then((items) => items.map((item) => item.id))
  ).resolves.toEqual(["anonymous-save", "cloud-save"]);

  expect(mockUpsertCalls).toHaveLength(1);
  expect(mockUpsertCalls[0]).toEqual([
    expect.objectContaining({
      user_id: "owner-a",
      category: "movies",
      item_id: "anonymous-save",
    }),
  ]);
  await expect(AsyncStorage.getItem(SAVED_ANONYMOUS_STORAGE_KEY)).resolves.toBe(
    null
  );
});

it("uses only owner B's bucket when switching from owner A while the cloud is unavailable", async () => {
  await AsyncStorage.setItem(
    savedStorageKeyForOwner("owner-a"),
    JSON.stringify([saved("owner-a-only", 30)])
  );
  await AsyncStorage.setItem(
    savedStorageKeyForOwner("owner-b"),
    JSON.stringify([saved("owner-b-cached", 20)])
  );
  mockCurrentUserId = "owner-b";
  mockCloudReadFails = true;

  await expect(listSavedForOwner("owner-b")).resolves.toEqual([
    saved("owner-b-cached", 20),
  ]);
});

it("replaces owner B's own fallback cache after a successful owner B hydration", async () => {
  await AsyncStorage.setItem(
    savedStorageKeyForOwner("owner-b"),
    JSON.stringify([saved("owner-b-stale", 10)])
  );
  mockCurrentUserId = "owner-b";
  const cloud = saved("owner-b-cloud", 40);
  mockRemoteRows = [remote("owner-b", cloud)];

  await expect(listSavedForOwner("owner-b")).resolves.toEqual([cloud]);
  await expect(
    AsyncStorage.getItem(savedStorageKeyForOwner("owner-b")).then((raw) =>
      raw ? JSON.parse(raw) : null
    )
  ).resolves.toEqual([cloud]);
});
