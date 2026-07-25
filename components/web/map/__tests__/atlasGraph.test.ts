import type { MapEdge, MapNode } from "../../../../lib/storage/discoveryMap";
import {
  buildAtlasFlowEdges,
  buildAtlasFlowNodes,
  filterAtlasSearchMatches,
  findAtlasSearchMatch,
} from "../atlasGraph";

const nodes: MapNode[] = [
  {
    id: "movies:arrival",
    category: "movies",
    itemId: "arrival",
    title: "Arrival",
    subtitle: "Denis Villeneuve",
    meta: "2016 · Science fiction",
    imageUrl: "https://example.com/arrival.jpg",
    savedAt: 3,
    x: 0.1,
    y: 0.1,
  },
  {
    id: "movies:moonlight",
    category: "movies",
    itemId: "moonlight",
    title: "Moonlight",
    subtitle: "Barry Jenkins",
    meta: "2016 · Drama",
    savedAt: 2,
    x: 0.2,
    y: 0.2,
  },
  {
    id: "albums:vespertine",
    category: "albums",
    itemId: "vespertine",
    title: "Vespertine",
    subtitle: "Björk",
    meta: "2001 · Electronic",
    savedAt: 1,
    x: 0.3,
    y: 0.3,
  },
];

const edges: MapEdge[] = [
  {
    id: "arrival-to-vespertine",
    source: "movies:arrival",
    target: "albums:vespertine",
    createdAt: 4,
    reason: "Otherworldly intimacy",
  },
];

describe("Saved Atlas graph presentation", () => {
  it("uses native artwork geometry and typographic fallback details", () => {
    const flowNodes = buildAtlasFlowNodes(nodes, edges, {
      detailMode: "close",
      selectedId: null,
    });

    expect(flowNodes?.map(({ id, width, height, data }) => ({
      id,
      width,
      height,
      shape: data.shape,
      hasArtwork: Boolean(data.imageUrl),
      showTitle: data.showTitle,
      showMeta: data.showMeta,
    }))).toEqual([
      {
        id: "movies:arrival",
        width: 96,
        height: 144,
        shape: "cover",
        hasArtwork: true,
        showTitle: true,
        showMeta: true,
      },
      {
        id: "movies:moonlight",
        width: 96,
        height: 144,
        shape: "cover",
        hasArtwork: false,
        showTitle: true,
        showMeta: true,
      },
      {
        id: "albums:vespertine",
        width: 112,
        height: 112,
        shape: "square",
        hasArtwork: false,
        showTitle: true,
        showMeta: true,
      },
    ]);
  });

  it("reduces a far atlas to one representative and summary per category", () => {
    const flowNodes = buildAtlasFlowNodes(nodes, edges, {
      detailMode: "far",
      selectedId: null,
    });

    expect(flowNodes?.map(({ id, hidden, data }) => ({
      id,
      hidden,
      summary: data.summary,
      showTitle: data.showTitle,
    }))).toEqual([
      {
        id: "movies:arrival",
        hidden: false,
        summary: "2 movies",
        showTitle: false,
      },
      {
        id: "movies:moonlight",
        hidden: true,
        summary: "2 movies",
        showTitle: false,
      },
      {
        id: "albums:vespertine",
        hidden: false,
        summary: "1 album",
        showTitle: false,
      },
    ]);
  });

  it("keeps global paths quiet and labels only paths focused by selection", () => {
    expect(buildAtlasFlowEdges(edges, null)).toEqual([
      expect.objectContaining({
        id: "arrival-to-vespertine",
        label: undefined,
        style: expect.objectContaining({ stroke: "rgba(244, 241, 234, 0.28)" }),
      }),
    ]);
    expect(buildAtlasFlowEdges(edges, "movies:arrival")).toEqual([
      expect.objectContaining({
        id: "arrival-to-vespertine",
        label: "Otherworldly intimacy",
        style: expect.objectContaining({ stroke: "#7C5CFC" }),
      }),
    ]);
  });

  it("finds a saved work by title, creator, or metadata for map focus", () => {
    expect(findAtlasSearchMatch(nodes, "arrival")?.id).toBe("movies:arrival");
    expect(findAtlasSearchMatch(nodes, "bjork")?.id).toBe(
      "albums:vespertine"
    );
    expect(findAtlasSearchMatch(nodes, "science fiction")?.id).toBe(
      "movies:arrival"
    );
    expect(findAtlasSearchMatch(nodes, "not in the atlas")).toBeNull();
  });

  it("uses the same accent-insensitive matching for list filtering", () => {
    expect(filterAtlasSearchMatches(nodes, "bjork").map((node) => node.id)).toEqual([
      "albums:vespertine",
    ]);
  });
});
