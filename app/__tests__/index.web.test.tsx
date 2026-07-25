import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";

import type { MapSnapshot } from "../../lib/storage/discoveryMap";
import type { SavedItem } from "../../lib/storage/saved";

let authStateChangeHandler:
  | ((event: string, session: unknown) => void)
  | null = null;
const mockDiscoveryCommit = jest.fn(async () => undefined);
let mockLayout: "mobile" | "tabletPortrait" | "tabletLandscape" | "desktop" = "desktop";
let mockReducedMotion = false;
let mockSavedAtlasProps: Record<string, unknown> = {};

jest.mock("../../components/web/WebHomeScreen", () => {
  const React = require("react");
  const { Pressable, Text: MockText, View } = require("react-native");
  const Empty = () => React.createElement(View);

  return {
    ArchiveAtlas: Empty,
    WebDetailPanel: ({
      item,
      onSave,
      onToggleExpanded,
      onFindSimilarInAtlas,
      presentation = "rail",
      expanded = true,
      similarLabel,
    }: {
      item?: { title: string; meta: string } | null;
      onSave(): void;
      onToggleExpanded?(): void;
      onFindSimilarInAtlas?(): void;
      presentation?: "drawer" | "rail" | "sheet";
      expanded?: boolean;
      similarLabel?: string;
    }) => React.createElement(
      View,
      { accessibilityLabel: `${presentation} detail` },
      item ? React.createElement(MockText, null, item.title) : null,
      React.createElement(Pressable, { onPress: onSave, testID: "detail-toggle" }),
      onFindSimilarInAtlas ? React.createElement(Pressable, { onPress: onFindSimilarInAtlas, testID: "atlas-find-similar" }) : null,
      onToggleExpanded ? React.createElement(Pressable, { onPress: onToggleExpanded, testID: "drawer-expand" }) : null,
      expanded ? React.createElement(MockText, { testID: "drawer-expanded" }, similarLabel ?? "Find similar") : null
    ),
    WebDiscoveryStage: ({
      onSave,
      onSimilar,
    }: {
      onSave(): void;
      onSimilar(): void;
    }) =>
      React.createElement(
        View,
        null,
        React.createElement(Pressable, {
          onPress: onSimilar,
          testID: "start-similar",
        }),
        React.createElement(Pressable, {
          onPress: onSave,
          testID: "save-discovery",
        })
      ),
    WebShell: ({
      children,
      onSectionChange,
    }: {
      children: React.ReactNode;
      onSectionChange(section: string): void;
    }) =>
      React.createElement(
        View,
        null,
        React.createElement(Pressable, {
          onPress: () => onSectionChange("atlas"),
          testID: "open-atlas",
        }),
        React.createElement(Pressable, {
          onPress: () => onSectionChange("discover"),
          testID: "open-discover",
        }),
        children
      ),
    resolveWebLayout: () => mockLayout,
    webPalette: {
      bg: "#000",
      border: "#111",
      lime: "#222",
      mint: "#333",
      muted: "#444",
      tangerine: "#555",
      text: "#fff",
    },
  };
});

jest.mock("../../components/web/map/SavedAtlas.web", () => {
  const React = require("react");
  const { Pressable, Text: MockText, View } = require("react-native");
  return {
    SavedAtlas: ({
      nodes,
      onFindSimilar,
      onSaveRecommendation,
      onSelect,
      ...props
    }: {
      nodes: Array<{ id: string; title: string }>;
      onFindSimilar?(seed: unknown): Promise<Array<unknown>>;
      onSaveRecommendation?(seed: unknown, recommendation: unknown): Promise<void>;
      onSelect?(node: unknown): void;
    }) => {
      mockSavedAtlasProps = props;
      const [orbitError, setOrbitError] = React.useState(false);
      const seed = {
        id: "movies:source",
        category: "movies",
        item: { id: "source", title: "Source", subtitle: "Seed", meta: "2026" },
      };
      return React.createElement(
        View,
        { accessibilityLabel: nodes.map((node) => `${node.id}:${node.title}`).join("|") || "empty", testID: "saved-atlas" },
        React.createElement(Pressable, { onPress: () => onSelect?.(nodes[0]), testID: "atlas-select" }),
        React.createElement(Pressable, {
          onPress: async () => {
            try {
              await onFindSimilar?.(seed);
            } catch {
              setOrbitError(true);
            }
          },
          testID: "orbit-find",
        }),
        React.createElement(Pressable, {
          onPress: async () => {
            const recommendations = await onFindSimilar?.(seed);
            if (recommendations?.[0]) {
              await onSaveRecommendation?.(seed, recommendations[0]).catch(() => undefined);
            }
          },
          testID: "orbit-save",
        }),
        orbitError ? React.createElement(MockText, { testID: "orbit-error" }, "retry") : null
      );
    },
  };
});

