import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  loadMapSnapshot,
  recordMapTrailEvent,
} from "../../../../lib/storage/discoveryMap";
import type { SavedItem } from "../../../../lib/storage/saved";
import { buildAtlasFlowEdges } from "../../../../lib/discovery/atlasGraph";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

const arrival: SavedItem = {
  id: "arrival",
  category: "movies",
  title: "Arrival",
  subtitle: "Denis Villeneuve",
  meta: "2016 · Science fiction",
  savedAt: 2,
};

const kindred: SavedItem = {
  id: "kindred",
  category: "books",
  title: "Kindred",
  subtitle: "Octavia E. Butler",
  meta: "1979 · Speculative fiction",
  savedAt: 1,
};

beforeEach(async () => {
  await AsyncStorage.clear();
});

it("carries a recorded trail reason through reload into focused edge presentation", async () => {
  await recordMapTrailEvent(
    {
      source: { category: "movies", id: "arrival" },
      target: { category: "books", id: "kindred" },
      occurredAt: 42,
      reason: "Language across distance",
    },
    [arrival, kindred]
  );

  const reloaded = await loadMapSnapshot([arrival, kindred]);
  expect(reloaded.edges).toEqual([
    {
      id: "movies:arrival->books:kindred",
      source: "movies:arrival",
      target: "books:kindred",
      createdAt: 42,
      reason: "Language across distance",
    },
  ]);
  expect(
    buildAtlasFlowEdges(reloaded.edges, "movies:arrival")[0]
  ).toMatchObject({
    label: "Language across distance",
    style: { stroke: "#7C5CFC" },
  });
});
