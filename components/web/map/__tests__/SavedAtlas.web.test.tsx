import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";

import type { MapEdge, MapNode } from "../../../../lib/storage/discoveryMap";

let mockFlowProps: Record<string, any> = {};
const mockSetCenter = jest.fn();
const mockGetViewport = jest.fn(() => ({ x: 24, y: -18, zoom: 0.86 }));
const mockSetViewport = jest.fn();
jest.mock("../../../../lib/discovery/mapLayout", () => {
  const actual = jest.requireActual("../../../../lib/discovery/mapLayout");
  return { ...actual, createAtlasLayout: jest.fn(actual.createAtlasLayout) };
});

jest.mock("@xyflow/react", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    __esModule: true,
    ReactFlow: (props: Record<string, any>) => {
      mockFlowProps = props;
      return React.createElement(
        View,
        { accessibilityLabel: "Saved Atlas flow" },
        props.children
      );
    },
    Controls: () => React.createElement(View, { accessibilityLabel: "Map controls" }),
    MiniMap: () => React.createElement(View, { accessibilityLabel: "Atlas minimap" }),
    ReactFlowProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    useReactFlow: () => ({
      fitView: jest.fn(),
      setCenter: mockSetCenter,
      getViewport: mockGetViewport,
      setViewport: mockSetViewport,
    }),
  };
});

jest.mock("@xyflow/react/dist/style.css", () => ({}));

import { SavedAtlas } from "../SavedAtlas.web";

const nodes: MapNode[] = [
  {
    id: "movies:arrival",
    category: "movies",
    itemId: "arrival",
    title: "Arrival",
    subtitle: "Denis Villeneuve",
    meta: "2016 · Science fiction",
    savedAt: 1,
    x: 0.2,
    y: 0.3,
  },
];

const edges: MapEdge[] = [];