jest.mock("../../components/discovery/useDiscoveryController", () => ({
  useDiscoveryController: () => ({
    activeItem: {
      id: "active-discovery",
      meta: "2026",
      subtitle: "Discovery",
      title: "Active discovery",
    },
    commit: mockDiscoveryCommit,
    selectCategory: jest.fn(),
    similar: jest.fn(),
    state: { selected: "movies", sessions: {} },
    submit: jest.fn(),
    undo: jest.fn(),
  }),
}));

jest.mock("../../components/discovery/useReducedMotion", () => ({
  useReducedMotion: () => mockReducedMotion,
}));

jest.mock("../../lib/storage/recents", () => ({
  addRecent: jest.fn(async () => []),
  listRecents: jest.fn(async () => []),
}));

jest.mock("../../lib/storage/saved", () => ({
  listSaved: jest.fn(),
}));

jest.mock("../../lib/storage/savedMutations", () => ({
  removeSavedItem: jest.fn(),
  runSavedMutation: jest.fn((mutation: () => Promise<unknown>) => mutation()),
  saveSavedItem: jest.fn(),
  toggleSavedItem: jest.fn(),
}));

jest.mock("../../lib/discovery/loadDetail", () => ({
  loadDetail: jest.fn(async () => null),
}));

jest.mock("../../lib/storage/discoveryMap", () => ({
  loadMapSnapshot: jest.fn(async () => ({
    version: 1,
    nodes: [],
    edges: [],
  })),
  recordMapTrailEvent: jest.fn(),
}));

jest.mock("../../lib/storage/discoveryTrailSync", () => ({
  disconnectSavedItemTrails: jest.fn(async () => []),
}));

jest.mock("../../lib/discovery/mapRecommendations", () => ({
  findMapRecommendations: jest.fn(),
}));

jest.mock("../../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn((handler) => {
        authStateChangeHandler = handler;
        return {
          data: { subscription: { unsubscribe: jest.fn() } },
        };
      }),
      signInWithPassword: jest.fn(),
      signOut: jest.fn(),
      signUp: jest.fn(),
    },
  },
}));

import {
  loadMapSnapshot,
  recordMapTrailEvent,
} from "../../lib/storage/discoveryMap";
import { listSaved } from "../../lib/storage/saved";
import { removeSavedItem, saveSavedItem } from "../../lib/storage/savedMutations";
import { disconnectSavedItemTrails } from "../../lib/storage/discoveryTrailSync";
import { findMapRecommendations } from "../../lib/discovery/mapRecommendations";
import { supabase } from "../../lib/supabase";
import WebHomeScreen from "../index.web";

type Owner = { id: string; email: string };

function session(owner: Owner | null) {
  return owner
    ? {
        user: {
          id: owner.id,
          email: owner.email,
          user_metadata: {},
        },
      }
    : null;
}

