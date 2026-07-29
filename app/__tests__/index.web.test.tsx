import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";

import type { SavedItem } from "../../lib/storage/saved";
import type { DiscoveryCommitResult } from "../../components/discovery/useDiscoveryController";

let authStateChangeHandler:
  | ((event: string, session: unknown) => void)
  | null = null;
const mockDiscoveryCommit = jest.fn<
  Promise<DiscoveryCommitResult>,
  [unknown, "save" | "skip"]
>();
let mockLayout: "mobile" | "tabletPortrait" | "tabletLandscape" | "desktop" = "desktop";
let mockReducedMotion = false;
let mockWebHydrated = true;

jest.mock("../../components/useClientOnlyValue", () => ({
  useClientOnlyValue: (server: boolean, client: boolean) =>
    mockWebHydrated ? client : server,
}));

jest.mock("../../components/web/WebHomeScreen", () => {
  const React = require("react");
  const { Pressable, Text: MockText, View } = require("react-native");
  const Empty = () => React.createElement(View);

  return {
    ArchiveAtlas: Empty,
    WebDetailPanel: ({
      item,
      onClose,
      onSave,
      onToggleExpanded,
      onFindSimilarInAtlas,
      onPreviewAtlasRecommendation,
      onSaveAtlasRecommendation,
      onSkipAtlasRecommendation,
      onReseedAtlasRecommendation,
      atlasRecommendations = [],
      atlasRecommendationsError = false,
      presentation = "rail",
      expanded = true,
      similarLabel,
    }: {
      item?: { title: string; meta: string } | null;
      onClose(): void;
      onSave(): void;
      onToggleExpanded?(): void;
      onFindSimilarInAtlas?(): void;
      onPreviewAtlasRecommendation?(id: string): void;
      onSaveAtlasRecommendation?(id: string): void;
      onSkipAtlasRecommendation?(id: string): void;
      onReseedAtlasRecommendation?(id: string): void;
      atlasRecommendations?: Array<{ id: string; title: string }>;
      atlasRecommendationsError?: boolean;
      presentation?: "drawer" | "rail" | "sheet";
      expanded?: boolean;
      similarLabel?: string;
    }) => React.createElement(
      View,
      { accessibilityLabel: `${presentation} detail` },
      item ? React.createElement(MockText, null, item.title) : null,
      React.createElement(Pressable, { onPress: onClose, testID: "detail-close" }),
      React.createElement(Pressable, { onPress: onSave, testID: "detail-toggle" }),
      onFindSimilarInAtlas ? React.createElement(Pressable, { onPress: onFindSimilarInAtlas, testID: "atlas-find-similar" }) : null,
      onToggleExpanded ? React.createElement(Pressable, { onPress: onToggleExpanded, testID: "drawer-expand" }) : null,
      expanded ? React.createElement(MockText, { testID: "drawer-expanded" }, similarLabel ?? "Find similar") : null,
      atlasRecommendationsError ? React.createElement(MockText, { testID: "atlas-recommendation-error" }, "offline") : null,
      ...atlasRecommendations.flatMap((recommendation) => [
        React.createElement(MockText, { key: `${recommendation.id}-title`, testID: `responsive-result-${recommendation.id}` }, recommendation.title),
        React.createElement(Pressable, { key: `${recommendation.id}-preview`, onPress: () => onPreviewAtlasRecommendation?.(recommendation.id), testID: `responsive-preview-${recommendation.id}` }),
        React.createElement(Pressable, { key: `${recommendation.id}-save`, onPress: () => onSaveAtlasRecommendation?.(recommendation.id), testID: `responsive-save-${recommendation.id}` }),
        React.createElement(Pressable, { key: `${recommendation.id}-skip`, onPress: () => onSkipAtlasRecommendation?.(recommendation.id), testID: `responsive-skip-${recommendation.id}` }),
        React.createElement(Pressable, { key: `${recommendation.id}-reseed`, onPress: () => onReseedAtlasRecommendation?.(recommendation.id), testID: `responsive-reseed-${recommendation.id}` }),
      ])
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
  listSavedForOwner: jest.fn(),
}));

jest.mock("../../lib/storage/savedMutations", () => ({
  removeSavedItem: jest.fn(),
  runSavedMutation: jest.fn((mutation: () => Promise<unknown>) => mutation()),
  // Binds storage calls to the owner captured when the user acted. Returned as
  // an identifiable marker so assertions can show the owner was threaded.
  savedMutationsForOwner: jest.fn((ownerId: string | null) => ({
    boundOwnerId: ownerId,
  })),
  saveSavedItem: jest.fn(),
  toggleSavedItem: jest.fn(),
}));

jest.mock("../../lib/discovery/loadDetail", () => ({
  loadDetail: jest.fn(async () => null),
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

import { loadDetail } from "../../lib/discovery/loadDetail";
import { listSavedForOwner } from "../../lib/storage/saved";
import { removeSavedItem, saveSavedItem } from "../../lib/storage/savedMutations";
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
  mockWebHydrated = true;
  mockDiscoveryCommit.mockReset().mockResolvedValue({
    decision: "save",
    confirmed: false,
    reason: "noop",
  });
  jest.mocked(listSavedForOwner).mockReset();
  jest.mocked(removeSavedItem).mockReset();
  jest.mocked(saveSavedItem).mockReset();
  jest.mocked(loadDetail).mockReset().mockResolvedValue(null as never);
  jest.mocked(supabase.auth.getSession).mockReset();
});

it("keeps the responsive web application out of the hydration tree until client effects run", () => {
  mockWebHydrated = false;
  jest.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null } } as never);
  jest.mocked(listSavedForOwner).mockResolvedValue([]);

  render(<WebHomeScreen />);

  expect(screen.getByLabelText("Loading GoDiscover")).toBeTruthy();
});
