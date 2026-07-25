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

jest.mock("../../components/web/WebHomeScreen", () => {
  const React = require("react");
  const { Pressable, View } = require("react-native");
  const Empty = () => React.createElement(View);

  return {
    ArchiveAtlas: Empty,
    WebDetailPanel: Empty,
    WebDiscoveryStage: Empty,
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
        children
      ),
    resolveWebLayout: () => "desktop",
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
  const { View } = require("react-native");
  return {
    SavedAtlas: ({
      nodes,
    }: {
      nodes: Array<{ id: string; title: string }>;
    }) =>
      React.createElement(View, {
        accessibilityLabel:
          nodes.map((node) => `${node.id}:${node.title}`).join("|") || "empty",
        testID: "saved-atlas",
      }),
  };
});

jest.mock("../../components/discovery/useDiscoveryController", () => ({
  useDiscoveryController: () => ({
    activeItem: null,
    commit: jest.fn(),
    selectCategory: jest.fn(),
    similar: jest.fn(),
    state: { selected: null, sessions: {} },
    submit: jest.fn(),
    undo: jest.fn(),
  }),
}));

jest.mock("../../components/discovery/useReducedMotion", () => ({
  useReducedMotion: () => false,
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
  toggleSavedItem: jest.fn(),
}));

jest.mock("../../lib/discovery/loadDetail", () => ({
  loadDetail: jest.fn(),
}));

jest.mock("../../lib/storage/discoveryMap", () => ({
  loadMapSnapshot: jest.fn(async () => ({
    version: 1,
    nodes: [],
    edges: [],
  })),
  recordMapTrailEvent: jest.fn(),
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

import { loadMapSnapshot } from "../../lib/storage/discoveryMap";
import { listSaved } from "../../lib/storage/saved";
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
  jest.mocked(listSaved).mockReset();
  jest.mocked(loadMapSnapshot).mockReset().mockResolvedValue({
    version: 1,
    nodes: [],
    edges: [],
  });
  jest.mocked(supabase.auth.getSession).mockReset();
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
