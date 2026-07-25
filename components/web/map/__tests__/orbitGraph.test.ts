import type { MapEdge, MapNode } from "../../../../lib/storage/discoveryMap";

import {
  buildOrbitGraph,
  recommendationNodeId,
  type OrbitRecommendation,
} from "../orbitGraph";

const nodes: MapNode[] = [
  {
    id: "movies:arrival",
    category: "movies",
    itemId: "arrival",
    title: "Arrival",
    subtitle: "Denis Villeneuve",
    meta: "2016",
    savedAt: 1,
    x: 0.1,
    y: 0.1,
  },
  {
    id: "albums:vespertine",
    category: "albums",
    itemId: "vespertine",
    title: "Vespertine",
    subtitle: "Björk",
    meta: "2001",
    savedAt: 2,
    x: 0.2,
    y: 0.2,
  },
  {
    id: "books:le-guin",
    category: "books",
    itemId: "le-guin",
    title: "The Dispossessed",
    subtitle: "Ursula K. Le Guin",
    meta: "1974",
    savedAt: 3,
    x: 0.3,
    y: 0.3,
  },
  {
    id: "artists:bjork",
    category: "artists",
    itemId: "bjork",
    title: "Björk",
    subtitle: "Iceland",
    meta: "Artist",
    savedAt: 4,
    x: 0.9,
    y: 0.9,
  },
];

const edges: MapEdge[] = [
  { id: "arrival-vespertine", source: "movies:arrival", target: "albums:vespertine", createdAt: 1 },
  { id: "vespertine-le-guin", source: "albums:vespertine", target: "books:le-guin", createdAt: 2 },
];

function recommendation(index: number): OrbitRecommendation {
  return {
    category: "movies",
    item: {
      id: `candidate-${index}`,
      title: `Candidate ${index}`,
      subtitle: "A recommendation",
      meta: "2026",
    },
    reason: { label: `Shared thread ${index}` },
  };
}

describe("Discovery Orbit graph", () => {
  it("centers the seed, keeps its direct and second-degree paths present, and fades unrelated saved work", () => {
    const graph = buildOrbitGraph(nodes, edges, "movies:arrival", []);

    expect(graph.nodes.map((node) => ({ id: node.id, faded: node.faded }))).toEqual([
      { id: "movies:arrival", faded: false },
      { id: "albums:vespertine", faded: false },
      { id: "books:le-guin", faded: false },
      { id: "artists:bjork", faded: true },
    ]);
    expect(graph.positions["movies:arrival"]).toEqual({ x: 0.5, y: 0.5 });
    expect(graph.edges.map((edge) => edge.id)).toEqual([
      "arrival-vespertine",
      "vespertine-le-guin",
    ]);
  });

  it("limits transient suggestions to eight and draws non-persistent suggested paths from the active seed", () => {
    const graph = buildOrbitGraph(
      nodes,
      edges,
      "movies:arrival",
      Array.from({ length: 9 }, (_, index) => recommendation(index))
    );

    expect(graph.nodes.filter((node) => node.transient)).toHaveLength(8);
    expect(graph.edges.filter((edge) => edge.transient)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "movies:arrival",
          target: recommendationNodeId(recommendation(0)),
        }),
      ])
    );
    expect(graph.edges.filter((edge) => edge.transient)).toHaveLength(8);
  });

  it("reuses an already saved candidate instead of duplicating it as a transient node", () => {
    const existing = {
      category: "albums" as const,
      item: {
        id: "vespertine",
        title: "Vespertine",
        subtitle: "Björk",
        meta: "2001",
      },
      reason: { label: "Shared atmosphere" },
    };
    const graph = buildOrbitGraph(nodes, edges, "movies:arrival", [existing]);

    expect(graph.nodes.filter((node) => node.id === "albums:vespertine")).toHaveLength(1);
    expect(graph.nodes.find((node) => node.id === "albums:vespertine")?.transient).toBe(false);
    expect(graph.edges).toContainEqual(
      expect.objectContaining({
        source: "movies:arrival",
        target: "albums:vespertine",
        transient: true,
      })
    );
  });

  it("keeps all transient orbit nodes within eight after reseeding a suggestion", () => {
    const graph = buildOrbitGraph(
      nodes,
      edges,
      "books:reseed",
      Array.from({ length: 8 }, (_, index) => recommendation(index)),
      {
        id: "books:reseed",
        category: "books",
        item: { id: "reseed", title: "Reseed", subtitle: "A seed", meta: "2026" },
      }
    );

    expect(graph.nodes.filter((node) => node.transient)).toHaveLength(8);
  });
});