function saved(id: string): SavedItem {
  return {
    category: "movies",
    id,
    meta: "2026",
    savedAt: 1,
    subtitle: "Owner-specific",
    title: id,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

const ownerA = { id: "owner-a", email: "a@example.com" };
const ownerB = { id: "owner-b", email: "b@example.com" };

function snapshot(owner: Owner): MapSnapshot {
  return {
    version: 1,
    edges: [],
    nodes: [
      {
        category: "movies",
        id: `movies:${owner.id}`,
        itemId: owner.id,
        meta: "2026",
        savedAt: 1,
        subtitle: "Owner-specific",
        title: `${owner.id} atlas`,
        x: 0.5,
        y: 0.5,
      },
    ],
  };
}

function openAtlas() {
  fireEvent.press(screen.getByTestId("open-atlas"));
}

function recordTrailFromDiscovery() {
  fireEvent.press(screen.getByTestId("open-discover"));
  fireEvent.press(screen.getByTestId("start-similar"));
  fireEvent.press(screen.getByTestId("save-discovery"));
}

function expectVisibleAtlas(expected: Owner | "empty") {
  expect(screen.getByTestId("saved-atlas").props.accessibilityLabel).toBe(
    expected === "empty"
      ? "empty"
      : `movies:${expected.id}:${expected.id} atlas`
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  authStateChangeHandler = null;
  mockLayout = "desktop";
  mockReducedMotion = false;
  mockSavedAtlasProps = {};
  mockDiscoveryCommit.mockReset().mockResolvedValue(undefined);
  jest.mocked(listSaved).mockReset();
  jest.mocked(loadMapSnapshot).mockReset().mockResolvedValue({
    version: 1,
    nodes: [],
    edges: [],
  });
  jest.mocked(recordMapTrailEvent).mockReset();
  jest.mocked(removeSavedItem).mockReset();
  jest.mocked(saveSavedItem).mockReset();
  jest.mocked(disconnectSavedItemTrails).mockReset().mockResolvedValue([]);
  jest.mocked(findMapRecommendations).mockReset();
  jest.mocked(supabase.auth.getSession).mockReset();
});

it("hands the resolved web layout and motion preference to the web-only Saved Atlas", async () => {
  mockLayout = "tabletPortrait";
  mockReducedMotion = true;
  jest.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null } } as never);
  jest.mocked(listSaved).mockResolvedValue([]);

  render(<WebHomeScreen />);
  await waitFor(() => expect(loadMapSnapshot).toHaveBeenCalledWith([], undefined));
  openAtlas();

  await waitFor(() =>
    expect(mockSavedAtlasProps).toEqual(expect.objectContaining({
      layout: "tabletPortrait",
      reducedMotion: true,
    }))
  );
});

it.each([
  { layout: "tabletPortrait" as const, presentation: "drawer" },
  { layout: "tabletLandscape" as const, presentation: "rail" },
  { layout: "desktop" as const, presentation: "rail" },
  { layout: "mobile" as const, presentation: "sheet" },
])("renders the selected atlas detail as a $presentation for $layout", async ({ layout, presentation }) => {
  mockLayout = layout;
  const source = sourceItem();
  jest.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: session(ownerA) } } as never);
  jest.mocked(listSaved).mockResolvedValue([source]);
  jest.mocked(loadMapSnapshot).mockResolvedValue(sourceSnapshot([source]));

  render(<WebHomeScreen />);
  await waitFor(() => expect(loadMapSnapshot).toHaveBeenCalledWith([source], ownerA.id));
  openAtlas();
  fireEvent.press(screen.getByTestId("atlas-select"));

  await waitFor(() => expect(screen.getByLabelText(`${presentation} detail`)).toBeTruthy());
  if (presentation === "drawer") {
    expect(screen.getByText("Source")).toBeTruthy();
    expect(screen.queryByTestId("drawer-expanded")).toBeNull();
    fireEvent.press(screen.getByTestId("drawer-expand"));
    expect(screen.getByTestId("drawer-expanded")).toHaveTextContent("Open discovery deck");
  }
  if (presentation === "rail") {
    expect(screen.getByTestId("drawer-expanded")).toHaveTextContent("Open discovery deck");
  }
});

it.each(["tabletPortrait", "mobile"] as const)(
  "keeps direct atlas recommendations in the %s app-owned detail surface",
  async (layout) => {
    mockLayout = layout;
    const source = sourceItem();
    jest.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: session(ownerA) } } as never);
    jest.mocked(listSaved).mockResolvedValue([source]);
    jest.mocked(loadMapSnapshot).mockResolvedValue(sourceSnapshot([source]));
    jest.mocked(findMapRecommendations).mockResolvedValue(orbitResult("movies", "candidate", "Candidate") as never);

    render(<WebHomeScreen />);
    await waitFor(() => expect(loadMapSnapshot).toHaveBeenCalledWith([source], ownerA.id));
    openAtlas();
    fireEvent.press(screen.getByTestId("atlas-select"));
    fireEvent.press(await screen.findByTestId("atlas-find-similar"));

    await waitFor(() => expect(findMapRecommendations).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("saved-atlas")).toBeTruthy();
  }
);

