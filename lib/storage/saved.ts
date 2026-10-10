import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ContentCategory, ResultItem } from '../../types/content';
import { supabase } from '../supabase';
import {
  assertOwnerUnchanged,
  createClaimQueue,
  getActiveOwnerId,
} from './owner';

export type SavedItem = ResultItem & {
  category: ContentCategory;
  savedAt: number;
};

export const LEGACY_SAVED_STORAGE_KEY = 'godiscover:saved-items:v1';
const SAVED_STORAGE_PREFIX = 'godiscover:saved-items:v2';
const SAVED_LEGACY_MIGRATION_KEY =
  'godiscover:saved-items:v2:legacy-migrated';
export const SAVED_ANONYMOUS_STORAGE_KEY =
  `${SAVED_STORAGE_PREFIX}:anonymous`;

type DbRow = {
  category: ContentCategory;
  item_id: string;
  title: string;
  subtitle: string;
  meta: string;
  image_url: string | null;
  saved_at: string;
};

function rowToItem(r: DbRow): SavedItem {
  return {
    id: r.item_id,
    category: r.category,
    title: r.title,
    subtitle: r.subtitle,
    meta: r.meta,
    imageUrl: r.image_url ?? undefined,
    savedAt: new Date(r.saved_at).getTime(),
  };
}

const getUserId = getActiveOwnerId;

/**
 * Raised when the signed-in account changed while an operation was in flight.
 * The operation is abandoned rather than completed against whoever is now
 * active — an Undo raised under owner A must not delete owner B's copy of the
 * same item, and owner A's results must never be published as owner B's.
 *
 * Aliased from the shared `owner` module so existing imports keep working.
 */
export { OwnerChangedError as SavedOwnerChangedError } from './owner';

// The anonymous bucket is one shared resource that any sign-in wants to claim.
// Serializing claims keeps two overlapping hydrations from uploading the same
// signed-out saves into two different accounts.
const claimAnonymousBucket = createClaimQueue();

export function savedStorageKeyForOwner(ownerId: string): string {
  return `${SAVED_STORAGE_PREFIX}:owner:${encodeURIComponent(ownerId)}`;
}

function storageKey(ownerId: string | null): string {
  return ownerId
    ? savedStorageKeyForOwner(ownerId)
    : SAVED_ANONYMOUS_STORAGE_KEY;
}

