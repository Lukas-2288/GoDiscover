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
  SkipOperation,
} from "../../lib/discovery/deckState";
import { loadDiscovery, toDiscoveryError } from "../../lib/discovery/loadDiscovery";
import { createDiscoveryRequestTracker } from "../../lib/discovery/requestTracker";
import {
  SIMILAR_EXHAUSTED_MESSAGE,
  type SimilarTier,
} from "../../lib/discovery/similarTiers";
import {
  DEFAULT_SAVE_INTENT,
  contextForSaveIntent,
  requestForSaveIntent,
  type SaveIntent,
} from "../../lib/discovery/saveIntent";
import type {
  DiscoveryActionMode,
  DiscoveryLoadContext,
  DiscoveryLoadInput,
} from "../../lib/discovery/types";
import {
  dampedTraitsFor,
  listRejections,
  recordRejection,
  rejectedIdsFor,
  removeRejection,
  type Rejection,
} from "../../lib/storage/rejections";
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
  /**
   * Narrower than `typeof loadDiscovery`: the controller supplies the load
   * context as the second argument and never the provider registry, so the
   * real function still satisfies this while test doubles stay a two-argument
   * shape.
   */
  load: (
    input: DiscoveryLoadInput,
    context?: DiscoveryLoadContext
  ) => Promise<ResultItem[]>;
  listSaved?: typeof listSaved;
  addSaved: typeof addSaved;
  removeSaved: typeof removeSaved;
};