it("keeps a failed mobile atlas orbit retryable without leaving the atlas", async () => {
  mockLayout = "mobile";
  const source = sourceItem();
  jest.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: session(ownerA) } } as never);
  jest.mocked(listSaved).mockResolvedValue([source]);
  jest.mocked(loadMapSnapshot).mockResolvedValue(sourceSnapshot([source]));
  jest.mocked(findMapRecommendations).mockRejectedValue(new Error("offline"));

  render(<WebHomeScreen />);
  await waitFor(() => expect(loadMapSnapshot).toHaveBeenCalledWith([source], ownerA.id));
  openAtlas();
  fireEvent.press(screen.getByTestId("atlas-select"));
  fireEvent.press(await screen.findByTestId("atlas-find-similar"));
  await waitFor(() => expect(findMapRecommendations).toHaveBeenCalledTimes(1));

  expect(screen.getByTestId("saved-atlas")).toBeTruthy();
  fireEvent.press(screen.getByTestId("atlas-find-similar"));
  await waitFor(() => expect(findMapRecommendations).toHaveBeenCalledTimes(2));
  expect(screen.getByTestId("saved-atlas")).toBeTruthy();
});

it.each([
  {
    label: "signed-out to owner A",
    previousOwner: null,
    nextOwner: ownerA,
    event: "SIGNED_IN",
  },
  {
    label: "owner A to signed-out",
    previousOwner: ownerA,
    nextOwner: null,
    event: "SIGNED_OUT",
  },
  {
    label: "owner A to owner B",
    previousOwner: ownerA,
    nextOwner: ownerB,
    event: "SIGNED_IN",
  },
])(
  "does not load or prune a map with stale saved items during $label",
  async ({ previousOwner, nextOwner, event }) => {
    const previousItems = [saved(previousOwner?.id ?? "anonymous")];
    const nextItems = [saved(nextOwner?.id ?? "anonymous")];
    const pendingRefresh = deferred<SavedItem[]>();

    jest.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: session(previousOwner) },
    } as never);
    jest
      .mocked(listSaved)
      .mockResolvedValueOnce(previousItems)
      .mockReturnValueOnce(pendingRefresh.promise);

    render(<WebHomeScreen />);

    await waitFor(() =>
      expect(loadMapSnapshot).toHaveBeenCalledWith(
        previousItems,
        previousOwner?.id
      )
    );
    jest.mocked(loadMapSnapshot).mockClear();

    await act(async () => {
      authStateChangeHandler?.(event, session(nextOwner));
    });
    await waitFor(() => expect(listSaved).toHaveBeenCalledTimes(2));

    expect(loadMapSnapshot).not.toHaveBeenCalled();

    await act(async () => {
      pendingRefresh.resolve(nextItems);
      await pendingRefresh.promise;
    });

    await waitFor(() =>
      expect(loadMapSnapshot).toHaveBeenCalledWith(nextItems, nextOwner?.id)
    );
    expect(loadMapSnapshot).toHaveBeenCalledTimes(1);
  }
);

it("keeps same-owner hydration valid until that owner's refresh resolves", async () => {
  const currentItems = [saved("owner-a-current")];
  const refreshedItems = [saved("owner-a-refreshed")];
  const pendingRefresh = deferred<SavedItem[]>();

  jest.mocked(supabase.auth.getSession).mockResolvedValue({
    data: { session: session(ownerA) },
  } as never);
  jest
    .mocked(listSaved)
    .mockResolvedValueOnce(currentItems)
    .mockReturnValueOnce(pendingRefresh.promise);

  render(<WebHomeScreen />);

  await waitFor(() =>
    expect(loadMapSnapshot).toHaveBeenCalledWith(currentItems, ownerA.id)
  );
  jest.mocked(loadMapSnapshot).mockClear();

  await act(async () => {
    authStateChangeHandler?.("TOKEN_REFRESHED", session(ownerA));
  });
  await waitFor(() => expect(listSaved).toHaveBeenCalledTimes(2));
  expect(loadMapSnapshot).not.toHaveBeenCalled();

  await act(async () => {
    pendingRefresh.resolve(refreshedItems);
    await pendingRefresh.promise;
  });

  await waitFor(() =>
    expect(loadMapSnapshot).toHaveBeenCalledWith(refreshedItems, ownerA.id)
  );
  expect(loadMapSnapshot).toHaveBeenCalledTimes(1);
});