async function readLocal(ownerId: string | null): Promise<SavedItem[]> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(ownerId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeLocal(
  ownerId: string | null,
  items: readonly SavedItem[]
): Promise<void> {
  await AsyncStorage.setItem(storageKey(ownerId), JSON.stringify(items));
}

function sortNewestFirst(items: SavedItem[]): SavedItem[] {
  return [...items].sort((a, b) => b.savedAt - a.savedAt);
}

function key(category: ContentCategory, id: string): string {
  return `${category}:${id}`;
}

function mergeSavedItems(
  ...collections: readonly (readonly SavedItem[])[]
): SavedItem[] {
  const merged = new Map<string, SavedItem>();
  for (const items of collections) {
    for (const item of items) {
      const itemKey = key(item.category, item.id);
      const previous = merged.get(itemKey);
      if (!previous || item.savedAt > previous.savedAt) {
        merged.set(itemKey, item);
      }
    }
  }
  return sortNewestFirst([...merged.values()]);
}

async function migrateLegacySavedItems(
  ownerId: string | null
): Promise<void> {
  if (await AsyncStorage.getItem(SAVED_LEGACY_MIGRATION_KEY)) return;

  const legacy = await AsyncStorage.getItem(LEGACY_SAVED_STORAGE_KEY);
  if (legacy) {
    try {
      const parsed = JSON.parse(legacy);
      if (Array.isArray(parsed)) {
        const current = await readLocal(ownerId);
        await writeLocal(ownerId, mergeSavedItems(current, parsed as SavedItem[]));
        await AsyncStorage.removeItem(LEGACY_SAVED_STORAGE_KEY);
      }
    } catch {
      // Keep malformed legacy data recoverable under its original key.
    }
  }
  await AsyncStorage.setItem(SAVED_LEGACY_MIGRATION_KEY, '1');
}

function itemToRow(
  userId: string,
  item: SavedItem | (ResultItem & { category: ContentCategory })
) {
  return {
    user_id: userId,
    category: item.category,
    item_id: item.id,
    title: item.title,
    subtitle: item.subtitle ?? '',
    meta: item.meta ?? '',
    image_url: item.imageUrl ?? null,
  };
}

export async function listSaved(): Promise<SavedItem[]> {
  const userId = await getUserId();
  return listSavedForOwner(userId);
}

export async function listSavedForOwner(
  ownerId: string | null
): Promise<SavedItem[]> {
  await migrateLegacySavedItems(ownerId);
  if (!ownerId) return sortNewestFirst(await readLocal(null));

  const activeUserId = await getUserId();
  if (activeUserId !== ownerId) {
    return sortNewestFirst(await readLocal(ownerId));
  }

  // Read and upload the anonymous bucket under a single claim so two
  // overlapping hydrations cannot both push the same signed-out saves — either
  // into two different accounts, or twice into this one.
  const { anonymous, anonymousUploadConfirmed } = await claimAnonymousBucket(
    async () => {
      const pending = await readLocal(null);
      if (pending.length === 0) {
        return { anonymous: pending, anonymousUploadConfirmed: true };
      }
      // The claim may have waited behind another hydration; make sure this
      // owner is still the active one before uploading their data to it.
      const activeDuringClaim = await getUserId();
      if (activeDuringClaim !== ownerId) {
        return { anonymous: pending, anonymousUploadConfirmed: false };
      }
      const { error } = await supabase
        .from('saved_items')
        .upsert(pending.map((item) => itemToRow(ownerId, item)), {
          onConflict: 'user_id,category,item_id',
          ignoreDuplicates: true,
        });
      if (!error) {
        // Retire the bucket inside the claim so a queued hydration observes it
        // as already taken rather than re-reading and re-uploading it.
        await AsyncStorage.removeItem(SAVED_ANONYMOUS_STORAGE_KEY);
      }
      return { anonymous: pending, anonymousUploadConfirmed: !error };
    }
  );

  const { data, error } = await supabase
    .from('saved_items')
    .select('category,item_id,title,subtitle,meta,image_url,saved_at')
    .order('saved_at', { ascending: false });
  if (error) {
    return mergeSavedItems(await readLocal(ownerId), anonymous);
  }

  const items = mergeSavedItems(
    (data as DbRow[]).map(rowToItem),
    anonymousUploadConfirmed ? [] : anonymous
  );
  await writeLocal(ownerId, items);
  // The anonymous bucket was already retired inside the claim above.
  return items;
}

/**
 * Save on behalf of a specific owner. The owner is bound by the caller at the
 * moment the user acted, and revalidated after every await, so a mid-flight
 * account switch aborts instead of writing owner A's item into owner B.
 */
export async function addSavedForOwner(
  ownerId: string | null,
  category: ContentCategory,
  item: ResultItem
): Promise<SavedItem[]> {
  await assertOwnerUnchanged(ownerId);
  await migrateLegacySavedItems(ownerId);
  await assertOwnerUnchanged(ownerId);
  const local = await readLocal(ownerId);
  await assertOwnerUnchanged(ownerId);

  const exists = local.some(
    (i) => key(i.category, i.id) === key(category, item.id)
  );
  const saved: SavedItem = {
    ...item,
    category,
    savedAt: exists
      ? local.find(
          (candidate) => key(candidate.category, candidate.id) === key(category, item.id)
        )!.savedAt
      : Date.now(),
  };
  const next = exists ? local : [...local, saved];

  if (ownerId) {
    const { error } = await supabase.from('saved_items').upsert(
      itemToRow(ownerId, { ...item, category }),
      { onConflict: 'user_id,category,item_id' }
    );
    if (error) throw new Error('saved_items upsert failed');
    // The write may have landed after the account changed; do not publish it.
    await assertOwnerUnchanged(ownerId);
  }
  await writeLocal(ownerId, next);
  return sortNewestFirst(next);
}

/**
 * Remove on behalf of a specific owner. Undo relies on this: the owner is the
 * one that created the save, not whoever happens to be signed in when Undo
 * fires, so an Undo cannot delete a different account's copy of the same item.
 */
export async function removeSavedForOwner(
  ownerId: string | null,
  category: ContentCategory,
  id: string
): Promise<SavedItem[]> {
  await assertOwnerUnchanged(ownerId);
  await migrateLegacySavedItems(ownerId);
  await assertOwnerUnchanged(ownerId);
  const local = await readLocal(ownerId);
  await assertOwnerUnchanged(ownerId);

  const next = local.filter((i) => key(i.category, i.id) !== key(category, id));
  if (ownerId) {
    const { error } = await supabase
      .from('saved_items')
      .delete()
      .eq('category', category)
      .eq('item_id', id);
    if (error) throw new Error('saved_items delete failed');
    await assertOwnerUnchanged(ownerId);
    const anonymous = (await readLocal(null)).filter(
      (item) => key(item.category, item.id) !== key(category, id)
    );
    await assertOwnerUnchanged(ownerId);
    if (anonymous.length === 0) {
      await AsyncStorage.removeItem(SAVED_ANONYMOUS_STORAGE_KEY);
    } else {
      await writeLocal(null, anonymous);
    }
  }
  await writeLocal(ownerId, next);
  return sortNewestFirst(next);
}

export async function addSaved(
  category: ContentCategory,
  item: ResultItem
): Promise<SavedItem[]> {
  const userId = await getUserId();
  await migrateLegacySavedItems(userId);
  const local = await readLocal(userId);
  const exists = local.some((i) => key(i.category, i.id) === key(category, item.id));
  const saved: SavedItem = {
    ...item,
    category,
    savedAt: exists
      ? local.find((candidate) => key(candidate.category, candidate.id) === key(category, item.id))!.savedAt
      : Date.now(),
  };
  const next = exists ? local : [...local, saved];
  if (userId) {
    const { error } = await supabase.from('saved_items').upsert(
      itemToRow(userId, { ...item, category }),
      { onConflict: 'user_id,category,item_id' }
    );
    if (error) throw new Error('saved_items upsert failed');
  }
  await writeLocal(userId, next);
  return sortNewestFirst(next);
}

export async function removeSaved(
  category: ContentCategory,
  id: string
): Promise<SavedItem[]> {
  const userId = await getUserId();
  await migrateLegacySavedItems(userId);
  const local = await readLocal(userId);
  const next = local.filter((i) => key(i.category, i.id) !== key(category, id));
  if (userId) {
    const { error } = await supabase
      .from('saved_items')
      .delete()
      .eq('category', category)
      .eq('item_id', id);
    if (error) throw new Error('saved_items delete failed');
    const anonymous = (await readLocal(null)).filter(
      (item) => key(item.category, item.id) !== key(category, id)
    );
    if (anonymous.length === 0) {
      await AsyncStorage.removeItem(SAVED_ANONYMOUS_STORAGE_KEY);
    } else {
      await writeLocal(null, anonymous);
    }
  }
  await writeLocal(userId, next);
  return sortNewestFirst(next);
}

export async function clearLocalSaved(): Promise<void> {
  await AsyncStorage.removeItem(SAVED_ANONYMOUS_STORAGE_KEY);
}

export async function syncLocalToCloud(): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;
  await listSavedForOwner(userId);
}
