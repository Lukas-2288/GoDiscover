import type { BookDetail, ResultItem } from '../../types/content';
import { cachedRequest } from './requestCache';
import { toPlainText } from './richText';

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
  return cachedRequest(`openlibrary:${url.pathname}?${url.searchParams.toString()}`, async () => {
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Open Library ${res.status}: ${await res.text()}`);
    return res.json() as Promise<T>;
  });
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
    imageUrl: coverUrl(doc.cover_i, 'L'),
    traits: bookTraits(doc.subject),
  };
}

// Open Library subjects are free text and a single work can carry hundreds, so
// only phrasings that map cleanly onto the filter vocabulary become traits.
// Matching is exact after normalisation — a substring rule would file every
// "Science fiction" under plain "Fiction" and make damping wrong rather than
// merely incomplete.
const OL_SUBJECT_ALIASES: Readonly<Record<string, string>> = {
  fiction: 'Fiction',
  nonfiction: 'Non-Fiction',
  non_fiction: 'Non-Fiction',
  mystery: 'Mystery / Thriller',
  detective_and_mystery_stories: 'Mystery / Thriller',
  thriller: 'Mystery / Thriller',
  science_fiction: 'Sci-Fi',
  fantasy: 'Fantasy',
  fantasy_fiction: 'Fantasy',
  romance: 'Romance',
  love_stories: 'Romance',
  historical_fiction: 'Historical Fiction',
  biography: 'Biography / Memoir',
  autobiography: 'Biography / Memoir',
  self_help: 'Self-Help',
  horror: 'Horror',
  horror_tales: 'Horror',
  young_adult_fiction: 'Young Adult',
  juvenile_fiction: 'Young Adult',
  literary_fiction: 'Literary Fiction',
  graphic_novel: 'Graphic Novel',
  comics_and_graphic_novels: 'Graphic Novel',
};

const MAX_BOOK_TRAITS = 4;

function bookTraits(subjects?: string[]): string[] | undefined {
  if (!subjects?.length) return undefined;
  const labels = new Set<string>();
  for (const subject of subjects) {
    const normalized = subject.trim().toLowerCase().replace(/[\s-]+/g, '_');
    const label = OL_SUBJECT_ALIASES[normalized];
    if (label) labels.add(label);
    if (labels.size === MAX_BOOK_TRAITS) break;
  }
  return labels.size > 0 ? [...labels] : undefined;
}

export async function searchBooks(query: string): Promise<ResultItem[]> {
  if (!query.trim()) return [];
  const data = await ol<OLSearchResponse>('/search.json', {
    q: query,
    limit: 5,
    fields: 'key,title,author_name,first_publish_year,cover_i,ratings_average,subject',
  });
  return data.docs.slice(0, 5).map(toResultItem);
}

const RANDOM_SUBJECTS = [
  'fiction', 'fantasy', 'science_fiction', 'mystery', 'romance',
  'biography', 'history', 'philosophy', 'thriller', 'horror',
];

export type RandomBookParams = {
  page?: number;
  withoutSubjects?: readonly string[];
};

const RANDOM_PAGE_SIZE = 20;

export async function randomBooks(
  params: RandomBookParams = {}
): Promise<ResultItem[]> {
  const available = params.withoutSubjects?.length
    ? RANDOM_SUBJECTS.filter(
        (subject) => !params.withoutSubjects!.some((damped) => OL_SUBJECTS[damped] === subject)
      )
    : RANDOM_SUBJECTS;
  // Damping must never empty the shelf; if every subject is damped, ignore it
  // and let the post-filter in loadDiscovery decide.
  const pool = available.length > 0 ? available : RANDOM_SUBJECTS;
  const subject = pool[Math.floor(Math.random() * pool.length)];
  // The deck tops up by advancing a page. Without this every refill re-fetched
  // the same window, dedup dropped the lot, and the deck died.
  const offset = params.page
    ? (params.page - 1) * RANDOM_PAGE_SIZE
    : Math.floor(Math.random() * 100);
  const data = await ol<OLSearchResponse>('/search.json', {
    subject,
    limit: RANDOM_PAGE_SIZE,
    offset,
    sort: 'rating',
    fields: 'key,title,author_name,first_publish_year,cover_i,ratings_average,subject',
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
  /** 1-based. Open Library paginates by offset, so this maps onto `offset`. */
  page?: number;
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
  const limit = 20;
  const data = await ol<OLSearchResponse>('/search.json', {
    q,
    limit,
    // The filtered path had no pagination at all, so a filtered deck served the
    // same handful of books on every refill and then went empty.
    offset: params.page ? (params.page - 1) * limit : 0,
    sort: 'rating',
    fields: 'key,title,author_name,first_publish_year,cover_i,ratings_average,subject',
  });
  let docs = data.docs.filter((d) => d.cover_i);
  if (params.minRating) {
    docs = docs.filter((d) => (d.ratings_average ?? 0) >= params.minRating!);
  }
  return docs.slice(0, 5).map(toResultItem);
}

export type FreshBookParams = {
  page?: number;
  /** Injectable so a test can pin the window without mocking the clock. */
  now?: Date;
};

const FRESH_PAGE_SIZE = 20;

/**
 * Recently published books.
 *
 * `sort=new` alone is not enough and is quietly misleading: it orders by when
 * the *record* was created, so it happily returns a 1946 novel catalogued last
 * Tuesday. Pairing it with a publication-year range is what makes the answer
 * mean "new book" rather than "new database row".
 */
export async function freshBooks(
  params: FreshBookParams = {}
): Promise<ResultItem[]> {
  const year = (params.now ?? new Date()).getFullYear();
  // Open Library's publication years are patchy and often lag, so last year
  // stays in scope rather than leaving January with an empty shelf.
  const data = await ol<OLSearchResponse>('/search.json', {
    q: `first_publish_year:[${year - 1} TO ${year}]`,
    limit: FRESH_PAGE_SIZE,
    offset: params.page ? (params.page - 1) * FRESH_PAGE_SIZE : 0,
    sort: 'new',
    fields: 'key,title,author_name,first_publish_year,cover_i,ratings_average,subject',
  });
  // A missing cover is the existing stand-in for a thin record, and new
  // entries are the thinnest of all.
  const withCovers = data.docs.filter((d) => d.cover_i);
  return withCovers.slice(0, 5).map(toResultItem);
}

export async function getBookDetail(id: string, fallback?: { title: string; imageUrl?: string }): Promise<BookDetail> {
  const work = await ol<OLWork>(`/works/${id}.json`);
  const authorKeys = ((work as any).authors ?? [])
    .map((a: any) => a.author?.key)
    .filter(Boolean) as string[];
  const authors = await Promise.all(
    authorKeys.slice(0, 3).map((k) => ol<OLAuthor>(`${k}.json`).then((a) => a.name).catch(() => ''))
  );
  // Open Library descriptions are HTML, and were reaching the screen as
  // literal `<p><i>…</i></p>`.
  const description = toPlainText(
    typeof work.description === 'string'
      ? work.description
      : work.description?.value
  );
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

/**
 * Whether two works have a subject in common, loosely enough to survive Open
 * Library's free-text cataloguing.
 *
 * Subjects there are not a controlled vocabulary: the same idea is filed as
 * "Science fiction", "Science fiction, American", "science-fiction" and
 * "Fiction, science fiction, general" across different records. An exact match
 * would call most genuine pairs unrelated, so containment either way is the
 * usable test.
 */
export function sharesSubject(
  seedSubjects: readonly string[],
  candidateSubjects: readonly string[] = []
): boolean {
  const seeds = usableSubjects(seedSubjects);
  if (seeds.length === 0) return false;
  const candidates = usableSubjects(candidateSubjects);
  // Containment only in the direction that widens a *specific* subject:
  // "science fiction" should match "science fiction, american". Allowing the
  // reverse would let a seed's broad subject swallow a candidate's precise
  // one, which is how everything ends up related to everything.
  return candidates.some((candidate) =>
    seeds.some((seed) => candidate === seed || candidate.startsWith(`${seed},`))
  );
}

/**
 * Subjects carried by so much of the catalogue that sharing one is no evidence
 * of anything.
 *
 * "Fiction" is the load-bearing case. Kindred lists it, and containment would
 * find it inside "Science fiction", "Historical fiction" and "Juvenile
 * fiction" — which is every novel, making the check vacuous. The same trap is
 * already documented above for traits, where exact matching is used for
 * exactly this reason.
 */
const OVERBROAD_SUBJECTS = new Set([
  'fiction',
  'nonfiction',
  'non-fiction',
  'literature',
  'general',
  'english',
  'american',
  'british',
  'classic',
  'classics',
  'novel',
  'novels',
  'reading',
  'books',
  'juvenile',
  'adult',
  'new york times bestseller',
]);

function usableSubjects(subjects: readonly string[] = []): string[] {
  return subjects
    .map((subject) =>
      subject
        .trim()
        .toLowerCase()
        // The same subject is filed both ways — "science fiction" on Kindred,
        // "science-fiction" on Project Hail Mary — and they are the same thing.
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
    )
    // Short tokens like "War" or "Art" match far too much to mean anything.
    .filter(
      (subject) => subject.length > 4 && !OVERBROAD_SUBJECTS.has(subject)
    );
}

export async function getSimilarBooks(id: string): Promise<ResultItem[]> {
  const work = await ol<OLWork>(`/works/${id}.json`);
  // Only subjects specific enough to be worth searching for. Kindred's list
  // opens with "Fiction", and a `subject:"fiction"` search returns the
  // catalogue — which is how a book recommendation stopped resembling its
  // seed.
  const subjects = usableSubjects(work.subjects)
    .filter((s) => s.length < 30 && !s.includes(','))
    .slice(0, 3);
  if (subjects.length === 0) return [];
  const subjectQuery = subjects.map((s) => `subject:"${s}"`).join(' OR ');
  const data = await ol<OLSearchResponse>('/search.json', {
    q: `(${subjectQuery})`,
    limit: 20,
    sort: 'rating',
    fields: 'key,title,author_name,first_publish_year,cover_i,ratings_average,subject',
  });
  const candidates = data.docs.filter(
    (d) => d.cover_i && workId(d.key) !== id
  );
  // `subject:` matching is fuzzy — a search for science fiction returns The
  // Two Towers, which carries no such subject. Asking the results themselves
  // is the only way to hold the promise the query was supposed to make.
  const related = candidates.filter((d) => sharesSubject(subjects, d.subject));
  // A thin deck of loose matches beats a dead end.
  const chosen = related.length > 0 ? related : candidates;
  return chosen.slice(0, 10).map(toResultItem);
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