it("clears owner A immediately and stays empty when owner B map loading fails before a successful retry", async () => {
  const ownerBRefresh = deferred<SavedItem[]>();
  const ownerASnapshot = snapshot(ownerA);
  const ownerBSnapshot = snapshot(ownerB);

  jest.mocked(supabase.auth.getSession).mockResolvedValue({
    data: { session: session(ownerA) },
  } as never);
  jest
    .mocked(listSaved)
    .mockResolvedValueOnce([saved(ownerA.id)])
    .mockReturnValueOnce(ownerBRefresh.promise)
    .mockResolvedValueOnce([saved(`${ownerB.id}-retry`)]);
  jest
    .mocked(loadMapSnapshot)
    .mockResolvedValueOnce(ownerASnapshot)
    .mockRejectedValueOnce(new Error("owner B map unavailable"))
    .mockResolvedValueOnce(ownerBSnapshot);

  render(<WebHomeScreen />);
  openAtlas();
  await waitFor(() => expectVisibleAtlas(ownerA));

  await act(async () => {
    authStateChangeHandler?.("SIGNED_IN", session(ownerB));
  });
  expectVisibleAtlas("empty");

  await act(async () => {
    ownerBRefresh.resolve([saved(ownerB.id)]);
    await ownerBRefresh.promise;
  });
  await waitFor(() => expect(loadMapSnapshot).toHaveBeenCalledTimes(2));
  expectVisibleAtlas("empty");

  await act(async () => {
    authStateChangeHandler?.("TOKEN_REFRESHED", session(ownerB));
  });
  await waitFor(() => expectVisibleAtlas(ownerB));
});

it("keeps owner B visible when owner A's older map load resolves last", async () => {
  const ownerAMap = deferred<MapSnapshot>();
  const ownerBMap = deferred<MapSnapshot>();

  jest.mocked(supabase.auth.getSession).mockResolvedValue({
    data: { session: session(ownerA) },
  } as never);
  jest
    .mocked(listSaved)
    .mockResolvedValueOnce([saved(ownerA.id)])
    .mockResolvedValueOnce([saved(ownerB.id)]);
  jest
    .mocked(loadMapSnapshot)
    .mockReturnValueOnce(ownerAMap.promise)
    .mockReturnValueOnce(ownerBMap.promise);

  render(<WebHomeScreen />);
  openAtlas();
  await waitFor(() => expect(loadMapSnapshot).toHaveBeenCalledTimes(1));

  await act(async () => {
    authStateChangeHandler?.("SIGNED_IN", session(ownerB));
  });
  await waitFor(() => expect(loadMapSnapshot).toHaveBeenCalledTimes(2));
  expectVisibleAtlas("empty");

  await act(async () => {
    ownerBMap.resolve(snapshot(ownerB));
    await ownerBMap.promise;
  });
  await waitFor(() => expectVisibleAtlas(ownerB));

  await act(async () => {
    ownerAMap.resolve(snapshot(ownerA));
    await ownerAMap.promise;
  });
  expectVisibleAtlas(ownerB);
});

it("keeps owner B visible when owner A's older trail mutation resolves last", async () => {
  const ownerATrailMutation = deferred<MapSnapshot>();

  jest.mocked(supabase.auth.getSession).mockResolvedValue({
    data: { session: session(ownerA) },
  } as never);
  jest
    .mocked(listSaved)
    .mockResolvedValueOnce([saved(ownerA.id)])
    .mockResolvedValueOnce([saved(ownerB.id)]);
  jest
    .mocked(loadMapSnapshot)
    .mockResolvedValueOnce(snapshot(ownerA))
    .mockResolvedValueOnce(snapshot(ownerB));
  jest
    .mocked(recordMapTrailEvent)
    .mockReturnValueOnce(ownerATrailMutation.promise);

  render(<WebHomeScreen />);
  openAtlas();
  await waitFor(() => expectVisibleAtlas(ownerA));

  recordTrailFromDiscovery();
  await waitFor(() =>
    expect(recordMapTrailEvent).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Array),
      ownerA.id
    )
  );

  await act(async () => {
    authStateChangeHandler?.("SIGNED_IN", session(ownerB));
  });
  openAtlas();
  await waitFor(() => expectVisibleAtlas(ownerB));

  await act(async () => {
    ownerATrailMutation.resolve(snapshot(ownerA));
    await ownerATrailMutation.promise;
  });
  expectVisibleAtlas(ownerB);
});

