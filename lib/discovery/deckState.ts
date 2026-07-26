import type { ContentCategory, ResultItem } from "../../types/content";
import type {
  DiscoveryActionMode,
  DiscoveryLoadInput,
  DiscoveryRequestIdentity,
  SimilarContext,
} from "./types";
import { toggleDiscoveryFilter } from "./filterSelection";

export type DeckState = {
  queue: ResultItem[];
  seenCount: number;
  similarContext: SimilarContext | null;
  /**
   * Next provider page to request when topping up. Providers return five items
   * a batch, so without paging a top-up would just re-fetch the same five.
   */
  cursor: number;
  /**
   * Set once a top-up comes back with nothing new. Only then is the deck
   * genuinely finished — previously an empty queue was indistinguishable from
   * "we never asked for more", which is what produced a dead end after five
   * swipes.
   */
  exhausted: boolean;
  /** True while a background top-up is in flight, to avoid stacking requests. */
  toppingUp: boolean;
  /**
   * Set when a top-up fails, and cleared only by a new explicit request.
   * Without it a provider that keeps failing would be retried immediately every
   * time the effect re-ran — the failure clears `toppingUp`, which re-arms the
   * condition that started it.
   */
  topUpBlocked: boolean;
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
  /**
   * The account signed in when the save happened. Undo must act on this owner,
   * not on whoever is signed in when Undo fires — otherwise undoing a save made
   * under one account deletes another account's copy of the same item.
   */
  ownerId?: string | null;
};

/**
 * A dismissed card, kept so it can be put back. Mis-taps were unrecoverable:
 * Undo existed for saves but not for skips, and a skip is the easier one to
 * trigger by accident.
 */
export type SkipOperation = {
  id: number;
  category: ContentCategory;
  item: ResultItem;
  ownerId?: string | null;
};