export type UseDiscoveryControllerOptions = {
  initialItems?: Partial<Record<ContentCategory, ResultItem[]>>;
  dependencies?: DiscoveryControllerDependencies;
  onSavedItemsChange?(items: SavedItem[]): void;
  /**
   * The signed-in account, or null when signed out. Saves record the owner that
   * created them so Undo can refuse to run against a different account.
   */
  ownerId?: string | null;
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
  // Drops the provider-registry argument so the default registry applies.
  load: (input, context) => loadDiscovery(input, undefined, context),
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

/**
 * Top up once the deck is down to its last couple of cards, so the fetch has
 * landed before the user swipes through them. Providers return five at a time,
 * so waiting for empty would show a gap on every fifth swipe.
 */
const TOP_UP_THRESHOLD = 2;

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
  const ownerIdRef = useRef(options.ownerId ?? null);
  const requestTrackerRef = useRef(createDiscoveryRequestTracker());
  const saveOperationSequenceRef = useRef(0);
  const skipOperationSequenceRef = useRef(0);
  const undoTimerRef = useRef<UndoTimer | null>(null);
  const undoInFlightRef = useRef(new Set<number>());
  const rejectionsRef = useRef<readonly Rejection[]>([]);
  const similarTierRef = useRef<{
    category: ContentCategory;
    tier: SimilarTier;
    exhausted: boolean;
  } | null>(null);
  // Remembered so the follow-up is one tap next time rather than a prompt on
  // every save.
  const lastSaveIntentRef = useRef<SaveIntent>(DEFAULT_SAVE_INTENT);
  const mountedRef = useRef(true);

  stateRef.current = deckState;
  dependenciesRef.current = options.dependencies ?? DEFAULT_DEPENDENCIES;
  onSavedItemsChangeRef.current = options.onSavedItemsChange;
  ownerIdRef.current = options.ownerId ?? null;

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

  // Rejections are the memory behind "Not for me". Reload them whenever the
  // account changes so one user's dislikes never shape another's deck.
  useEffect(() => {
    const ownerId = options.ownerId ?? null;
    let cancelled = false;
    listRejections(ownerId)
      .then((rejections) => {
        if (!cancelled) rejectionsRef.current = rejections;
      })
      .catch(() => {
        if (!cancelled) rejectionsRef.current = [];
      });
    return () => {
      cancelled = true;
    };
  }, [options.ownerId]);

  const buildLoadContext = useCallback(
    (category: ContentCategory, page?: number): DiscoveryLoadContext => {
      const rejections = rejectionsRef.current;
      const deck = stateRef.current.sessions[category].deck;
      return {
        rejectedIds: rejectedIdsFor(rejections, category),
        dampedTraits: dampedTraitsFor(rejections, category),
        presentIds: new Set(deck.queue.map((item) => item.id)),
        page,
        // Resume the ladder where it left off so a Similar top-up widens the
        // scope rather than re-requesting the closest matches.
        similarTier: deck.similarContext?.tier,
        onSimilarTier: (tier, exhausted) => {
          similarTierRef.current = { category, tier, exhausted };
        },
      };
    },
    []
  );

  const runRequest = useCallback(
    async (requestedInput: DiscoveryLoadInput): Promise<void> => {
      const input = copyRequestInput(requestedInput);
      const request = requestTrackerRef.current.start(input.category);
      dispatch({ type: "requestStarted", request, input });

      try {
        const items = await dependenciesRef.current.load(
          input,
          // A fresh request replaces the deck, so nothing is "present" yet.
          { ...buildLoadContext(input.category), presentIds: undefined }
        );
        if (!mountedRef.current || !requestTrackerRef.current.isCurrent(request)) {
          return;
        }
        const similar =
          similarTierRef.current?.category === input.category
            ? similarTierRef.current
            : null;
        dispatch({
          type: "requestSucceeded",
          request,
          input,
          items: [...items],
          similarTier: similar?.tier,
          similarExhausted: similar?.exhausted,
        });
        if (input.mode === "similar") {
          setAnnouncement(
            similar?.exhausted
              ? SIMILAR_EXHAUSTED_MESSAGE
              : `Showing picks similar to ${input.seed.title}.`
          );
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
    [buildLoadContext, dispatch]
  );

  /**
   * Fetches the next page and appends it, so the deck keeps going instead of
   * dead-ending after five swipes. Runs in the background: failures leave the
   * remaining cards untouched and are not surfaced, because the user did not
   * ask for this request.
   */
  const topUpDeck = useCallback(
    async (category: ContentCategory): Promise<void> => {
      const session = stateRef.current.sessions[category];
      const { deck, retryInput } = session;
      if (!retryInput || deck.toppingUp || deck.exhausted || deck.topUpBlocked) {
        return;
      }
      if (deck.queue.length > TOP_UP_THRESHOLD) return;
      if (session.status === "loading" || session.status === "error") return;
      if (session.activeRequest) return;

      const cursor = deck.cursor;
      dispatch({ type: "topUpStarted", category });
      try {
        const items = await dependenciesRef.current.load(
          copyRequestInput(retryInput),
          buildLoadContext(category, cursor)
        );
        if (!mountedRef.current) return;
        // A category switch or a new explicit request supersedes this.
        if (stateRef.current.selected !== category) {
          dispatch({ type: "topUpFailed", category });
          return;
        }
        dispatch({
          type: "deckToppedUp",
          category,
          items: [...items],
          cursor: cursor + 1,
        });
      } catch {
        if (mountedRef.current) dispatch({ type: "topUpFailed", category });
      }
    },
    [buildLoadContext, dispatch]
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
        const operation: SkipOperation = {
          id: ++skipOperationSequenceRef.current,
          category,
          item: safeItem,
          ownerId: ownerIdRef.current,
        };
        const dismissed = dispatch({
          type: "skipCurrent",
          category,
          itemId: safeItem.id,
          operation,
        });
        if (dismissed) {
          setAnnouncement(nextCardAnnouncement("Not for me.", nextItem));
          // Remembered so this title never returns and its genres lose weight.
          // Fire-and-forget: a storage failure must not block the swipe.
          void recordRejection(ownerIdRef.current, category, safeItem)
            .then((rejections) => {
              rejectionsRef.current = rejections;
            })
            .catch(() => undefined);
        }
        return dismissed
          ? { decision: "skip", confirmed: true }
          : { decision: "skip", confirmed: false, reason: "noop" };
      }

      const operation: SaveOperation = {
        id: ++saveOperationSequenceRef.current,
        category,
        item: safeItem,
        ownerId: ownerIdRef.current,
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

    // The account changed since this save. Removing now would delete the
    // current account's copy of an item they never saved here, so drop the
    // Undo instead of running it against the wrong owner.
    if ((operation.ownerId ?? null) !== ownerIdRef.current) {
      clearUndoTimer(operation.id);
      dispatch({ type: "clearUndo", operationId: operation.id });
      return;
    }

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

  /**
   * Puts back a card dismissed by mistake. The rejection is removed too —
   * otherwise the card returns while its exclusion keeps quietly steering
   * everything that follows.
   */
  const undoSkip = useCallback(async (): Promise<void> => {
    const operation = stateRef.current.lastSkip;
    if (!operation) return;
    // Same rule as save Undo: an action raised under one account must not be
    // applied to another's data.
    if ((operation.ownerId ?? null) !== ownerIdRef.current) {
      dispatch({ type: "clearSkipUndo", operationId: operation.id });
      return;
    }

    const restored = dispatch({ type: "undoSkip", operation });
    if (!restored) return;
    setAnnouncement(`${operation.item.title} returned to your deck.`);
    try {
      rejectionsRef.current = await removeRejection(
        operation.ownerId ?? null,
        operation.category,
        operation.item.id
      );
    } catch {
      // The card is back either way; the stale rejection is corrected on the
      // next successful write rather than blocking the undo.
    }
  }, [dispatch]);

  /**
   * Follows a save in the direction the user asked for. "More like this" seeds
   * Similar; "Something different" stays in the category but steers away from
   * what was just saved, so liking one superhero film does not lock the deck to
   * superhero films.
   */
  const followSave = useCallback(
    async (item: ResultItem, intent: SaveIntent): Promise<void> => {
      const category = stateRef.current.selected;
      if (!category) return;
      lastSaveIntentRef.current = intent;

      const input = copyRequestInput(requestForSaveIntent(category, item, intent));
      const request = requestTrackerRef.current.start(category);
      dispatch({ type: "requestStarted", request, input });
      try {
        const items = await dependenciesRef.current.load(
          input,
          contextForSaveIntent(item, intent, {
            ...buildLoadContext(category),
            presentIds: undefined,
          })
        );
        if (!mountedRef.current || !requestTrackerRef.current.isCurrent(request)) {
          return;
        }
        const similar =
          similarTierRef.current?.category === category
            ? similarTierRef.current
            : null;
        dispatch({
          type: "requestSucceeded",
          request,
          input,
          items: [...items],
          similarTier: similar?.tier,
          similarExhausted: similar?.exhausted,
        });
      } catch (error) {
        if (!mountedRef.current || !requestTrackerRef.current.isCurrent(request)) {
          return;
        }
        console.warn({
          category,
          mode: input.mode,
          errorName: errorName(error),
        });
        dispatch({
          type: "requestFailed",
          request,
          message: toDiscoveryError(category),
        });
      }
    },
    [buildLoadContext, dispatch]
  );

  const clearActionError = useCallback(() => {
    dispatch({ type: "clearActionError" });
  }, [dispatch]);

  const state = deckState;
  const session = state.selected ? state.sessions[state.selected] : null;
  const activeItem = session ? activeDeckItem(session.deck) : null;

  // Keep the queue stocked as the user works through it. Depends on the queue
  // length rather than each swipe so a save, a skip and a restored card all
  // trigger the same check.
  const selectedCategory = state.selected;
  const remaining = session?.deck.queue.length ?? 0;
  const canTopUp = Boolean(
    session &&
      session.retryInput &&
      !session.deck.exhausted &&
      !session.deck.toppingUp &&
      !session.deck.topUpBlocked &&
      session.status !== "loading" &&
      // A failed explicit request already surfaced an error and a Retry; adding
      // background attempts on top would hammer a provider that is clearly down.
      session.status !== "error"
  );
  useEffect(() => {
    if (!selectedCategory || !canTopUp) return;
    if (remaining > TOP_UP_THRESHOLD) return;
    void topUpDeck(selectedCategory);
  }, [canTopUp, remaining, selectedCategory, topUpDeck]);

  return {
    state,
    session,
    activeItem,
    /** True once a top-up came back empty — the archive really is finished. */
    deckExhausted: session?.deck.exhausted ?? false,
    /**
     * True when a background refill failed and the deck is out of cards. Held
     * separately from `deckExhausted` because it is recoverable: the archive is
     * not finished, the last request just did not come back. Without this the
     * screen matched no render branch at all and simply went dead.
     */
    deckStalled:
      (session?.deck.topUpBlocked ?? false) &&
      (session?.deck.queue.length ?? 0) === 0,
    lastSkip: state.lastSkip,
    undoSkip,
    followSave,
    lastSaveIntent: lastSaveIntentRef.current,
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