it("does not record an owner A trail after its pending commit crosses an A to B to A cycle", async () => {
  const pendingCommit = deferred<undefined>();
  const rehydratedOwnerASnapshot: MapSnapshot = {
    ...snapshot(ownerA),
    nodes: [
      {
        ...snapshot(ownerA).nodes[0],
        id: "movies:owner-a-rehydrated",
        title: "owner-a rehydrated atlas",
      },
    ],
  };

  mockDiscoveryCommit.mockReturnValueOnce(pendingCommit.promise);
  jest.mocked(supabase.auth.getSession).mockResolvedValue({
    data: { session: session(ownerA) },
  } as never);
  jest
    .mocked(listSaved)
    .mockResolvedValueOnce([saved(ownerA.id)])
    .mockResolvedValueOnce([saved(ownerB.id)])
    .mockResolvedValueOnce([saved(`${ownerA.id}-rehydrated`)]);
  jest
    .mocked(loadMapSnapshot)
    .mockResolvedValueOnce(snapshot(ownerA))
    .mockResolvedValueOnce(snapshot(ownerB))
    .mockResolvedValueOnce(rehydratedOwnerASnapshot);
  jest.mocked(recordMapTrailEvent).mockResolvedValueOnce(snapshot(ownerA));

  render(<WebHomeScreen />);
  openAtlas();
  await waitFor(() => expectVisibleAtlas(ownerA));

  recordTrailFromDiscovery();
  expect(mockDiscoveryCommit).toHaveBeenCalledTimes(1);

  await act(async () => {
    authStateChangeHandler?.("SIGNED_IN", session(ownerB));
  });
  openAtlas();
  await waitFor(() => expectVisibleAtlas(ownerB));

  await act(async () => {
    authStateChangeHandler?.("SIGNED_IN", session(ownerA));
  });
  await waitFor(() =>
    expect(screen.getByTestId("saved-atlas").props.accessibilityLabel).toBe(
      "movies:owner-a-rehydrated:owner-a rehydrated atlas"
    )
  );

  await act(async () => {
    pendingCommit.resolve(undefined);
    await pendingCommit.promise;
  });

  expect(recordMapTrailEvent).not.toHaveBeenCalled();
  expect(screen.getByTestId("saved-atlas").props.accessibilityLabel).toBe(
    "movies:owner-a-rehydrated:owner-a rehydrated atlas"
  );
});

it("does not record a trail after unmounting while its discovery commit is pending", async () => {
  const pendingCommit = deferred<undefined>();

  mockDiscoveryCommit.mockReturnValueOnce(pendingCommit.promise);
  jest.mocked(supabase.auth.getSession).mockResolvedValue({
    data: { session: session(ownerA) },
  } as never);
  jest.mocked(listSaved).mockResolvedValueOnce([saved(ownerA.id)]);
  jest.mocked(loadMapSnapshot).mockResolvedValueOnce(snapshot(ownerA));
  jest.mocked(recordMapTrailEvent).mockResolvedValueOnce(snapshot(ownerA));

  const view = render(<WebHomeScreen />);
  openAtlas();
  await waitFor(() => expectVisibleAtlas(ownerA));

  recordTrailFromDiscovery();
  expect(mockDiscoveryCommit).toHaveBeenCalledTimes(1);
  view.unmount();

  await act(async () => {
    pendingCommit.resolve(undefined);
    await pendingCommit.promise;
  });

  expect(recordMapTrailEvent).not.toHaveBeenCalled();
});

it("applies a deferred trail mutation snapshot while its owner and map generation remain current", async () => {
  const pendingCommit = deferred<undefined>();
  const ownerATrailSnapshot: MapSnapshot = {
    ...snapshot(ownerA),
    nodes: [
      {
        ...snapshot(ownerA).nodes[0],
        id: "movies:owner-a-trail",
        title: "owner-a trail atlas",
      },
    ],
  };

  mockDiscoveryCommit.mockReturnValueOnce(pendingCommit.promise);
  jest.mocked(supabase.auth.getSession).mockResolvedValue({
    data: { session: session(ownerA) },
  } as never);
  jest.mocked(listSaved).mockResolvedValueOnce([saved(ownerA.id)]);
  jest.mocked(loadMapSnapshot).mockResolvedValueOnce(snapshot(ownerA));
  jest
    .mocked(recordMapTrailEvent)
    .mockResolvedValueOnce(ownerATrailSnapshot);

  render(<WebHomeScreen />);
  openAtlas();
  await waitFor(() => expectVisibleAtlas(ownerA));

  recordTrailFromDiscovery();
  expect(recordMapTrailEvent).not.toHaveBeenCalled();

  await act(async () => {
    pendingCommit.resolve(undefined);
    await pendingCommit.promise;
  });
  openAtlas();

  await waitFor(() =>
    expect(screen.getByTestId("saved-atlas").props.accessibilityLabel).toBe(
      "movies:owner-a-trail:owner-a trail atlas"
    )
  );
});

function sourceItem(): SavedItem {
  return {
    category: "movies",
    id: "source",
    meta: "2026",
    savedAt: 1,
    subtitle: "Seed",
    title: "Source",
  };
}

