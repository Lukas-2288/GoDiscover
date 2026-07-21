import type { ContentCategory, ResultItem } from "../../types/content";
import type {
  DiscoveryActionMode,
  DiscoveryLoadInput,
  DiscoveryRequestIdentity,
  SimilarContext,
} from "./types";

export type DeckState = {
  queue: ResultItem[];
  seenCount: number;
  similarContext: SimilarContext | null;
};

export type CategoryDiscoverySession = {
  activeAction: DiscoveryActionMode | null;
  searchQuery: string;
  openSection: string | null;
  selectedFilters: string[];
  deck: DeckState;
  status: "idle" | "loading" | "ready" | "empty" | "error";
  requestError: string | null;
  activeRequest: DiscoveryRequestIdentity | null;
  retryInput: DiscoveryLoadInput | null;
};

export type SaveOperation = {
  id: number;
  category: ContentCategory;
  item: ResultItem;
};

export type DiscoveryDeckState = {
  selected: ContentCategory | null;
  sessions: Record<ContentCategory, CategoryDiscoverySession>;
  pendingSaves: SaveOperation[];
  lastSave: SaveOperation | null;
  actionError: string | null;
};

export type DiscoveryDeckAction =
  | { type: "selectCategory"; category: ContentCategory }
  | { type: "setActiveAction"; category: ContentCategory; action: DiscoveryActionMode }
  | { type: "setSearchQuery"; category: ContentCategory; query: string }
  | { type: "setOpenSection"; category: ContentCategory; section: string | null }
  | { type: "toggleFilter"; category: ContentCategory; value: string }
  | { type: "clearFilters"; category: ContentCategory }
  | {
      type: "requestStarted";
      request: DiscoveryRequestIdentity;
      input: DiscoveryLoadInput;
    }
  | {
      type: "requestSucceeded";
      request: DiscoveryRequestIdentity;
      input: DiscoveryLoadInput;
      items: ResultItem[];
    }
  | { type: "requestFailed"; request: DiscoveryRequestIdentity; message: string }
  | { type: "skipCurrent"; category: ContentCategory; itemId: string }
  | { type: "saveStarted"; operation: SaveOperation }
  | { type: "saveSucceeded"; operationId: number }
  | { type: "saveFailed"; operationId: number; message: string }
  | { type: "undoSave"; operationId: number }
  | { type: "clearUndo"; operationId: number }
  | { type: "clearActionError" };

export function activeDeckItem(deck: DeckState): ResultItem | null {
  return deck.queue[0] ?? null;
}

function replaceDeck(
  deck: DeckState,
  items: ResultItem[],
  similarContext: SimilarContext | null
): DeckState {
  const seen = new Set<string>();
  const queue: ResultItem[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    queue.push(item);
  }
  return {
    queue,
    seenCount: 0,
    similarContext,
  };
}

function dismiss(deck: DeckState, itemId: string): DeckState {
  if (deck.queue[0]?.id !== itemId) return deck;
  return { ...deck, queue: deck.queue.slice(1), seenCount: deck.seenCount + 1 };
}

function restore(deck: DeckState, item: ResultItem): DeckState {
  return {
    ...deck,
    queue: [item, ...deck.queue.filter((candidate) => candidate.id !== item.id)],
    seenCount: Math.max(0, deck.seenCount - 1),
  };
}

function createSession(items: ResultItem[] = []): CategoryDiscoverySession {
  return {
    activeAction: null,
    searchQuery: "",
    openSection: null,
    selectedFilters: [],
    deck: {
      queue: [...items],
      seenCount: 0,
      similarContext: null,
    },
    status: items.length > 0 ? "ready" : "idle",
    requestError: null,
    activeRequest: null,
    retryInput: null,
  };
}

function updateSession(
  state: DiscoveryDeckState,
  category: ContentCategory,
  update: (session: CategoryDiscoverySession) => CategoryDiscoverySession
): DiscoveryDeckState {
  const session = update(state.sessions[category]);
  if (session === state.sessions[category]) return state;
  return {
    ...state,
    sessions: {
      ...state.sessions,
      [category]: session,
    },
  };
}

export function createInitialDiscoveryDeckState(
  seeded: Partial<Record<ContentCategory, ResultItem[]>> = {}
): DiscoveryDeckState {
  return {
    selected: null,
    sessions: {
      movies: createSession(seeded.movies),
      books: createSession(seeded.books),
      artists: createSession(seeded.artists),
      albums: createSession(seeded.albums),
    },
    pendingSaves: [],
    lastSave: null,
    actionError: null,
  };
}

function matchesActiveRequest(
  session: CategoryDiscoverySession,
  request: DiscoveryRequestIdentity
): boolean {
  return (
    session.activeRequest?.id === request.id &&
    session.activeRequest.category === request.category
  );
}

