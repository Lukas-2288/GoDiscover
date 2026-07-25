import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ContentCategory, ResultItem } from '../../types/content';
import { supabase } from '../supabase';

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

async function getUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

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

  const anonymous = await readLocal(null);
  let anonymousUploadConfirmed = anonymous.length === 0;
  if (anonymous.length > 0) {
    const { error } = await supabase
      .from('saved_items')
      .upsert(anonymous.map((item) => itemToRow(ownerId, item)), {
        onConflict: 'user_id,category,item_id',
        ignoreDuplicates: true,
      });
    anonymousUploadConfirmed = !error;
  }

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
  if (anonymousUploadConfirmed && anonymous.length > 0) {
    await AsyncStorage.removeItem(SAVED_ANONYMOUS_STORAGE_KEY);
  }
  return items;
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