function sourceSnapshot(items: SavedItem[]): MapSnapshot {
  return {
    version: 1,
    edges: [],
    nodes: items.map((item) => ({
      category: item.category,
      id: `${item.category}:${item.id}`,
      itemId: item.id,
      meta: item.meta,
      savedAt: item.savedAt,
      subtitle: item.subtitle,
      title: item.title,
      x: 0.5,
      y: 0.5,
    })),
  };
}

function orbitResult(category: "movies", id: string, title: string) {
  return {
    recommendations: [{
      category,
      item: { id, title, subtitle: "Candidate", meta: "2025" },
      reason: { label: "Shared genre: Drama" },
    }],
    sourceStatuses: [],
  };
}

it("persists a new orbit recommendation before recording its honest connecting trail", async () => {
  const source = sourceItem();
  const candidate: SavedItem = { ...source, id: "candidate", title: "Candidate", savedAt: 2 };
  const items = [source, candidate];
  jest.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: session(ownerA) } } as never);
  jest.mocked(listSaved).mockResolvedValue(source ? [source] : []);
  jest.mocked(loadMapSnapshot).mockResolvedValue(sourceSnapshot([source]));
  jest.mocked(findMapRecommendations).mockResolvedValue(orbitResult("movies", "candidate", "Candidate") as never);
  jest.mocked(saveSavedItem).mockResolvedValue({ items, confirmed: true, created: true });
  jest.mocked(recordMapTrailEvent).mockResolvedValue(sourceSnapshot(items));

  render(<WebHomeScreen />);
  await waitFor(() => expect(loadMapSnapshot).toHaveBeenCalledWith([source], ownerA.id));
  openAtlas();
  await act(async () => { fireEvent.press(screen.getByTestId("orbit-save")); });

  await waitFor(() => expect(saveSavedItem).toHaveBeenCalledWith("movies", expect.objectContaining({ id: "candidate" })));
  expect(recordMapTrailEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      source: { category: "movies", id: "source" },
      target: { category: "movies", id: "candidate" },
      reason: "Shared genre: Drama",
    }),
    items,
    ownerA.id
  );
  expect(jest.mocked(saveSavedItem).mock.invocationCallOrder[0]).toBeLessThan(
    jest.mocked(recordMapTrailEvent).mock.invocationCallOrder[0]
  );
});

it("turns all actual recommendation-provider failures into a retryable orbit failure", async () => {
  const source = sourceItem();
  const unavailable = async (): Promise<never[]> => { throw new Error("offline"); };
  jest.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: session(ownerA) } } as never);
  jest.mocked(listSaved).mockResolvedValue([source]);
  jest.mocked(loadMapSnapshot).mockResolvedValue(sourceSnapshot([source]));
  jest.mocked(findMapRecommendations).mockImplementation(async (seed) => {
    const actual = jest.requireActual("../../lib/discovery/mapRecommendations") as typeof import("../../lib/discovery/mapRecommendations");
    return actual.findMapRecommendations(seed, {
      providers: {
        movies: { search: unavailable, random: unavailable, similar: unavailable, filter: unavailable },
        books: { search: unavailable, random: unavailable, similar: unavailable, filter: unavailable },
        artists: { search: unavailable, random: unavailable, similar: unavailable, filter: unavailable },
        albums: { search: unavailable, random: unavailable, similar: unavailable, filter: unavailable },
      },
    });
  });

  render(<WebHomeScreen />);
  await waitFor(() => expect(loadMapSnapshot).toHaveBeenCalledWith([source], ownerA.id));
  openAtlas();
  await act(async () => { fireEvent.press(screen.getByTestId("orbit-find")); });

  await waitFor(() => expect(screen.getByTestId("orbit-error")).toBeTruthy());
  expect(recordMapTrailEvent).not.toHaveBeenCalled();
});

