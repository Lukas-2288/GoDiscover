function loadMapLayout(): Record<string, unknown> {
  try {
    return require("../mapLayout") as Record<string, unknown>;
  } catch {
    return {};
  }
}

it("builds the same graph signature regardless of input order", () => {
  const buildGraphSignature = loadMapLayout().buildGraphSignature as
    | ((nodes: unknown[], edges: unknown[]) => string)
    | undefined;
  const nodes = [
    { id: "movies:arrival", category: "movies" },
    { id: "books:kindred", category: "books" },
  ];
  const edges = [
    {
      id: "movies:arrival->books:kindred",
      source: "movies:arrival",
      target: "books:kindred",
    },
  ];

  expect(buildGraphSignature?.(nodes, edges)).toBe(
    "atlas:v1:nodes=books:kindred,movies:arrival;edges=movies:arrival->books:kindred"
  );
  expect(buildGraphSignature?.([...nodes].reverse(), [...edges].reverse())).toBe(
    "atlas:v1:nodes=books:kindred,movies:arrival;edges=movies:arrival->books:kindred"
  );
});

it("creates a unit-space atlas position for every saved node", () => {
  const createAtlasLayout = loadMapLayout().createAtlasLayout as
    | ((nodes: unknown[], edges: unknown[], options: unknown) => unknown)
    | undefined;

  expect(
    createAtlasLayout?.(
      [
        { id: "movies:arrival", category: "movies" },
        { id: "books:kindred", category: "books" },
      ],
      [],
      { seed: "saved-atlas" }
    )
  ).toEqual({
    "movies:arrival": { x: expect.any(Number), y: expect.any(Number) },
    "books:kindred": { x: expect.any(Number), y: expect.any(Number) },
  });
});

it("pulls related discoveries closer than an unrelated cross-category discovery", () => {
  const createAtlasLayout = loadMapLayout().createAtlasLayout as (
    nodes: unknown[],
    edges: unknown[],
    options: unknown
  ) => Record<string, { x: number; y: number }>;
  const positions = createAtlasLayout(
    [
      { id: "movies:arrival", category: "movies" },
      { id: "movies:moonlight", category: "movies" },
      { id: "books:kindred", category: "books" },
    ],
    [
      {
        source: "movies:arrival",
        target: "books:kindred",
      },
    ],
    { seed: "relationship-attraction" }
  );
  const distance = (left: { x: number; y: number }, right: { x: number; y: number }) =>
    Math.hypot(left.x - right.x, left.y - right.y);

  expect(
    distance(positions["movies:arrival"], positions["books:kindred"])
  ).toBeLessThan(
    distance(positions["movies:moonlight"], positions["books:kindred"])
  );
});

it("separates colliding nodes without leaving the atlas bounds", () => {
  const createAtlasLayout = loadMapLayout().createAtlasLayout as (
    nodes: unknown[],
    edges: unknown[],
    options: unknown
  ) => Record<string, { x: number; y: number }>;
  const positions = createAtlasLayout(
    [
      { id: "movies:close-a", category: "movies" },
      { id: "movies:close-b", category: "movies" },
    ],
    [],
    { seed: "collision" }
  );
  const first = positions["movies:close-a"];
  const second = positions["movies:close-b"];

  expect(Math.hypot(first.x - second.x, first.y - second.y)).toBeGreaterThanOrEqual(
    0.06
  );
  for (const position of Object.values(positions)) {
    expect(position.x).toBeGreaterThanOrEqual(0);
    expect(position.x).toBeLessThanOrEqual(1);
    expect(position.y).toBeGreaterThanOrEqual(0);
    expect(position.y).toBeLessThanOrEqual(1);
  }
});

it("centers the selected discovery in an orbit projection", () => {
  const projectOrbit = loadMapLayout().projectOrbit as
    | ((
        seedId: string,
        nodes: unknown[],
        edges: unknown[],
        atlasPositions: unknown
      ) => unknown)
    | undefined;

  expect(
    projectOrbit?.(
      "movies:arrival",
      [{ id: "movies:arrival", category: "movies" }],
      [],
      { "movies:arrival": { x: 0.72, y: 0.72 } }
    )
  ).toEqual({ positions: { "movies:arrival": { x: 0.5, y: 0.5 } } });
});

it("places direct and second-degree discoveries on progressively wider orbit rings", () => {
  const projectOrbit = loadMapLayout().projectOrbit as (
    seedId: string,
    nodes: unknown[],
    edges: unknown[],
    atlasPositions: Record<string, { x: number; y: number }>
  ) => { positions: Record<string, { x: number; y: number }> };
  const orbit = projectOrbit(
    "movies:arrival",
    [
      { id: "movies:arrival", category: "movies" },
      { id: "books:kindred", category: "books" },
      { id: "albums:blue", category: "albums" },
    ],
    [
      { source: "movies:arrival", target: "books:kindred" },
      { source: "books:kindred", target: "albums:blue" },
    ],
    {
      "movies:arrival": { x: 0.7, y: 0.7 },
      "books:kindred": { x: 0.2, y: 0.2 },
      "albums:blue": { x: 0.3, y: 0.3 },
    }
  );
  const distanceFromCenter = (position: { x: number; y: number }) =>
    Math.hypot(position.x - 0.5, position.y - 0.5);

  expect(distanceFromCenter(orbit.positions["books:kindred"])).toBeLessThan(0.3);
  expect(distanceFromCenter(orbit.positions["albums:blue"])).toBeGreaterThan(0.3);
});

