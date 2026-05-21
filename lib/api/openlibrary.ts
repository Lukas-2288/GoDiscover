import type { BookDetail, ResultItem } from '../../types/content';

const BASE_URL = 'https://openlibrary.org';
const COVER_BASE = 'https://covers.openlibrary.org/b/id';

type OLSearchDoc = {
  key: string;
  title: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  subject?: string[];
  ratings_average?: number;
};

type OLSearchResponse = {
  docs: OLSearchDoc[];
  numFound: number;
};

type OLWork = {
  key: string;
  title: string;
  description?: string | { value: string };
  subjects?: string[];
  covers?: number[];
  first_publish_date?: string;
};

type OLAuthor = { name: string };

function coverUrl(id?: number, size: 'M' | 'L' = 'L') {
  return id ? `${COVER_BASE}/${id}-${size}.jpg` : undefined;
}

function workId(key: string): string {
  return key.replace('/works/', '');
}

async function ol<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Open Library ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

function toResultItem(doc: OLSearchDoc): ResultItem {
  const author = doc.author_name?.[0] ?? 'Unknown author';
  const year = doc.first_publish_year ? String(doc.first_publish_year) : '—';
  const rating = doc.ratings_average ? `★ ${doc.ratings_average.toFixed(1)}` : year;
  return {
    id: workId(doc.key),
    title: doc.title,
    subtitle: author,
    meta: rating,
    imageUrl: coverUrl(doc.cover_i, 'M'),
  };
}

export async function searchBooks(query: string): Promise<ResultItem[]> {
  if (!query.trim()) return [];
  const data = await ol<OLSearchResponse>('/search.json', {
    q: query,
    limit: 5,
    fields: 'key,title,author_name,first_publish_year,cover_i,ratings_average',
  });
  return data.docs.slice(0, 5).map(toResultItem);
}

const RANDOM_SUBJECTS = [
  'fiction', 'fantasy', 'science_fiction', 'mystery', 'romance',
  'biography', 'history', 'philosophy', 'thriller', 'horror',
];

export async function randomBooks(): Promise<ResultItem[]> {
  const subject = RANDOM_SUBJECTS[Math.floor(Math.random() * RANDOM_SUBJECTS.length)];
  const offset = Math.floor(Math.random() * 100);
  const data = await ol<OLSearchResponse>('/search.json', {
    subject,
    limit: 20,
    offset,
    sort: 'rating',
    fields: 'key,title,author_name,first_publish_year,cover_i,ratings_average',
  });
  const withCovers = data.docs.filter((d) => d.cover_i);
  const shuffled = [...withCovers].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 5).map(toResultItem);
}

export type BookFilterParams = {
  subjects?: string[];
  yearFrom?: number;
  yearTo?: number;
  minRating?: number;
};

export async function filterBooks(params: BookFilterParams): Promise<ResultItem[]> {
  const qParts: string[] = [];
  if (params.subjects?.length) {
    qParts.push(`(${params.subjects.map((s) => `subject:"${s}"`).join(' OR ')})`);
  }
  if (params.yearFrom && params.yearTo) {
    qParts.push(`first_publish_year:[${params.yearFrom} TO ${params.yearTo}]`);
  } else if (params.yearFrom) {
    qParts.push(`first_publish_year:[${params.yearFrom} TO 2099]`);
  }
  const q = qParts.join(' AND ') || '*:*';
  const data = await ol<OLSearchResponse>('/search.json', {
    q,
    limit: 20,
    sort: 'rating',
    fields: 'key,title,author_name,first_publish_year,cover_i,ratings_average',
  });
  let docs = data.docs.filter((d) => d.cover_i);
  if (params.minRating) {
    docs = docs.filter((d) => (d.ratings_average ?? 0) >= params.minRating!);
  }
  return docs.slice(0, 5).map(toResultItem);
}

export async function getBookDetail(id: string, fallback?: { title: string; imageUrl?: string }): Promise<BookDetail> {
  const work = await ol<OLWork>(`/works/${id}.json`);
  const authorKeys = ((work as any).authors ?? [])
    .map((a: any) => a.author?.key)
    .filter(Boolean) as string[];
  const authors = await Promise.all(
    authorKeys.slice(0, 3).map((k) => ol<OLAuthor>(`${k}.json`).then((a) => a.name).catch(() => ''))
  );
  const description =
    typeof work.description === 'string'
      ? work.description
      : work.description?.value ?? '';
  const year = work.first_publish_date ? parseInt(work.first_publish_date.slice(0, 4), 10) : undefined;
  return {
    id,
    title: work.title ?? fallback?.title ?? '',
    authors: authors.filter(Boolean),
    firstPublishYear: isNaN(year as number) ? undefined : year,
    subjects: (work.subjects ?? []).slice(0, 6),
    description,
    coverUrl: coverUrl(work.covers?.[0], 'L') ?? fallback?.imageUrl,
  };
}

export async function getSimilarBooks(id: string): Promise<ResultItem[]> {
  const work = await ol<OLWork>(`/works/${id}.json`);
  const subjects = (work.subjects ?? [])
    .filter((s) => s.length < 30 && !s.includes(',') && !/^\d/.test(s))
    .slice(0, 3);
  if (subjects.length === 0) return [];
  const subjectQuery = subjects
    .map((s) => `subject:"${s.toLowerCase()}"`)
    .join(' OR ');
  const data = await ol<OLSearchResponse>('/search.json', {
    q: `(${subjectQuery})`,
    limit: 20,
    sort: 'rating',
    fields: 'key,title,author_name,first_publish_year,cover_i,ratings_average',
  });
  return data.docs
    .filter((d) => d.cover_i && workId(d.key) !== id)
    .slice(0, 10)
    .map(toResultItem);
}

export const OL_SUBJECTS: Record<string, string> = {
  Fiction: 'fiction',
  'Non-Fiction': 'nonfiction',
  'Mystery / Thriller': 'mystery',
  'Sci-Fi': 'science_fiction',
  Fantasy: 'fantasy',
  Romance: 'romance',
  'Historical Fiction': 'historical_fiction',
  'Biography / Memoir': 'biography',
  'Self-Help': 'self-help',
  Horror: 'horror',
  'Young Adult': 'young_adult_fiction',
  'Literary Fiction': 'literary_fiction',
  'Graphic Novel': 'graphic_novel',
};
