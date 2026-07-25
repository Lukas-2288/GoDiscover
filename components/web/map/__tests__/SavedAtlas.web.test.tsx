import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";

import type { MapEdge, MapNode } from "../../../../lib/storage/discoveryMap";

let mockFlowProps: Record<string, any> = {};
const mockSetCenter = jest.fn();

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

  it("selects artwork for detail and moves search matches into focus", () => {
    const onSelect = jest.fn();
    const { getByLabelText } = render(
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
});