export type DiscoveryDeckState = {
  selected: ContentCategory | null;
  sessions: Record<ContentCategory, CategoryDiscoverySession>;
  pendingSaves: SaveOperation[];
  lastSave: SaveOperation | null;
  lastSkip: SkipOperation | null;
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
  | {
      type: "skipCurrent";
      category: ContentCategory;
      itemId: string;
      operation?: SkipOperation;
    }
  | { type: "undoSkip"; operation: SkipOperation }
  | { type: "clearSkipUndo"; operationId: number }
  | {
      type: "deckToppedUp";
      category: ContentCategory;
      items: ResultItem[];
      cursor: number;
    }
  | { type: "topUpStarted"; category: ContentCategory }
  | { type: "topUpFailed"; category: ContentCategory }
  | { type: "saveStarted"; operation: SaveOperation }
  | { type: "saveSucceeded"; operationId: number; undoable?: boolean }
  | { type: "saveFailed"; operationId: number; message: string }
  | { type: "undoSave"; operation: SaveOperation }
  | { type: "undoSaveFailed"; operation: SaveOperation; message?: string }
  | { type: "clearUndo"; operationId: number }
  | { type: "clearActionError" };

export function activeDeckItem(deck: DeckState): ResultItem | null {
  return deck.queue[0] ?? null;
}

function dedupe(items: readonly ResultItem[], taken = new Set<string>()): ResultItem[] {
  const queue: ResultItem[] = [];
  for (const item of items) {
    if (taken.has(item.id)) continue;
    taken.add(item.id);
    queue.push(item);
  }
  return queue;
}

function replaceDeck(
  deck: DeckState,
  items: ResultItem[],
  similarContext: SimilarContext | null
): DeckState {
  return {
    queue: dedupe(items),
    seenCount: 0,
    similarContext,
    cursor: 2,
    exhausted: false,
    toppingUp: false,
    topUpBlocked: false,
  };
}

/**
 * Appends a background top-up. An empty result is what marks the deck
 * exhausted — an empty queue on its own only ever meant nobody had asked for
 * more yet.
 */
function appendToDeck(
  deck: DeckState,
  items: readonly ResultItem[],
  cursor: number
): DeckState {
  const fresh = dedupe(items, new Set(deck.queue.map((item) => item.id)));
  return {
    ...deck,
    queue: [...deck.queue, ...fresh],
    cursor,
    exhausted: fresh.length === 0,
    toppingUp: false,
    topUpBlocked: false,
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
      cursor: 2,
      exhausted: false,
      toppingUp: false,
      topUpBlocked: false,
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
    lastSkip: null,
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
      if (state.selected === null) return { ...state, selected, actionError: null };

      const departing = state.selected;
      const departed = updateSession(state, departing, (session) => ({
        ...session,
        activeRequest: null,
        status: session.deck.queue.length > 0 ? "ready" : "idle",
      }));
      return { ...departed, selected, actionError: null };
    }

    case "setActiveAction":
      return {
        ...updateSession(state, action.category, (session) => ({
          ...session,
          activeAction: action.action,
        })),
        actionError: null,
      };

    case "setSearchQuery":
      return {
        ...updateSession(state, action.category, (session) => ({
          ...session,
          searchQuery: action.query,
        })),
        actionError: null,
      };

    case "setOpenSection":
      return {
        ...updateSession(state, action.category, (session) => ({
          ...session,
          openSection: action.section,
        })),
        actionError: null,
      };

    case "toggleFilter":
      return {
        ...updateSession(state, action.category, (session) => ({
          ...session,
          selectedFilters: toggleDiscoveryFilter(
            session.selectedFilters,
            action.value
          ),
        })),
        actionError: null,
      };

    case "clearFilters":
      return {
        ...updateSession(state, action.category, (session) => ({
          ...session,
          selectedFilters: [],
        })),
        actionError: null,
      };

    case "requestStarted":
      if (action.request.category !== action.input.category) return state;
      return {
        ...updateSession(state, action.request.category, (session) => ({
          ...session,
          status: "loading",
          requestError: null,
          activeRequest: action.request,
          retryInput: action.input,
        })),
        actionError: null,
      };

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
      return {
        ...updateSession(state, action.category, (current) => ({ ...current, deck })),
        lastSkip: action.operation ?? state.lastSkip,
        actionError: null,
      };
    }

    case "undoSkip": {
      const { operation } = action;
      if (state.lastSkip?.id !== operation.id) return state;
      const updated = updateSession(state, operation.category, (session) => ({
        ...session,
        deck: restore(session.deck, operation.item),
      }));
      return { ...updated, lastSkip: null, actionError: null };
    }

    case "clearSkipUndo":
      if (state.lastSkip?.id !== action.operationId) return state;
      return { ...state, lastSkip: null };

    case "topUpStarted": {
      const session = state.sessions[action.category];
      if (
        session.deck.toppingUp ||
        session.deck.exhausted ||
        session.deck.topUpBlocked
      ) {
        return state;
      }
      return updateSession(state, action.category, (current) => ({
        ...current,
        deck: { ...current.deck, toppingUp: true },
      }));
    }

    case "topUpFailed": {
      const session = state.sessions[action.category];
      if (!session.deck.toppingUp) return state;
      // Leave `exhausted` alone — a failed request is not proof the archive is
      // empty, and marking it so would strand the user on a dead end.
      return updateSession(state, action.category, (current) => ({
        ...current,
        deck: { ...current.deck, toppingUp: false, topUpBlocked: true },
      }));
    }

    case "deckToppedUp": {
      const session = state.sessions[action.category];
      const deck = appendToDeck(session.deck, action.items, action.cursor);
      return updateSession(state, action.category, (current) => ({
        ...current,
        deck,
        status: deck.queue.length > 0 ? "ready" : current.status,
      }));
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
          action.undoable === false
            ? null
            : state.lastSave === null || operation.id > state.lastSave.id
            ? operation
            : state.lastSave,
        actionError: null,
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
        lastSave: null,
        actionError: action.message,
      };
    }

    case "undoSave": {
      const { operation } = action;
      const updated = updateSession(state, operation.category, (session) => ({
        ...session,
        deck: restore(session.deck, operation.item),
      }));
      return {
        ...updated,
        lastSave: updated.lastSave?.id === operation.id ? null : updated.lastSave,
        actionError: null,
      };
    }

    case "undoSaveFailed":
      return {
        ...state,
        lastSave: action.operation,
        actionError: action.message ?? state.actionError,
      };

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
