import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, renderHook, waitFor } from "@testing-library/react-native";

import type { ContentCategory, ResultItem } from "../../../types/content";
import {
  loadDiscovery,
  type DiscoveryProviderRegistry,
} from "../../../lib/discovery/loadDiscovery";
import type { DiscoveryLoadContext } from "../../../lib/discovery/types";
import { listRejections } from "../../../lib/storage/rejections";
import { useDiscoveryController } from "../useDiscoveryController";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("../../../lib/supabase", () => ({
  supabase: {
    auth: { getSession: jest.fn(async () => ({ data: { session: null } })) },
  },
}));

jest.mock("../../../lib/storage/saved", () => ({
  listSaved: jest.fn(async () => []),
  addSaved: jest.fn(async () => []),
  removeSaved: jest.fn(async () => []),
}));

/**
 * The unit suites cover each piece alone. These exercise the real stack —
 * controller, reducer, loadDiscovery, similarity ladder and rejection storage —
 * against the behaviours that were actually reported: the deck dead-ending
 * after five swipes, "Not for me" changing nothing, and Similar repeating.
 *
 * Only the provider is faked, standing in for the HTTP call.
 */
const PAGE_SIZE = 5;

type CatalogueEntry = ResultItem & { page: number };

function catalogue(
  prefix: string,
  count: number,
  traitsFor: (index: number) => string[]
): CatalogueEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index}`,
    title: `${prefix} ${index}`,
    subtitle: "",
    meta: "",
    traits: traitsFor(index),
    page: Math.floor(index / PAGE_SIZE) + 1,
  }));
}

/**
 * Stands in for a paginated provider. `random` honours the page cursor and,
 * like TMDB's `without_genres`, drops damped traits in the query itself rather
 * than leaving it to the post-filter.
 */
function makeProviders(entries: CatalogueEntry[]) {
  const calls: DiscoveryLoadContext[] = [];
  const provider = {
    search: jest.fn(async () => entries.slice(0, PAGE_SIZE)),
    random: jest.fn(async (context: DiscoveryLoadContext = {}) => {
      calls.push(context);
      const damped = new Set(context.dampedTraits ?? []);
      const eligible = entries.filter(
        (entry) => !entry.traits?.some((trait) => damped.has(trait))
      );
      const page = context.page ?? 1;
      return eligible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    }),
    filter: jest.fn(async (_filters: readonly string[], context: DiscoveryLoadContext = {}) => {
      const page = context.page ?? 1;
      return entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    }),
    similar: jest.fn(async () => []),
  };
  const registry = {
    movies: provider,
    books: provider,
    artists: provider,
    albums: provider,
  } as unknown as DiscoveryProviderRegistry;
  return { registry, provider, calls };
}

function controllerWith(registry: DiscoveryProviderRegistry) {
  return renderHook(() =>
    useDiscoveryController({
      dependencies: {
        load: (input, context) => loadDiscovery(input, registry, context),
        addSaved: jest.fn(async () => []),
        removeSaved: jest.fn(async () => []),
      },
    })
  );
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe("discovery flow end to end", () => {
  // The original report: keep pressing "Not for me" on books and the deck
  // dead-ends with "THE CABINET IS QUIET" after about five cards.
  it("survives fifteen consecutive skips without emptying the deck", async () => {
    const entries = catalogue("book", 60, () => ["Fiction"]);
    const { registry } = makeProviders(entries);
    const { result } = controllerWith(registry);

    act(() => result.current.selectCategory("books"));
    await act(async () => {
      await result.current.submit("randomize");
    });
    await waitFor(() => expect(result.current.activeItem).not.toBeNull());

    const seen: string[] = [];
    for (let swipe = 0; swipe < 15; swipe += 1) {
      const card = result.current.activeItem;
      expect(card).not.toBeNull();
      seen.push(card!.id);
      await act(async () => {
        await result.current.commit(card!, "skip");
      });
      // Let any background top-up land before reading the next card.
      await waitFor(() => expect(result.current.activeItem).not.toBeNull());
    }

    expect(new Set(seen).size).toBe(15);
    expect(result.current.deckExhausted).toBe(false);
    expect(result.current.activeItem).not.toBeNull();
  });

  it("stops offering a genre once it has been rejected enough times", async () => {
    // The first three cards are Action; the rest of the catalogue is not, so
    // damping Action still leaves plenty to offer.
    const entries = catalogue("movie", 60, (index) =>
      index < 3 ? ["Action"] : ["Documentary"]
    );
    const { registry, calls } = makeProviders(entries);
    const { result } = controllerWith(registry);

    act(() => result.current.selectCategory("movies"));
    await act(async () => {
      await result.current.submit("randomize");
    });
    await waitFor(() => expect(result.current.activeItem).not.toBeNull());

    for (let swipe = 0; swipe < 3; swipe += 1) {
      const card = result.current.activeItem!;
      expect(card.traits).toContain("Action");
      await act(async () => {
        await result.current.commit(card, "skip");
      });
      await waitFor(() => expect(result.current.activeItem).not.toBeNull());
    }

    // A fresh request now has to carry the damping.
    await act(async () => {
      await result.current.submit("randomize");
    });
    await waitFor(() => expect(result.current.activeItem).not.toBeNull());

    expect(calls.at(-1)?.dampedTraits).toContain("Action");
    const queue = result.current.session?.deck.queue ?? [];
    expect(queue.length).toBeGreaterThan(0);
    for (const card of queue) {
      expect(card.traits ?? []).not.toContain("Action");
    }
  });

  it("never shows a rejected title again, even after a fresh request", async () => {
    const entries = catalogue("movie", 40, () => ["Drama"]);
    const { registry } = makeProviders(entries);
    const { result } = controllerWith(registry);

    act(() => result.current.selectCategory("movies"));
    await act(async () => {
      await result.current.submit("randomize");
    });
    await waitFor(() => expect(result.current.activeItem).not.toBeNull());

    const rejectedId = result.current.activeItem!.id;
    await act(async () => {
      await result.current.commit(result.current.activeItem!, "skip");
    });

    await act(async () => {
      await result.current.submit("randomize");
    });
    await waitFor(() => expect(result.current.activeItem).not.toBeNull());

    const queue = result.current.session?.deck.queue ?? [];
    expect(queue.map((card) => card.id)).not.toContain(rejectedId);
  });

  // Undo has to unwind both halves: the card returns *and* stops being excluded.
  it("brings a mis-tapped card back and lets it be offered again", async () => {
    const entries = catalogue("movie", 40, () => ["Drama"]);
    const { registry } = makeProviders(entries);
    const { result } = controllerWith(registry);

    act(() => result.current.selectCategory("movies"));
    await act(async () => {
      await result.current.submit("randomize");
    });
    await waitFor(() => expect(result.current.activeItem).not.toBeNull());

    const mistake = result.current.activeItem!;
    await act(async () => {
      await result.current.commit(mistake, "skip");
    });
    await waitFor(() =>
      expect(listRejections(null)).resolves.toHaveLength(1)
    );

    await act(async () => {
      await result.current.undoSkip();
    });

    expect(result.current.activeItem?.id).toBe(mistake.id);
    await waitFor(() => expect(listRejections(null)).resolves.toEqual([]));

    // And it is genuinely offerable again, not just back on this deck.
    await act(async () => {
      await result.current.submit("randomize");
    });
    await waitFor(() => expect(result.current.activeItem).not.toBeNull());
    expect(
      (result.current.session?.deck.queue ?? []).map((card) => card.id)
    ).toContain(mistake.id);
  });

  it("widens Similar through the tiers rather than repeating one page", async () => {
    const seed: ResultItem = {
      id: "seed",
      title: "Seed",
      subtitle: "",
      meta: "",
      traits: ["Action", "Sci-Fi"],
    };
    const entries = catalogue("movie", 40, () => ["Documentary"]);
    const { registry, provider } = makeProviders(entries);
    // Provider-native similars run out immediately, forcing the descent.
    provider.similar = jest.fn(async () => []);

    const { result } = controllerWith(registry);
    act(() => result.current.selectCategory("movies"));
    await act(async () => {
      await result.current.similar(seed);
    });
    await waitFor(() => expect(result.current.activeItem).not.toBeNull());

    const context = result.current.session?.deck.similarContext;
    expect(context?.sourceTitle).toBe("Seed");
    // It reached a wider rung instead of returning nothing or looping.
    expect(context?.tier).toBeDefined();
    expect(context?.tier).not.toBe("close");
    expect(result.current.session?.deck.queue.length).toBeGreaterThan(0);
  });

  it("reports honest exhaustion when the catalogue really is finished", async () => {
    // Exactly one page and nothing more.
    const entries = catalogue("movie", PAGE_SIZE, () => ["Drama"]);
    const { registry } = makeProviders(entries);
    const { result } = controllerWith(registry);

    act(() => result.current.selectCategory("movies"));
    await act(async () => {
      await result.current.submit("randomize");
    });
    await waitFor(() => expect(result.current.activeItem).not.toBeNull());

    // Draw the queue down far enough to trigger a top-up, which is the only
    // thing that can prove the catalogue is finished.
    for (let swipe = 0; swipe < 3; swipe += 1) {
      const card = result.current.activeItem!;
      await act(async () => {
        await result.current.commit(card, "skip");
      });
      await act(async () => {
        await Promise.resolve();
      });
    }

    await waitFor(() => expect(result.current.deckExhausted).toBe(true));
    // Exhausted is not the same as empty — the cards already fetched remain.
    expect(result.current.activeItem).not.toBeNull();
  });
});