it("records only a relationship when an orbit candidate is already saved", async () => {
  const source = sourceItem();
  const existing: SavedItem = { ...source, id: "candidate", title: "Candidate", savedAt: 2 };
  const items = [source, existing];
  jest.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: session(ownerA) } } as never);
  jest.mocked(listSaved).mockResolvedValue(items);
  jest.mocked(loadMapSnapshot).mockResolvedValue(sourceSnapshot(items));
  jest.mocked(findMapRecommendations).mockResolvedValue(orbitResult("movies", "candidate", "Candidate") as never);
  jest.mocked(recordMapTrailEvent).mockResolvedValue(sourceSnapshot(items));

  render(<WebHomeScreen />);
  await waitFor(() => expect(loadMapSnapshot).toHaveBeenCalledWith(items, ownerA.id));
  openAtlas();
  await act(async () => { fireEvent.press(screen.getByTestId("orbit-save")); });

  await waitFor(() => expect(recordMapTrailEvent).toHaveBeenCalled());
  expect(saveSavedItem).not.toHaveBeenCalled();
  expect(recordMapTrailEvent).toHaveBeenCalledWith(
    expect.objectContaining({ target: { category: "movies", id: "candidate" } }),
    items,
    ownerA.id
  );
});

it("does not create a trail when saving a new orbit recommendation is unconfirmed", async () => {
  const source = sourceItem();
  jest.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: session(ownerA) } } as never);
  jest.mocked(listSaved).mockResolvedValue([source]);
  jest.mocked(loadMapSnapshot).mockResolvedValue(sourceSnapshot([source]));
  jest.mocked(findMapRecommendations).mockResolvedValue(orbitResult("movies", "candidate", "Candidate") as never);
  jest.mocked(saveSavedItem).mockResolvedValue({ items: [source], confirmed: false, created: true });
  jest.mocked(recordMapTrailEvent).mockResolvedValue(sourceSnapshot([source]));

  render(<WebHomeScreen />);
  await waitFor(() => expect(loadMapSnapshot).toHaveBeenCalledWith([source], ownerA.id));
  openAtlas();
  await act(async () => { fireEvent.press(screen.getByTestId("orbit-save")); });

  await waitFor(() => expect(saveSavedItem).toHaveBeenCalled());
  expect(recordMapTrailEvent).not.toHaveBeenCalled();
});

it("drops a pending orbit save when ownership changes before persistence completes", async () => {
  const source = sourceItem();
  const candidate: SavedItem = { ...source, id: "candidate", title: "Candidate", savedAt: 2 };
  const pendingSave = deferred<{ items: SavedItem[]; confirmed: boolean; created: boolean }>();
  jest.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: session(ownerA) } } as never);
  jest.mocked(listSaved).mockResolvedValueOnce([source]).mockResolvedValueOnce([saved(ownerB.id)]);
  jest.mocked(loadMapSnapshot).mockResolvedValue(sourceSnapshot([source]));
  jest.mocked(findMapRecommendations).mockResolvedValue(orbitResult("movies", "candidate", "Candidate") as never);
  jest.mocked(saveSavedItem).mockReturnValue(pendingSave.promise);

  render(<WebHomeScreen />);
  await waitFor(() => expect(loadMapSnapshot).toHaveBeenCalledWith([source], ownerA.id));
  openAtlas();
  fireEvent.press(screen.getByTestId("orbit-save"));
  await waitFor(() => expect(saveSavedItem).toHaveBeenCalled());
  await act(async () => { authStateChangeHandler?.("SIGNED_IN", session(ownerB)); });
  await act(async () => { pendingSave.resolve({ items: [source, candidate], confirmed: true, created: true }); await pendingSave.promise; });

  expect(recordMapTrailEvent).not.toHaveBeenCalled();
});

it("disconnects saved trails and reloads the atlas after unsaving from map detail", async () => {
  const source = sourceItem();
  jest.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: session(ownerA) } } as never);
  jest.mocked(listSaved).mockResolvedValue([source]);
  jest.mocked(loadMapSnapshot).mockResolvedValueOnce(sourceSnapshot([source])).mockResolvedValueOnce(sourceSnapshot([]));
  jest.mocked(removeSavedItem).mockResolvedValue([]);

  render(<WebHomeScreen />);
  await waitFor(() => expect(loadMapSnapshot).toHaveBeenCalledWith([source], ownerA.id));
  openAtlas();
  fireEvent.press(screen.getByTestId("atlas-select"));
  await act(async () => { fireEvent.press(screen.getByTestId("detail-toggle")); });

  await waitFor(() => expect(disconnectSavedItemTrails).toHaveBeenCalledWith(
    { category: "movies", id: "source" },
    expect.objectContaining({ userId: ownerA.id })
  ));
  expect(jest.mocked(disconnectSavedItemTrails).mock.invocationCallOrder[0]).toBeLessThan(
    jest.mocked(removeSavedItem).mock.invocationCallOrder[0]
  );
  expect(loadMapSnapshot).toHaveBeenLastCalledWith([], ownerA.id);
});
