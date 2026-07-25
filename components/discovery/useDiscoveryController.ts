import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import type { ContentCategory, ResultItem } from "../../types/content";
import {
  activeDeckItem,
  createInitialDiscoveryDeckState,
  discoveryDeckReducer,
} from "../../lib/discovery/deckState";
import type {
  DiscoveryDeckAction,
  DiscoveryDeckState,
  SaveOperation,
} from "../../lib/discovery/deckState";
import { loadDiscovery, toDiscoveryError } from "../../lib/discovery/loadDiscovery";
import { createDiscoveryRequestTracker } from "../../lib/discovery/requestTracker";
import type {
  DiscoveryActionMode,
  DiscoveryLoadInput,
} from "../../lib/discovery/types";
import {
  addSaved,
  listSaved,
  removeSaved,
  type SavedItem,
} from "../../lib/storage/saved";
import {
  removeSavedItem,
  saveSavedItem,
  type SaveSavedItemResult,
  type SavedMutationDependencies,
} from "../../lib/storage/savedMutations";

export type DiscoveryControllerDependencies = {
  load: typeof loadDiscovery;
  listSaved?: typeof listSaved;
  addSaved: typeof addSaved;
  removeSaved: typeof removeSaved;
};

export type UseDiscoveryControllerOptions = {
  initialItems?: Partial<Record<ContentCategory, ResultItem[]>>;
  dependencies?: DiscoveryControllerDependencies;
  onSavedItemsChange?(items: SavedItem[]): void;
};

export type DiscoveryDecision = "save" | "skip";
export type DiscoveryCommitResult =
  | {
      decision: "save";
      confirmed: true;
      created: boolean;
      items: SavedItem[];
    }
  | {
      decision: DiscoveryDecision;
      confirmed: false;
      reason: "failed" | "noop" | "unconfirmed" | "unmounted";
    }
  | {
      decision: "skip";
      confirmed: true;
    };

const DEFAULT_DEPENDENCIES: DiscoveryControllerDependencies = {
  load: loadDiscovery,
  listSaved,
  addSaved,
  removeSaved,
};

const SAVE_ERROR = "Couldn't save that one. It's back in your deck.";
const UNDO_ERROR = "Couldn't undo that save. Try again.";
const UNDO_WINDOW_MS = 4_500;

type UndoTimer = {
  operationId: number;
  handle: ReturnType<typeof setTimeout>;
};

function copyItem(item: ResultItem): ResultItem {
  return { ...item };
}

function createRequestInput(
  category: ContentCategory,
  mode: DiscoveryActionMode,
  session: DiscoveryDeckState["sessions"][ContentCategory]
): DiscoveryLoadInput {
  if (mode === "search") {
    return Object.freeze({
      category,
      mode,
      query: session.searchQuery.trim(),
    });
  }
  if (mode === "filter") {
    return Object.freeze({
      category,
      mode,
      filters: Object.freeze([...session.selectedFilters]),
    });
  }
  return Object.freeze({ category, mode: "randomize" });
}

function copyRequestInput(input: DiscoveryLoadInput): DiscoveryLoadInput {
  if (input.mode === "search") {
    return Object.freeze({
      category: input.category,
      mode: "search",
      query: input.query.trim(),
    });
  }
  if (input.mode === "filter") {
    return Object.freeze({
      category: input.category,
      mode: "filter",
      filters: Object.freeze([...input.filters]),
    });
  }
  if (input.mode === "similar") {
    return Object.freeze({
      category: input.category,
      mode: "similar",
      seed: Object.freeze(copyItem(input.seed)),
    });
  }
  return Object.freeze({ category: input.category, mode: "randomize" });
}

function nextCardAnnouncement(prefix: string, nextItem: ResultItem | null): string {
  return nextItem
    ? `${prefix} New card: ${nextItem.title}.`
    : `${prefix} That's the end of this deck.`;
}

function errorName(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    typeof error.name === "string" &&
    error.name
  ) {
    return error.name;
  }
  return "UnknownError";
}

function containsSavedItem(
  items: readonly SavedItem[],
  operation: SaveOperation
): boolean {
  return items.some(
    (item) => item.category === operation.category && item.id === operation.item.id
  );
}

function savedMutationDependencies(
  dependencies: DiscoveryControllerDependencies
): SavedMutationDependencies {
  return {
    listSaved: dependencies.listSaved,
    addSaved: dependencies.addSaved,
    removeSaved: dependencies.removeSaved,
  };
}

