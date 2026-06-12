import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ContentCategory, ResultItem } from '../../types/content';
import { supabase } from '../supabase';

export type SavedItem = ResultItem & {
  category: ContentCategory;
  savedAt: number;
};

const STORAGE_KEY = 'godiscover:saved-items:v1';

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

async function readLocal(): Promise<SavedItem[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeLocal(items: SavedItem[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function sortNewestFirst(items: SavedItem[]): SavedItem[] {
  return [...items].sort((a, b) => b.savedAt - a.savedAt);
}

function key(category: ContentCategory, id: string): string {
  return `${category}:${id}`;
}

export async function listSaved(): Promise<SavedItem[]> {
  const userId = await getUserId();
  if (!userId) return sortNewestFirst(await readLocal());
  // No `.eq('user_id', userId)` filter here on purpose — Supabase RLS
  // enforces per-user isolation at the DB level. See supabase/rls.sql.
  // If you turn off RLS, this query will leak every user's saved items.
  const { data, error } = await supabase
    .from('saved_items')
    .select('category,item_id,title,subtitle,meta,image_url,saved_at')
    .order('saved_at', { ascending: false });
  if (error) return sortNewestFirst(await readLocal());
  const items = (data as DbRow[]).map(rowToItem);
  await writeLocal(items);
  return items;
}

export async function addSaved(
  category: ContentCategory,
  item: ResultItem
): Promise<SavedItem[]> {
  const userId = await getUserId();
  const local = await readLocal();
  const exists = local.some((i) => key(i.category, i.id) === key(category, item.id));
  if (!exists) {
    const saved: SavedItem = {
      ...item,
      category,
      savedAt: Date.now(),
    };
    const next = [...local, saved];
    await writeLocal(next);
  }
  if (userId) {
    const { error } = await supabase.from('saved_items').upsert(
      {
        user_id: userId,
        category,
        item_id: item.id,
        title: item.title,
        subtitle: item.subtitle ?? '',
        meta: item.meta ?? '',
        image_url: item.imageUrl ?? null,
      },
      { onConflict: 'user_id,category,item_id' }
    );
    if (__DEV__ && error) console.warn('saved_items upsert failed', error.message);
    return listSaved();
  }
  return sortNewestFirst(await readLocal());
}

export async function removeSaved(
  category: ContentCategory,
  id: string
): Promise<SavedItem[]> {
  const userId = await getUserId();
  const local = await readLocal();
  const next = local.filter((i) => key(i.category, i.id) !== key(category, id));
  await writeLocal(next);
  if (userId) {
    const { error } = await supabase
      .from('saved_items')
      .delete()
      .eq('category', category)
      .eq('item_id', id);
    if (__DEV__ && error) console.warn('saved_items delete failed', error.message);
    return listSaved();
  }
  return sortNewestFirst(next);
}

export async function clearLocalSaved(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

export async function syncLocalToCloud(): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;
  const local = await readLocal();
  if (local.length === 0) return;
  const rows = local.map((i) => ({
    user_id: userId,
    category: i.category,
    item_id: i.id,
    title: i.title,
    subtitle: i.subtitle ?? '',
    meta: i.meta ?? '',
    image_url: i.imageUrl ?? null,
  }));
  const { error } = await supabase
    .from('saved_items')
    .upsert(rows, { onConflict: 'user_id,category,item_id', ignoreDuplicates: true });
  if (__DEV__ && error) console.warn('saved_items bulk sync failed', error.message);
}