it("uses far detail with a deterministic representative for each category", () => {
  const resolveZoomDetail = loadMapLayout().resolveZoomDetail as
    | ((zoom: number, nodes: unknown[]) => unknown)
    | undefined;

  expect(
    resolveZoomDetail?.(0.5, [
      { id: "movies:moonlight", category: "movies" },
      { id: "books:kindred", category: "books" },
      { id: "movies:arrival", category: "movies" },
    ])
  ).toEqual({
    mode: "far",
    representativeNodeIds: ["books:kindred", "movies:arrival"],
  });
});

it("uses medium detail at an ordinary map zoom", () => {
  const resolveZoomDetail = loadMapLayout().resolveZoomDetail as (
    zoom: number,
    nodes: unknown[]
  ) => unknown;

  expect(resolveZoomDetail(1, [])).toEqual({
    mode: "medium",
    representativeNodeIds: [],
  });
});

it("uses close detail at a high map zoom", () => {
  const resolveZoomDetail = loadMapLayout().resolveZoomDetail as (
    zoom: number,
    nodes: unknown[]
  ) => unknown;

  expect(resolveZoomDetail(2, [])).toEqual({
    mode: "close",
    representativeNodeIds: [],
  });
});

it("settles a 200-node, 400-edge atlas deterministically", () => {
  const createAtlasLayout = loadMapLayout().createAtlasLayout as (
    nodes: unknown[],
    edges: unknown[],
    options: unknown
  ) => Record<string, { x: number; y: number }>;
  const categories = ["movies", "books", "albums", "artists"];
  const nodes = Array.from({ length: 200 }, (_, index) => ({
    id: `${categories[index % categories.length]}:item-${index}`,
    category: categories[index % categories.length],
  }));
  const edges = nodes.flatMap((node, index) => [
    { source: node.id, target: nodes[(index * 37 + 11) % nodes.length].id },
    { source: node.id, target: nodes[(index * 53 + 17) % nodes.length].id },
  ]);

  const startedAt = performance.now();
  const first = createAtlasLayout(nodes, edges, { seed: "release-200-400" });
  const elapsedMilliseconds = performance.now() - startedAt;
  const second = createAtlasLayout([...nodes].reverse(), [...edges].reverse(), {
    seed: "release-200-400",
  });

  expect(Object.keys(first)).toHaveLength(200);
  expect(new Set(edges.map((edge) => `${edge.source}->${edge.target}`)).size).toBe(400);
  expect(second).toEqual(first);
  expect(second).toBe(first);

  const dimensions: Record<string, { width: number; height: number }> = {
    movies: { width: 96, height: 144 },
    books: { width: 96, height: 144 },
    albums: { width: 112, height: 112 },
    artists: { width: 108, height: 108 },
  };
  const boxes = nodes.map((node) => {
    const size = dimensions[node.category];
    const position = first[node.id];
    return {
      id: node.id,
      left: position.x * 1_600,
      right: position.x * 1_600 + size.width,
      top: position.y * 1_000,
      bottom: position.y * 1_000 + size.height,
      centerX: position.x * 1_600 + size.width / 2,
      centerY: position.y * 1_000 + size.height / 2,
    };
  });
  let overlaps = 0;
  for (let left = 0; left < boxes.length; left += 1) {
    for (let right = left + 1; right < boxes.length; right += 1) {
      const a = boxes[left];
      const b = boxes[right];
      if (
        a.left < b.right &&
        a.right > b.left &&
        a.top < b.bottom &&
        a.bottom > b.top
      ) {
        overlaps += 1;
      }
    }
  }
  expect(overlaps).toBeLessThanOrEqual(4);
  for (const index of [0, 19, 57, 101, 149, 199]) {
    const target = boxes[index];
    const nearestOtherCenter = Math.min(
      ...boxes
        .filter((box) => box.id !== target.id)
        .map((box) =>
          Math.hypot(
            box.centerX - target.centerX,
            box.centerY - target.centerY
          )
        )
    );
    expect(nearestOtherCenter).toBeGreaterThan(44);
  }
  expect(elapsedMilliseconds).toBeLessThan(750);
});

it("keeps a small cross-category atlas inside mobile fit-view hit bounds", () => {
  const createAtlasLayout = loadMapLayout().createAtlasLayout as (
    nodes: unknown[],
    edges: unknown[]
  ) => Record<string, { x: number; y: number }>;
  const nodes = [
    { id: "movies:arrival", category: "movies" },
    { id: "books:kindred", category: "books" },
    { id: "albums:vespertine", category: "albums" },
  ];
  const positions = createAtlasLayout(nodes, [
    { source: "movies:arrival", target: "books:kindred" },
  ]);

  expect(positions["movies:arrival"].x).toBeGreaterThan(0.15);
  expect(positions["movies:arrival"].x).toBeLessThan(0.78);
  expect(positions["books:kindred"].x).toBeGreaterThan(0.15);
  expect(positions["books:kindred"].x).toBeLessThan(0.78);
  expect(positions["albums:vespertine"].x).toBeGreaterThan(0.15);
  expect(positions["albums:vespertine"].x).toBeLessThan(0.82);
});
