import AsyncStorage from "@react-native-async-storage/async-storage";

import type { SavedItem } from "../saved";
import {
  DISCOVERY_MAP_STORAGE_KEY,
  loadMapSnapshot,
  recordMapTrailEvent,
} from "../discoveryMap";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

const arrival: SavedItem = {
  id: "arrival",
  category: "movies",
  title: "Arrival",
  subtitle: "2016",
  meta: "Science fiction",
  imageUrl: "https://example.com/arrival.jpg",
  savedAt: 20,
};

const kindred: SavedItem = {
  id: "kindred",
  category: "books",
  title: "Kindred",
  subtitle: "Octavia E. Butler",
  meta: "1979",
  savedAt: 10,
};

const moonlight: SavedItem = {
  id: "moonlight",
  category: "movies",
  title: "Moonlight",
  subtitle: "2016",
  meta: "Drama",
  savedAt: 5,
};

beforeEach(async () => {
  await AsyncStorage.clear();
});

it("returns an empty versioned snapshot when there are no saved discoveries", async () => {
  await expect(loadMapSnapshot([])).resolves.toEqual({
    version: 1,
    nodes: [],
    edges: [],
  });
});

it("derives one constellation node from each saved discovery", async () => {
  const snapshot = await loadMapSnapshot([arrival, kindred]);

  expect(snapshot.nodes).toEqual([
    {
      id: "movies:arrival",
      category: "movies",
      itemId: "arrival",
      title: "Arrival",
      subtitle: "2016",
      meta: "Science fiction",
      imageUrl: "https://example.com/arrival.jpg",
      savedAt: 20,
      x: expect.any(Number),
      y: expect.any(Number),
    },
    {
      id: "books:kindred",
      category: "books",
      itemId: "kindred",
      title: "Kindred",
      subtitle: "Octavia E. Butler",
      meta: "1979",
      savedAt: 10,
      x: expect.any(Number),
      y: expect.any(Number),
    },
  ]);

  for (const node of snapshot.nodes) {
    expect(node.x).toBeGreaterThanOrEqual(0);
    expect(node.x).toBeLessThanOrEqual(1);
    expect(node.y).toBeGreaterThanOrEqual(0);
    expect(node.y).toBeLessThanOrEqual(1);
  }
});

it("keeps node positions stable when save order and metadata change", async () => {
  const first = await loadMapSnapshot([arrival, kindred]);
  const second = await loadMapSnapshot([
    { ...kindred, title: "Kindred (updated)", savedAt: 99 },
    { ...arrival, subtitle: "Arrival (2016)", savedAt: 1 },
  ]);

  const firstPositions = Object.fromEntries(
    first.nodes.map(({ id, x, y }) => [id, { x, y }])
  );
  const secondPositions = Object.fromEntries(
    second.nodes.map(({ id, x, y }) => [id, { x, y }])
  );

  expect(secondPositions).toEqual(firstPositions);
});

it("records an on-demand exploration edge in versioned storage", async () => {
  const snapshot = await recordMapTrailEvent(
    {
      source: { category: "movies", id: "arrival" },
      target: { category: "books", id: "kindred" },
      occurredAt: 42,
    },
    [arrival, kindred]
  );
  const expectedEdge = {
    id: "movies:arrival->books:kindred",
    source: "movies:arrival",
    target: "books:kindred",
    createdAt: 42,
  };

  expect(snapshot.edges).toEqual([expectedEdge]);
  await expect(
    AsyncStorage.getItem(DISCOVERY_MAP_STORAGE_KEY).then((raw) =>
      raw ? JSON.parse(raw) : null
    )
  ).resolves.toEqual({
    version: 1,
    edges: [expectedEdge],
  });
});

it("keeps earlier exploration edges when a new trail event is recorded", async () => {
  await recordMapTrailEvent(
    {
      source: { category: "movies", id: "arrival" },
      target: { category: "books", id: "kindred" },
      occurredAt: 42,
    },
    [arrival, kindred, moonlight]
  );

  const snapshot = await recordMapTrailEvent(
    {
      source: { category: "books", id: "kindred" },
      target: { category: "movies", id: "moonlight" },
      occurredAt: 84,
    },
    [arrival, kindred, moonlight]
  );

  expect(snapshot.edges.map((edge) => edge.id)).toEqual([
    "movies:arrival->books:kindred",
    "books:kindred->movies:moonlight",
  ]);
});

it("prunes persisted edges when either saved discovery disappears", async () => {
  await recordMapTrailEvent(
    {
      source: { category: "movies", id: "arrival" },
      target: { category: "books", id: "kindred" },
      occurredAt: 42,
    },
    [arrival, kindred]
  );

  const snapshot = await loadMapSnapshot([arrival]);

  expect(snapshot.edges).toEqual([]);
  await expect(
    AsyncStorage.getItem(DISCOVERY_MAP_STORAGE_KEY).then((raw) =>
      raw ? JSON.parse(raw) : null
    )
  ).resolves.toEqual({
    version: 1,
    edges: [],
  });
});

it("falls back to a clean versioned edge store when persistence is malformed", async () => {
  await AsyncStorage.setItem(DISCOVERY_MAP_STORAGE_KEY, "{not-json");

  const snapshot = await loadMapSnapshot([arrival]);

  expect(snapshot.nodes.map((node) => node.id)).toEqual(["movies:arrival"]);
  expect(snapshot.edges).toEqual([]);
  await expect(
    AsyncStorage.getItem(DISCOVERY_MAP_STORAGE_KEY).then((raw) =>
      raw ? JSON.parse(raw) : null
    )
  ).resolves.toEqual({
    version: 1,
    edges: [],
  });
});