describe("Saved Atlas React Flow canvas", () => {
  beforeEach(() => {
    mockFlowProps = {};
    mockSetCenter.mockClear();
    mockGetViewport.mockClear();
    mockSetViewport.mockClear();
  });

  it("keeps artwork fixed while preserving pan and zoom navigation", () => {
    render(
      <SavedAtlas
        nodes={nodes}
        edges={edges}
        selectedId={null}
        onSelect={jest.fn()}
        onClearSelection={jest.fn()}
        onStart={jest.fn()}
      />
    );

    expect(mockFlowProps).toEqual(
      expect.objectContaining({
        nodesDraggable: false,
        nodesConnectable: false,
        edgesReconnectable: false,
        panOnDrag: true,
        zoomOnPinch: true,
        zoomOnScroll: true,
        fitView: true,
      })
    );
  });

  it("reuses settled atlas positions when pan or zoom only changes detail mode", () => {
    const createAtlasLayout = (jest.requireMock("../../../../lib/discovery/mapLayout") as {
      createAtlasLayout: jest.Mock;
    }).createAtlasLayout;
    render(
      <SavedAtlas
        nodes={nodes}
        edges={edges}
        selectedId={null}
        onSelect={jest.fn()}
        onClearSelection={jest.fn()}
        onStart={jest.fn()}
      />
    );
    const layoutsAfterInitialRender = createAtlasLayout.mock.calls.length;

    act(() => {
      mockFlowProps.onMoveEnd(null, { x: 100, y: 40, zoom: 2 });
    });

    expect(createAtlasLayout).toHaveBeenCalledTimes(layoutsAfterInitialRender);
  });

  it("selects artwork for detail and moves search matches into focus", () => {
    const onSelect = jest.fn();
    const { getByLabelText, unmount } = render(
      <SavedAtlas
        nodes={nodes}
        edges={edges}
        selectedId={null}
        onSelect={onSelect}
        onClearSelection={jest.fn()}
        onStart={jest.fn()}
      />
    );

    act(() => {
      mockFlowProps.onNodeClick({}, mockFlowProps.nodes[0]);
    });
    expect(onSelect).toHaveBeenCalledWith(nodes[0]);

    fireEvent.changeText(getByLabelText("Search saved atlas"), "arrival");
    expect(onSelect).toHaveBeenLastCalledWith(nodes[0]);
    expect(mockSetCenter).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Number),
      expect.objectContaining({ zoom: 1.7 })
    );
  });

  it("captures the overview viewport before selecting artwork can move the camera", () => {
    const onSelect = jest.fn();
    render(
      <SavedAtlas
        nodes={nodes}
        edges={edges}
        selectedId={null}
        onSelect={onSelect}
        onClearSelection={jest.fn()}
        onStart={jest.fn()}
      />
    );

    act(() => {
      mockFlowProps.onNodeClick({}, mockFlowProps.nodes[0]);
    });

    expect(mockGetViewport).toHaveBeenCalled();
    expect(mockGetViewport.mock.invocationCallOrder[0]).toBeLessThan(
      onSelect.mock.invocationCallOrder[0]
    );
  });

  it("keeps recommendations transient and restores the exact overview viewport when leaving an orbit", async () => {
    const onFindSimilar = jest.fn(async () => [
      {
        category: "books" as const,
        item: {
          id: "story-of-your-life",
          title: "Story of Your Life",
          subtitle: "Ted Chiang",
          meta: "1998",
        },
        reason: { label: "Shared speculative language" },
      },
    ]);
    const { getByLabelText, getByText, queryByText } = render(
      <SavedAtlas
        nodes={nodes}
        edges={edges}
        selectedId={nodes[0].id}
        onSelect={jest.fn()}
        onClearSelection={jest.fn()}
        onStart={jest.fn()}
        onFindSimilar={onFindSimilar}
      />
    );

    expect(mockGetViewport).toHaveBeenCalled();
    fireEvent.press(getByLabelText("Find similar in atlas to Arrival"));
    await act(async () => undefined);
    expect(onFindSimilar).toHaveBeenCalledWith(
      expect.objectContaining({ id: "movies:arrival" })
    );
    expect(getByText("Story of Your Life")).toBeTruthy();

    fireEvent.press(getByLabelText("View whole atlas"));
    expect(mockSetViewport).toHaveBeenCalledWith(
      { x: 24, y: -18, zoom: 0.86 },
      expect.any(Object)
    );
    expect(queryByText("Story of Your Life")).toBeNull();
  });

  it("keeps the orbit visible and offers retry when recommendations fail", async () => {
    const onFindSimilar = jest.fn(async () => {
      throw new Error("offline");
    });
    const { getByLabelText, getByText } = render(
      <SavedAtlas
        nodes={nodes}
        edges={edges}
        selectedId={nodes[0].id}
        onSelect={jest.fn()}
        onClearSelection={jest.fn()}
        onStart={jest.fn()}
        onFindSimilar={onFindSimilar}
      />
    );

    fireEvent.press(getByLabelText("Find similar in atlas to Arrival"));
    await act(async () => undefined);
    expect(getByText("Recommendations are unavailable right now.")).toBeTruthy();
    fireEvent.press(getByLabelText("Retry recommendations"));
    await act(async () => undefined);
    expect(onFindSimilar).toHaveBeenCalledTimes(2);
  });

  it("reseeds from a transient recommendation only after its next orbit loads", async () => {
    const onFindSimilar = jest.fn()
      .mockResolvedValueOnce([{
        category: "books" as const,
        item: { id: "story", title: "Story of Your Life", subtitle: "Ted Chiang", meta: "1998" },
        reason: { label: "Shared speculative language" },
      }])
      .mockResolvedValueOnce([{
        category: "albums" as const,
        item: { id: "music", title: "Music for the Orbit", subtitle: "A composer", meta: "2026" },
        reason: { label: "Shared atmosphere" },
      }]);
    const { getByLabelText } = render(
      <SavedAtlas
        nodes={nodes}
        edges={edges}
        selectedId={nodes[0].id}
        onSelect={jest.fn()}
        onClearSelection={jest.fn()}
        onStart={jest.fn()}
        onFindSimilar={onFindSimilar}
      />
    );

    fireEvent.press(getByLabelText("Find similar in atlas to Arrival"));
    await act(async () => undefined);
    fireEvent.press(getByLabelText("Reseed from Story of Your Life"));
    await act(async () => undefined);

    expect(onFindSimilar).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "books:story" })
    );
    expect(getByLabelText("Find similar in atlas to Story of Your Life")).toBeTruthy();
  });

  it("discards a pending recommendation response when selection moves to another saved seed", async () => {
    let resolveRecommendations!: (value: any[]) => void;
    const pendingRecommendations = new Promise<any[]>((resolve) => {
      resolveRecommendations = resolve;
    });
    const orbitNodes: MapNode[] = [
      ...nodes,
      { ...nodes[0], id: "movies:moonlight", itemId: "moonlight", title: "Moonlight" },
    ];
    const onFindSimilar = jest.fn(() => pendingRecommendations);
    const view = render(
      <SavedAtlas
        nodes={orbitNodes}
        edges={edges}
        selectedId="movies:arrival"
        onSelect={jest.fn()}
        onClearSelection={jest.fn()}
        onStart={jest.fn()}
        onFindSimilar={onFindSimilar}
      />
    );

    fireEvent.press(view.getByLabelText("Find similar in atlas to Arrival"));
    view.rerender(
      <SavedAtlas
        nodes={orbitNodes}
        edges={edges}
        selectedId="movies:moonlight"
        onSelect={jest.fn()}
        onClearSelection={jest.fn()}
        onStart={jest.fn()}
        onFindSimilar={onFindSimilar}
      />
    );
    await act(async () => { resolveRecommendations([{
      category: "books",
      item: { id: "wrong-seed", title: "Wrong seed", subtitle: "", meta: "" },
      reason: { label: "Stale" },
    }]); });

    expect(view.getByLabelText("Find similar in atlas to Moonlight")).toBeTruthy();
    expect(view.queryByText("Wrong seed")).toBeNull();
  });

  it("invalidates a pending orbit request when an owner or map reset clears selection", async () => {
    let resolveRecommendations!: (value: any[]) => void;
    const pendingRecommendations = new Promise<any[]>((resolve) => {
      resolveRecommendations = resolve;
    });
    const onFindSimilar = jest.fn(() => pendingRecommendations);
    const view = render(
      <SavedAtlas
        nodes={nodes}
        edges={edges}
        selectedId="movies:arrival"
        onSelect={jest.fn()}
        onClearSelection={jest.fn()}
        onStart={jest.fn()}
        onFindSimilar={onFindSimilar}
      />
    );

    fireEvent.press(view.getByLabelText("Find similar in atlas to Arrival"));
    view.rerender(
      <SavedAtlas
        nodes={[]}
        edges={[]}
        selectedId={null}
        onSelect={jest.fn()}
        onClearSelection={jest.fn()}
        onStart={jest.fn()}
        onFindSimilar={onFindSimilar}
      />
    );
    await act(async () => { resolveRecommendations([{
      category: "books",
      item: { id: "stale-reset", title: "Stale reset", subtitle: "", meta: "" },
      reason: { label: "Stale" },
    }]); });

    expect(view.queryByText("Stale reset")).toBeNull();
  });

  it("provides an explicit back action alongside keyboard escape and atlas restoration", () => {
    const onClearSelection = jest.fn();
    const { getByLabelText, unmount } = render(
      <SavedAtlas
        nodes={nodes}
        edges={edges}
        selectedId={nodes[0].id}
        onSelect={jest.fn()}
        onClearSelection={onClearSelection}
        onStart={jest.fn()}
      />
    );

    fireEvent.press(getByLabelText("Back to atlas"));
    expect(onClearSelection).toHaveBeenCalledTimes(1);
    unmount();
    const escaped = render(
      <SavedAtlas
        nodes={nodes}
        edges={edges}
        selectedId={nodes[0].id}
        onSelect={jest.fn()}
        onClearSelection={onClearSelection}
        onStart={jest.fn()}
      />
    );
    fireEvent(escaped.getByLabelText("Atlas spatial navigation"), "keyDown", { key: "Escape", preventDefault: jest.fn() });
    expect(onClearSelection).toHaveBeenCalledTimes(2);
    expect(mockSetViewport).toHaveBeenCalledWith(
      { x: 24, y: -18, zoom: 0.86 },
      expect.any(Object)
    );
  });

  it("uses the current layout modes to keep desktop rails persistent and leaves mobile detail to its modal sheet", () => {
    const desktop = render(
      <SavedAtlas
        nodes={nodes}
        edges={edges}
        selectedId={nodes[0].id}
        layout="desktop"
        onSelect={jest.fn()}
        onClearSelection={jest.fn()}
        onStart={jest.fn()}
      />
    );
    expect(desktop.getByLabelText("Discovery Orbit").props.accessibilityViewIsModal).toBeFalsy();

    const mobile = render(
      <SavedAtlas
        nodes={nodes}
        edges={edges}
        selectedId={nodes[0].id}
        layout="mobile"
        onSelect={jest.fn()}
        onClearSelection={jest.fn()}
        onStart={jest.fn()}
      />
    );
    expect(mobile.queryByLabelText("Discovery Orbit")).toBeNull();

    const portrait = render(
      <SavedAtlas
        nodes={nodes}
        edges={edges}
        selectedId={nodes[0].id}
        layout="tabletPortrait"
        onSelect={jest.fn()}
        onClearSelection={jest.fn()}
        onStart={jest.fn()}
      />
    );
    expect(portrait.queryByLabelText("Discovery Orbit")).toBeNull();
  });

  it("keeps only the selected context in the graph tab order and supports keyboard focus alternatives", () => {
    const orbitNodes: MapNode[] = [
      ...nodes,
      { ...nodes[0], id: "movies:moonlight", itemId: "moonlight", title: "Moonlight", x: 0.4, y: 0.3 },
    ];
    const onSelect = jest.fn();
    const { getByLabelText } = render(
      <SavedAtlas
        nodes={orbitNodes}
        edges={edges}
        selectedId={nodes[0].id}
        layout="tabletLandscape"
        onSelect={onSelect}
        onClearSelection={jest.fn()}
        onStart={jest.fn()}
      />
    );

    expect(mockFlowProps.nodesFocusable).toBe(false);
    expect(mockFlowProps.nodes.map((node: any) => ({ id: node.id, focusable: node.focusable }))).toEqual([
      { id: "movies:arrival", focusable: true },
      { id: "movies:moonlight", focusable: false },
    ]);

    fireEvent(getByLabelText("Atlas spatial navigation"), "keyDown", { key: "Enter", preventDefault: jest.fn() });
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ id: orbitNodes[0].id }));
  });

  it("announces an initial visible artwork, roves to a directional neighbor, and opens that exact artwork", () => {
    const spatialNodes: MapNode[] = [
      ...nodes,
      { ...nodes[0], id: "movies:moonlight", itemId: "moonlight", title: "Moonlight" },
    ];
    const onSelect = jest.fn();
    const { getByLabelText } = render(
      <SavedAtlas
        nodes={spatialNodes}
        edges={edges}
        selectedId={null}
        onSelect={onSelect}
        onClearSelection={jest.fn()}
        onStart={jest.fn()}
      />
    );

    const navigation = getByLabelText("Atlas spatial navigation");
    const initialNode = mockFlowProps.nodes.find((node: any) => node.data.active);
    const nextNode = mockFlowProps.nodes.find((node: any) => node.id !== initialNode.id);
    const key = nextNode.position.x >= initialNode.position.x ? "ArrowRight" : "ArrowLeft";

    expect(navigation.props["aria-activedescendant"]).toBe(`atlas-active-${initialNode.id}`);
    fireEvent(navigation, "keyDown", { key, preventDefault: jest.fn() });
    expect(mockFlowProps.nodes.find((node: any) => node.id === nextNode.id).data.active).toBe(true);
    expect(navigation.props["aria-activedescendant"]).toBe(`atlas-active-${nextNode.id}`);

    fireEvent(navigation, "keyDown", { key: "Enter", preventDefault: jest.fn() });
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ id: nextNode.id }));
  });

  it("keeps list selection equivalent to map selection for the portrait drawer owner", () => {
    const onSelect = jest.fn();
    const { getByLabelText, getByRole } = render(
      <SavedAtlas
        nodes={nodes}
        edges={edges}
        selectedId={null}
        layout="tabletPortrait"
        onSelect={onSelect}
        onClearSelection={jest.fn()}
        onStart={jest.fn()}
      />
    );

    fireEvent.press(getByRole("tab", { name: "List" }));
    fireEvent.press(getByLabelText("Open Arrival"));
    expect(onSelect).toHaveBeenCalledWith(nodes[0]);
  });

  it("preserves the atlas while giving failed discovery a retryable connectivity explanation", async () => {
    const onFindSimilar = jest.fn(async () => {
      throw new Error("offline");
    });
    const { getByLabelText, getByText } = render(
      <SavedAtlas
        nodes={nodes}
        edges={edges}
        selectedId={nodes[0].id}
        onSelect={jest.fn()}
        onClearSelection={jest.fn()}
        onStart={jest.fn()}
        onFindSimilar={onFindSimilar}
      />
    );

    fireEvent.press(getByLabelText("Find similar in atlas to Arrival"));
    await act(async () => undefined);
    expect(getByText("Discovery is offline. Your saved atlas and trails are still available.")).toBeTruthy();
    expect(getByLabelText("Retry recommendations")).toBeTruthy();
  });

  it("projects responsive drawer recommendations into the same mobile atlas orbit", () => {
    render(
      <SavedAtlas
        nodes={nodes}
        edges={edges}
        selectedId={nodes[0].id}
        layout="mobile"
        onSelect={jest.fn()}
        onClearSelection={jest.fn()}
        onStart={jest.fn()}
        {...({
          responsiveRecommendations: [{
            category: "books",
            item: { id: "story", title: "Story of Your Life", subtitle: "Ted Chiang", meta: "1998" },
            reason: { label: "Shared speculative language" },
          }],
        } as any)}
      />
    );

    expect(mockFlowProps.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "books:story",
        data: expect.objectContaining({ transient: true }),
      }),
    ]));
  });

  it("focuses a responsive preview and then a controlled transient reseed without persistence", async () => {
    const responsiveRecommendation = {
      category: "books" as const,
      item: { id: "story", title: "Story of Your Life", subtitle: "Ted Chiang", meta: "1998" },
      reason: { label: "Shared speculative language" },
    };
    const view = render(
      <SavedAtlas
        nodes={nodes}
        edges={edges}
        selectedId={nodes[0].id}
        layout="mobile"
        onSelect={jest.fn()}
        onClearSelection={jest.fn()}
        onStart={jest.fn()}
        responsiveRecommendations={[responsiveRecommendation]}
        responsivePreviewId="books:story"
      />
    );
    await act(async () => undefined);

    expect(mockFlowProps.nodes.find((node: any) => node.id === "books:story").data.active).toBe(true);
    expect(mockSetCenter).toHaveBeenCalled();

    view.rerender(
      <SavedAtlas
        nodes={nodes}
        edges={edges}
        selectedId={nodes[0].id}
        layout="mobile"
        onSelect={jest.fn()}
        onClearSelection={jest.fn()}
        onStart={jest.fn()}
        responsiveOrbitSeed={{
          id: "books:story",
          category: "books",
          item: responsiveRecommendation.item,
        }}
        responsivePreviewId="books:story"
        responsiveRecommendations={[{
          category: "albums",
          item: { id: "music", title: "Music for the Orbit", subtitle: "A composer", meta: "2026" },
          reason: { label: "Shared atmosphere" },
        }]}
      />
    );
    await act(async () => undefined);

    expect(mockFlowProps.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "books:story", data: expect.objectContaining({ transient: true, active: true }) }),
      expect.objectContaining({ id: "albums:music", data: expect.objectContaining({ transient: true }) }),
    ]));
  });

  it("uses immediate camera feedback and disables animated paths when reduced motion is requested", () => {
    render(
      <SavedAtlas
        nodes={nodes}
        edges={[{ id: "trail", source: nodes[0].id, target: nodes[0].id, createdAt: 1, reason: "same" }]}
        selectedId={nodes[0].id}
        reducedMotion
        onSelect={jest.fn()}
        onClearSelection={jest.fn()}
        onStart={jest.fn()}
      />
    );

    expect(mockSetCenter).toHaveBeenCalledWith(800, 500, { duration: 0, zoom: 1.15 });
    expect(mockFlowProps.edges[0].animated).toBe(false);
  });
});
