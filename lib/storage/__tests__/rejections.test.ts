import AsyncStorage from "@react-native-async-storage/async-storage";

import type { ContentCategory, ResultItem } from "../../../types/content";
import { SavedOwnerChangedError } from "../saved";
import {
  DAMP_THRESHOLD,
  DAMP_WINDOW_MS,
  MAX_DAMPED_TRAITS,
  dampedTraitsFor,
  listRejections,
  recordRejection,
  rejectedIdsFor,
  rejectionsStorageKey,
  removeRejection,
  withoutRejected,
  type Rejection,
} from "../rejections";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

let mockCurrentUserId: string | null = null;

jest.mock("../../supabase", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({
        data: {
          session: mockCurrentUserId ? { user: { id: mockCurrentUserId } } : null,
        },
      })),
    },
  },
}));

function movie(id: string, traits: string[] = []): ResultItem {
  return { id, title: id, subtitle: "", meta: "", traits };
}

function rejection(
  id: string,
  traits: string[],
  rejectedAt: number,
  category: ContentCategory = "movies"
): Rejection {
  return { category, id, traits, rejectedAt };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  mockCurrentUserId = null;
});

describe("damping rules", () => {
  const now = 1_000_000_000;

  it("damps a trait only once it crosses the threshold", () => {
    const below = Array.from({ length: DAMP_THRESHOLD - 1 }, (_, index) =>
      rejection(`m${index}`, ["Action"], now)
    );
    expect(dampedTraitsFor(below, "movies", now)).toEqual([]);

    const atThreshold = [...below, rejection("mX", ["Action"], now)];
    expect(dampedTraitsFor(atThreshold, "movies", now)).toEqual(["Action"]);
  });

  it("ignores rejections older than the window", () => {
    const stale = Array.from({ length: DAMP_THRESHOLD }, (_, index) =>
      rejection(`m${index}`, ["Action"], now - DAMP_WINDOW_MS - 1)
    );
    expect(dampedTraitsFor(stale, "movies", now)).toEqual([]);
  });

  it("does not let one category's rejections damp another", () => {
    const books = Array.from({ length: DAMP_THRESHOLD }, (_, index) =>
      rejection(`b${index}`, ["Fantasy"], now, "books")
    );
    expect(dampedTraitsFor(books, "movies", now)).toEqual([]);
    expect(dampedTraitsFor(books, "books", now)).toEqual(["Fantasy"]);
  });

  // Damping everything would leave a category unable to fill a deck at all.
  it("caps how many traits can be damped at once, keeping the strongest", () => {
    const many: Rejection[] = [];
    const traits = ["Action", "Comedy", "Drama", "Horror", "Western"];
    traits.forEach((trait, traitIndex) => {
      // Earlier traits are rejected more often, so they should win the cap.
      const count = DAMP_THRESHOLD + (traits.length - traitIndex);
      for (let index = 0; index < count; index += 1) {
        many.push(rejection(`${trait}-${index}`, [trait], now));
      }
    });
    const damped = dampedTraitsFor(many, "movies", now);
    expect(damped).toHaveLength(MAX_DAMPED_TRAITS);
    expect(damped).toEqual(traits.slice(0, MAX_DAMPED_TRAITS));
  });

  it("collects rejected ids per category and filters a batch", () => {
    const rejections = [
      rejection("hulk", ["Action"], now),
      rejection("dune", ["Sci-Fi"], now, "books"),
    ];
    const ids = rejectedIdsFor(rejections, "movies");
    expect([...ids]).toEqual(["hulk"]);
    expect(
      withoutRejected([movie("hulk"), movie("arrival")], ids).map((m) => m.id)
    ).toEqual(["arrival"]);
  });
});

describe("rejection storage", () => {
  it("persists a rejection with the item's traits under the active owner", async () => {
    mockCurrentUserId = "owner-a";

    await recordRejection("owner-a", "movies", movie("hulk", ["Action"]), 5);

    await expect(listRejections("owner-a")).resolves.toEqual([
      { category: "movies", id: "hulk", traits: ["Action"], rejectedAt: 5 },
    ]);
    // Owner partitioning: signed-out storage is a different bucket entirely.
    await expect(listRejections(null)).resolves.toEqual([]);
    expect(
      await AsyncStorage.getItem(rejectionsStorageKey("owner-a"))
    ).not.toBeNull();
  });

  it("keeps signed-out rejections in the anonymous bucket", async () => {
    mockCurrentUserId = null;
    await recordRejection(null, "books", movie("dune", ["Sci-Fi"]), 5);
    await expect(listRejections(null)).resolves.toHaveLength(1);
  });

  it("records one rejection per item even when repeated", async () => {
    mockCurrentUserId = "owner-a";
    await recordRejection("owner-a", "movies", movie("hulk", ["Action"]), 5);
    await recordRejection("owner-a", "movies", movie("hulk", ["Action"]), 9);

    const stored = await listRejections("owner-a");
    expect(stored).toHaveLength(1);
    expect(stored[0].rejectedAt).toBe(9);
  });

  // Undo has to clear the rejection, or the card returns while the exclusion
  // silently keeps steering later results.
  it("removes a rejection so an undone skip stops damping", async () => {
    mockCurrentUserId = "owner-a";
    await recordRejection("owner-a", "movies", movie("hulk", ["Action"]), 5);

    await removeRejection("owner-a", "movies", "hulk");

    await expect(listRejections("owner-a")).resolves.toEqual([]);
  });

  it("refuses to record against a different account than the caller bound", async () => {
    mockCurrentUserId = "owner-b";

    await expect(
      recordRejection("owner-a", "movies", movie("hulk", ["Action"]), 5)
    ).rejects.toBeInstanceOf(SavedOwnerChangedError);

    await expect(listRejections("owner-a")).resolves.toEqual([]);
    await expect(listRejections("owner-b")).resolves.toEqual([]);
  });
});