export function useDiscoveryController(
  options: UseDiscoveryControllerOptions = {}
) {
  const [deckState, rawDispatch] = useReducer(
    discoveryDeckReducer,
    options.initialItems ?? {},
    createInitialDiscoveryDeckState
  );
  const [announcement, setAnnouncement] = useState("");

  const stateRef = useRef(deckState);
  const dependenciesRef = useRef(options.dependencies ?? DEFAULT_DEPENDENCIES);
  const onSavedItemsChangeRef = useRef(options.onSavedItemsChange);
  const requestTrackerRef = useRef(createDiscoveryRequestTracker());
  const saveOperationSequenceRef = useRef(0);
  const undoTimerRef = useRef<UndoTimer | null>(null);
  const undoInFlightRef = useRef(new Set<number>());
  const mountedRef = useRef(true);

  stateRef.current = deckState;
  dependenciesRef.current = options.dependencies ?? DEFAULT_DEPENDENCIES;
  onSavedItemsChangeRef.current = options.onSavedItemsChange;

  const dispatch = useCallback((action: DiscoveryDeckAction): boolean => {
    const previous = stateRef.current;
    const next = discoveryDeckReducer(previous, action);
    stateRef.current = next;
    rawDispatch(action);
    return next !== previous;
  }, []);

  const clearUndoTimer = useCallback((operationId?: number) => {
    const timer = undoTimerRef.current;
    if (!timer || (operationId !== undefined && timer.operationId !== operationId)) {
      return;
    }
    clearTimeout(timer.handle);
    undoTimerRef.current = null;
  }, []);

  const startUndoTimer = useCallback(
    (operationId: number) => {
      clearUndoTimer();
      const handle = setTimeout(() => {
        if (undoTimerRef.current?.operationId !== operationId) return;
        undoTimerRef.current = null;
        if (!mountedRef.current) return;
        dispatch({ type: "clearUndo", operationId });
      }, UNDO_WINDOW_MS);
      undoTimerRef.current = { operationId, handle };
    },
    [clearUndoTimer, dispatch]
  );

  const makeUndoRetryable = useCallback(
    (operation: SaveOperation) => {
      if (!mountedRef.current) return;
      dispatch({ type: "undoSaveFailed", operation, message: UNDO_ERROR });
      startUndoTimer(operation.id);
    },
    [dispatch, startUndoTimer]
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestTrackerRef.current.invalidate();
      clearUndoTimer();
    };
  }, [clearUndoTimer]);

  const runRequest = useCallback(
    async (requestedInput: DiscoveryLoadInput): Promise<void> => {
      const input = copyRequestInput(requestedInput);
      const request = requestTrackerRef.current.start(input.category);
      dispatch({ type: "requestStarted", request, input });

      try {
        const items = await dependenciesRef.current.load(input);
        if (!mountedRef.current || !requestTrackerRef.current.isCurrent(request)) {
          return;
        }
        dispatch({
          type: "requestSucceeded",
          request,
          input,
          items: [...items],
        });
        if (input.mode === "similar") {
          setAnnouncement(`Showing picks similar to ${input.seed.title}.`);
        }
      } catch (error) {
        if (!mountedRef.current || !requestTrackerRef.current.isCurrent(request)) {
          return;
        }
        console.warn({
          category: input.category,
          mode: input.mode,
          errorName: errorName(error),
        });
        dispatch({
          type: "requestFailed",
          request,
          message: toDiscoveryError(input.category),
        });
      }
    },
    [dispatch]
  );

  const selectCategory = useCallback(
    (category: ContentCategory) => {
      if (stateRef.current.selected === category) return;
      requestTrackerRef.current.invalidate();
      dispatch({ type: "selectCategory", category });
    },
    [dispatch]
  );

  const setAction = useCallback(
    (action: DiscoveryActionMode) => {
      const category = stateRef.current.selected;
      if (!category) return;
      dispatch({ type: "setActiveAction", category, action });
    },
    [dispatch]
  );

  const setQuery = useCallback(
    (query: string) => {
      const category = stateRef.current.selected;
      if (!category) return;
      dispatch({ type: "setSearchQuery", category, query });
    },
    [dispatch]
  );

  const setOpenSection = useCallback(
    (section: string | null) => {
      const category = stateRef.current.selected;
      if (!category) return;
      dispatch({ type: "setOpenSection", category, section });
    },
    [dispatch]
  );

  const toggleFilter = useCallback(
    (value: string) => {
      const category = stateRef.current.selected;
      if (!category) return;
      dispatch({ type: "toggleFilter", category, value });
    },
    [dispatch]
  );

  const clearFilters = useCallback(() => {
    const category = stateRef.current.selected;
    if (!category) return;
    dispatch({ type: "clearFilters", category });
  }, [dispatch]);

  const submit = useCallback(
    async (mode: DiscoveryActionMode): Promise<void> => {
      const category = stateRef.current.selected;
      if (!category) return;
      const session = stateRef.current.sessions[category];
      await runRequest(createRequestInput(category, mode, session));
    },
    [runRequest]
  );

  const retry = useCallback(async (): Promise<void> => {
    const category = stateRef.current.selected;
    if (!category) return;
    const retryInput = stateRef.current.sessions[category].retryInput;
    if (!retryInput || retryInput.category !== category) return;
    await runRequest(retryInput);
  }, [runRequest]);

  const commit = useCallback(
    async (
      item: ResultItem,
      decision: DiscoveryDecision
    ): Promise<DiscoveryCommitResult> => {
      const category = stateRef.current.selected;
      if (!category) return { decision, confirmed: false, reason: "noop" };
      const session = stateRef.current.sessions[category];
      if (activeDeckItem(session.deck)?.id !== item.id) {
        return { decision, confirmed: false, reason: "noop" };
      }

      const safeItem = copyItem(item);

      if (decision === "skip") {
        const nextItem = session.deck.queue[1] ?? null;
        const dismissed = dispatch({
          type: "skipCurrent",
          category,
          itemId: safeItem.id,
        });
        if (dismissed) {
          setAnnouncement(nextCardAnnouncement("Not for me.", nextItem));
        }
        return dismissed
          ? { decision: "skip", confirmed: true }
          : { decision: "skip", confirmed: false, reason: "noop" };
      }

      const operation: SaveOperation = {
        id: ++saveOperationSequenceRef.current,
        category,
        item: safeItem,
      };
      const dismissed = dispatch({ type: "saveStarted", operation });
      if (!dismissed) {
        return { decision: "save", confirmed: false, reason: "noop" };
      }

      let saveResult: SaveSavedItemResult;
      try {
        saveResult = await saveSavedItem(
          category,
          safeItem,
          savedMutationDependencies(dependenciesRef.current)
        );
      } catch {
        if (mountedRef.current) {
          clearUndoTimer();
          dispatch({ type: "saveFailed", operationId: operation.id, message: SAVE_ERROR });
        }
        return { decision: "save", confirmed: false, reason: "failed" };
      }

      if (!mountedRef.current) {
        return { decision: "save", confirmed: false, reason: "unmounted" };
      }
      if (!saveResult.confirmed) {
        clearUndoTimer();
        dispatch({ type: "saveFailed", operationId: operation.id, message: SAVE_ERROR });
        return {
          decision: "save",
          confirmed: false,
          reason: "unconfirmed",
        };
      }

      dispatch({
        type: "saveSucceeded",
        operationId: operation.id,
        undoable: saveResult.created,
      });
      onSavedItemsChangeRef.current?.(saveResult.items);
      if (stateRef.current.lastSave?.id === operation.id) {
        const nextItem = activeDeckItem(
          stateRef.current.sessions[operation.category].deck
        );
        setAnnouncement(nextCardAnnouncement(`Saved ${safeItem.title}.`, nextItem));
        startUndoTimer(operation.id);
      } else {
        clearUndoTimer();
      }
      return {
        decision: "save",
        confirmed: true,
        created: saveResult.created,
        items: saveResult.items,
      };
    },
    [clearUndoTimer, dispatch, startUndoTimer]
  );

  const similar = useCallback(
    async (item: ResultItem): Promise<void> => {
      const category = stateRef.current.selected;
      if (!category) return;
      await runRequest({
        category,
        mode: "similar",
        seed: copyItem(item),
      });
    },
    [runRequest]
  );

  const undo = useCallback(async (): Promise<void> => {
    const operation = stateRef.current.lastSave;
    if (!operation || undoInFlightRef.current.has(operation.id)) return;

    undoInFlightRef.current.add(operation.id);
    dispatch({ type: "clearActionError" });
    clearUndoTimer(operation.id);
    let savedItems: SavedItem[];
    try {
      savedItems = await removeSavedItem(
        operation.category,
        operation.item.id,
        savedMutationDependencies(dependenciesRef.current)
      );
    } catch {
      undoInFlightRef.current.delete(operation.id);
      makeUndoRetryable(operation);
      return;
    }
    undoInFlightRef.current.delete(operation.id);

    if (!mountedRef.current) return;
    if (containsSavedItem(savedItems, operation)) {
      makeUndoRetryable(operation);
      return;
    }

    const restored = dispatch({ type: "undoSave", operation });
    if (!restored) return;
    clearUndoTimer(operation.id);
    onSavedItemsChangeRef.current?.(savedItems);
    setAnnouncement(`${operation.item.title} returned to your deck.`);
  }, [clearUndoTimer, dispatch, makeUndoRetryable]);

  const clearActionError = useCallback(() => {
    dispatch({ type: "clearActionError" });
  }, [dispatch]);

  const state = deckState;
  const session = state.selected ? state.sessions[state.selected] : null;
  const activeItem = session ? activeDeckItem(session.deck) : null;

  return {
    state,
    session,
    activeItem,
    announcement,
    actionErrorAnnouncement: state.actionError,
    selectCategory,
    setAction,
    setQuery,
    setOpenSection,
    toggleFilter,
    clearFilters,
    submit,
    retry,
    commit,
    similar,
    undo,
    clearActionError,
  };
}
