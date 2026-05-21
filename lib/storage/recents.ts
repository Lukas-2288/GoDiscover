import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ContentCategory, ResultItem } from '../../types/content';

export type RecentItem = ResultItem & {
  category: ContentCategory;
  viewedAt: number;
};

const STORAGE_KEY = 'godiscover:recent-items:v1';
const MAX_ITEMS = 12;

function key(category: ContentCategory, id: string): string {
  return `${category}:${id}`;
}

async function read(): Promise<RecentItem[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function write(items: RecentItem[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export async function listRecents(): Promise<RecentItem[]> {
  return read();
}

export async function addRecent(
  category: ContentCategory,
  item: ResultItem
): Promise<RecentItem[]> {
  const list = await read();
  const filtered = list.filter((r) => key(r.category, r.id) !== key(category, item.id));
  const next: RecentItem[] = [
    { ...item, category, viewedAt: Date.now() },
    ...filtered,
  ].slice(0, MAX_ITEMS);
  await write(next);
  return next;
}

export async function clearRecents(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
