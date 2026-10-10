import AsyncStorage from "@react-native-async-storage/async-storage";

import type { SavedItem } from "../saved";
import {
  SAVED_ANONYMOUS_STORAGE_KEY,
  SavedOwnerChangedError,
  addSavedForOwner,
  listSavedForOwner,
  removeSavedForOwner,
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
const mockUpsertCalls: RemoteRow[][] = [];
const mockDeleteCalls: { category: string; item_id: string; as: string | null }[] = [];
// Lets a test park a cloud call mid-flight and switch accounts underneath it.
let mockGate: { promise: Promise<void>; release: () => void } | null = null;

function openGate() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  mockGate = { promise, release };
  return mockGate;
}

async function mockPassGate() {
  if (!mockGate) return;
  await mockGate.promise;
}

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
      select: jest.fn(() => ({
        order: jest.fn(async () => {
          await mockPassGate();
          return {
            data: mockRemoteRows.filter((row) => row.user_id === mockCurrentUserId),
            error: null,
          };
        }),
      })),
      upsert: jest.fn(async (rows: RemoteRow | RemoteRow[]) => {
        await mockPassGate();
        const batch = (Array.isArray(rows) ? rows : [rows]).map((row) => ({
          ...row,
          saved_at: row.saved_at ?? new Date(100).toISOString(),
        }));
        mockUpsertCalls.push(batch);
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
      delete: jest.fn(() => {
        const filters: Record<string, string> = {};
        const builder: Record<string, unknown> = {
          eq: jest.fn((column: string, value: string) => {
            filters[column] = value;
            return builder;
          }),
          then: (resolve: (value: { error: null }) => unknown) => {
            mockDeleteCalls.push({
              category: filters.category,
              item_id: filters.item_id,
              as: mockCurrentUserId,
            });
            mockRemoteRows = mockRemoteRows.filter(
              (row) =>
                !(
                  row.user_id === mockCurrentUserId &&
                  row.category === filters.category &&
                  row.item_id === filters.item_id
                )
            );
            return Promise.resolve({ error: null }).then(resolve);
          },
        };
        return builder;
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
  mockUpsertCalls.length = 0;
  mockDeleteCalls.length = 0;
  mockGate = null;
});

describe("owner-bound saved mutations", () => {
  // An Undo offered while owner A was signed in must never act on owner B's
  // data. Both accounts can hold the same item id, so resolving the owner when
  // Undo fires — rather than when the save happened — deletes B's copy.
  it("refuses an Undo raised under owner A once owner B is active", async () => {
    mockRemoteRows = [remote("owner-b", saved("arrival", 10))];
    await AsyncStorage.setItem(
      savedStorageKeyForOwner("owner-b"),
      JSON.stringify([saved("arrival", 10)])
    );
    mockCurrentUserId = "owner-b";

    await expect(
      removeSavedForOwner("owner-a", "movies", "arrival")
    ).rejects.toBeInstanceOf(SavedOwnerChangedError);

    expect(mockDeleteCalls).toHaveLength(0);
    expect(mockRemoteRows).toHaveLength(1);
    await expect(listSavedForOwner("owner-b")).resolves.toEqual([
      saved("arrival", 10),
    ]);
  });

  it("refuses a save raised under owner A once owner B is active", async () => {
    mockCurrentUserId = "owner-b";

    await expect(
      addSavedForOwner("owner-a", "movies", {
        id: "arrival",
        title: "Arrival",
        subtitle: "Denis Villeneuve",
        meta: "2016",
      })
    ).rejects.toBeInstanceOf(SavedOwnerChangedError);

    expect(mockUpsertCalls).toHaveLength(0);
    expect(
      await AsyncStorage.getItem(savedStorageKeyForOwner("owner-a"))
    ).toBeNull();
  });

  it("aborts when the account changes midway through a save", async () => {
    mockCurrentUserId = "owner-a";
    const gate = openGate();

    const pending = addSavedForOwner("owner-a", "movies", {
      id: "arrival",
      title: "Arrival",
      subtitle: "Denis Villeneuve",
      meta: "2016",
    });
    const settled = pending.catch((error: unknown) => error);

    // The cloud write is parked; the user signs into a different account.
    mockCurrentUserId = "owner-b";
    gate.release();

    expect(await settled).toBeInstanceOf(SavedOwnerChangedError);
    expect(
      await AsyncStorage.getItem(savedStorageKeyForOwner("owner-b"))
    ).toBeNull();
  });

  // The anonymous bucket is a single shared resource. Two hydrations racing for
  // it must not both upload it, or a signed-out user's saves land in two
  // different accounts.
  it("claims the anonymous bucket for exactly one owner when hydrations overlap", async () => {
    await AsyncStorage.setItem(
      SAVED_ANONYMOUS_STORAGE_KEY,
      JSON.stringify([saved("arrival", 10)])
    );
    mockCurrentUserId = "owner-a";

    const first = listSavedForOwner("owner-a");
    const second = listSavedForOwner("owner-a");
    await Promise.all([first, second]);

    const anonymousUploads = mockUpsertCalls.filter((batch) =>
      batch.some((row) => row.item_id === "arrival")
    );
    expect(anonymousUploads).toHaveLength(1);
    expect(
      await AsyncStorage.getItem(SAVED_ANONYMOUS_STORAGE_KEY)
    ).toBeNull();
  });
});
