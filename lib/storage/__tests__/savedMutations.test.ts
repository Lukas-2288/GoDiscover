import type { ContentCategory, ResultItem } from "../../../types/content";
import type { SavedItem } from "../saved";
import {
  removeSavedItem,
  saveSavedItem,
  toggleSavedItem,
} from "../savedMutations";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("../../supabase", () => ({
  supabase: {
    auth: { getSession: jest.fn(async () => ({ data: { session: null } })) },
  },
}));

const arrival: ResultItem = {
  id: "arrival",
  title: "Arrival",
  subtitle: "2016",
  meta: "",
};

const contact: ResultItem = {
  id: "contact",
  title: "Contact",
  subtitle: "1997",
  meta: "",
};

function saved(item: ResultItem): SavedItem {
  return { ...item, category: "movies", savedAt: 1 };
}

function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

function memoryStorage(initial: SavedItem[]) {
  let items = [...initial];
  const addGate = deferred();
  const addSaved = jest.fn(
    async (category: ContentCategory, item: ResultItem): Promise<SavedItem[]> => {
      const snapshot = [...items];
      await addGate.promise;
      items = [...snapshot, { ...item, category, savedAt: 2 }];
      return [...items];
    }
  );
  const removeSaved = jest.fn(
    async (category: ContentCategory, id: string): Promise<SavedItem[]> => {
      const snapshot = [...items];
      items = snapshot.filter(
        (item) => item.category !== category || item.id !== id
      );
      return [...items];
    }
  );

  return {
    addGate,
    dependencies: {
      listSaved: jest.fn(async () => [...items]),
      addSaved,
      removeSaved,
    },
    items: () => items,
  };
}

it("serializes a controller Save with a stored-detail toggle", async () => {
  const storage = memoryStorage([saved(arrival)]);

  const save = saveSavedItem("movies", contact, storage.dependencies);
  await Promise.resolve();
  const toggle = toggleSavedItem("movies", arrival, storage.dependencies);

  expect(storage.dependencies.removeSaved).not.toHaveBeenCalled();
  storage.addGate.resolve();
  await Promise.all([save, toggle]);

  expect(storage.items().map((item) => item.id)).toEqual([contact.id]);
});

it("serializes a controller Save with a Saved-sheet removal", async () => {
  const storage = memoryStorage([saved(arrival)]);

  const save = saveSavedItem("movies", contact, storage.dependencies);
  await Promise.resolve();
  const removal = removeSavedItem("movies", arrival.id, storage.dependencies);

  expect(storage.dependencies.removeSaved).not.toHaveBeenCalled();
  storage.addGate.resolve();
  await Promise.all([save, removal]);

  expect(storage.items().map((item) => item.id)).toEqual([contact.id]);
});
