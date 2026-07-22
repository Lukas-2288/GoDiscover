import type { ContentCategory, ResultItem } from "../../types/content";
import {
  addSaved,
  listSaved,
  removeSaved,
  type SavedItem,
} from "./saved";

export const SAVED_MUTATION_ERROR =
  "Couldn't update saved discoveries. Try again.";

export type SavedMutationDependencies = {
  listSaved?(): Promise<SavedItem[]>;
  addSaved(category: ContentCategory, item: ResultItem): Promise<SavedItem[]>;
  removeSaved(category: ContentCategory, id: string): Promise<SavedItem[]>;
};

export type SaveSavedItemResult = {
  items: SavedItem[];
  confirmed: boolean;
  created: boolean;
};

const DEFAULT_DEPENDENCIES: SavedMutationDependencies = {
  listSaved,
  addSaved,
  removeSaved,
};

let mutationTail: Promise<void> | null = null;

function hasKey(
  items: readonly SavedItem[],
  category: ContentCategory,
  id: string
): boolean {
  return items.some((item) => item.category === category && item.id === id);
}

export function runSavedMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const currentTail = mutationTail;
  let result: Promise<T>;
  try {
    result = currentTail === null ? mutation() : currentTail.then(mutation);
  } catch (error) {
    result = Promise.reject(error);
  }

  const nextTail = result.then(
    () => undefined,
    () => undefined
  );
  mutationTail = nextTail;
  void nextTail.then(() => {
    if (mutationTail === nextTail) mutationTail = null;
  });
  return result;
}

export function saveSavedItem(
  category: ContentCategory,
  item: ResultItem,
  dependencies: SavedMutationDependencies = DEFAULT_DEPENDENCIES
): Promise<SaveSavedItemResult> {
  return runSavedMutation(async () => {
    if (dependencies.listSaved) {
      const before = await dependencies.listSaved();
      if (hasKey(before, category, item.id)) {
        return { items: before, confirmed: true, created: false };
      }
    }

    const items = await dependencies.addSaved(category, item);
    return {
      items,
      confirmed: hasKey(items, category, item.id),
      created: true,
    };
  });
}

export function removeSavedItem(
  category: ContentCategory,
  id: string,
  dependencies: SavedMutationDependencies = DEFAULT_DEPENDENCIES
): Promise<SavedItem[]> {
  return runSavedMutation(() => dependencies.removeSaved(category, id));
}

export function toggleSavedItem(
  category: ContentCategory,
  item: ResultItem,
  dependencies: SavedMutationDependencies = DEFAULT_DEPENDENCIES
): Promise<SavedItem[]> {
  return runSavedMutation(async () => {
    if (!dependencies.listSaved) {
      throw new Error("Saved-item listing is required to toggle a saved item");
    }
    const current = await dependencies.listSaved();
    return hasKey(current, category, item.id)
      ? dependencies.removeSaved(category, item.id)
      : dependencies.addSaved(category, item);
  });
}