export function discoveryDeckReducer(
  state: DiscoveryDeckState,
  action: DiscoveryDeckAction
): DiscoveryDeckState {
  switch (action.type) {
    case "selectCategory": {
      if (state.selected === action.category) return state;

      const selected = action.category;
      if (state.selected === null) return { ...state, selected };

      const departing = state.selected;
      const departed = updateSession(state, departing, (session) => ({
        ...session,
        activeRequest: null,
        status: session.deck.queue.length > 0 ? "ready" : "idle",
      }));
      return { ...departed, selected };
    }

    case "setActiveAction":
      return updateSession(state, action.category, (session) => ({
        ...session,
        activeAction: action.action,
      }));

    case "setSearchQuery":
      return updateSession(state, action.category, (session) => ({
        ...session,
        searchQuery: action.query,
      }));

    case "setOpenSection":
      return updateSession(state, action.category, (session) => ({
        ...session,
        openSection: action.section,
      }));

    case "toggleFilter":
      return updateSession(state, action.category, (session) => ({
        ...session,
        selectedFilters: session.selectedFilters.includes(action.value)
          ? session.selectedFilters.filter((value) => value !== action.value)
          : [...session.selectedFilters, action.value],
      }));

    case "clearFilters":
      return updateSession(state, action.category, (session) => ({
        ...session,
        selectedFilters: [],
      }));

    case "requestStarted":
      if (action.request.category !== action.input.category) return state;
      return updateSession(state, action.request.category, (session) => ({
        ...session,
        status: "loading",
        requestError: null,
        activeRequest: action.request,
        retryInput: action.input,
      }));

    case "requestSucceeded": {
      const session = state.sessions[action.request.category];
      if (!matchesActiveRequest(session, action.request)) return state;

      const similarContext =
        action.input.mode === "similar"
          ? { sourceId: action.input.seed.id, sourceTitle: action.input.seed.title }
          : null;
      const deck = replaceDeck(session.deck, action.items, similarContext);
      return updateSession(state, action.request.category, (current) => ({
        ...current,
        activeAction: null,
        deck,
        status: deck.queue.length > 0 ? "ready" : "empty",
        requestError: null,
        activeRequest: null,
      }));
    }

    case "requestFailed": {
      const session = state.sessions[action.request.category];
      if (!matchesActiveRequest(session, action.request)) return state;
      return updateSession(state, action.request.category, (current) => ({
        ...current,
        status: "error",
        requestError: action.message,
        activeRequest: null,
      }));
    }

    case "skipCurrent": {
      const session = state.sessions[action.category];
      const deck = dismiss(session.deck, action.itemId);
      if (deck === session.deck) return state;
      return updateSession(state, action.category, (current) => ({ ...current, deck }));
    }

    case "saveStarted": {
      const { operation } = action;
      const session = state.sessions[operation.category];
      const deck = dismiss(session.deck, operation.item.id);
      if (deck === session.deck) return state;
      const updated = updateSession(state, operation.category, (current) => ({
        ...current,
        deck,
      }));
      return {
        ...updated,
        pendingSaves: [...updated.pendingSaves, operation],
        actionError: null,
      };
    }

    case "saveSucceeded": {
      const operation = state.pendingSaves.find((candidate) => candidate.id === action.operationId);
      if (!operation) return state;
      return {
        ...state,
        pendingSaves: state.pendingSaves.filter(
          (candidate) => candidate.id !== action.operationId
        ),
        lastSave:
          state.lastSave === null || operation.id > state.lastSave.id
            ? operation
            : state.lastSave,
      };
    }

    case "saveFailed": {
      const operation = state.pendingSaves.find((candidate) => candidate.id === action.operationId);
      if (!operation) return state;
      const updated = updateSession(state, operation.category, (session) => ({
        ...session,
        deck: restore(session.deck, operation.item),
      }));
      return {
        ...updated,
        pendingSaves: updated.pendingSaves.filter(
          (candidate) => candidate.id !== action.operationId
        ),
        lastSave:
          updated.lastSave?.id === action.operationId ? null : updated.lastSave,
        actionError: action.message,
      };
    }

    case "undoSave": {
      if (state.lastSave?.id !== action.operationId) return state;
      const operation = state.lastSave;
      const updated = updateSession(state, operation.category, (session) => ({
        ...session,
        deck: restore(session.deck, operation.item),
      }));
      return { ...updated, lastSave: null, actionError: null };
    }

    case "clearUndo":
      if (state.lastSave?.id !== action.operationId) return state;
      return { ...state, lastSave: null };

    case "clearActionError":
      if (state.actionError === null) return state;
      return { ...state, actionError: null };

    default:
      return state;
  }
}
