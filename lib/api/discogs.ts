import type { AlbumDetail, ArtistDetail, ResultItem } from '../../types/content';
import { cachedRequest } from './requestCache';
import { similarArtistNames, stripDiscogsSuffix } from './lastfm';
import { toPlainText } from './richText';

const TOKEN = process.env.EXPO_PUBLIC_DISCOGS_TOKEN;
const API_BASE = 'https://api.discogs.com';
const UA = 'GoDiscover/1.0';

async function discogs<T>(
  path: string,
  params: Record<string, string | number | undefined> = {}
): Promise<T> {
  if (!TOKEN) throw new Error('Discogs token not set');
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  const url = qs ? `${API_BASE}${path}?${qs}` : `${API_BASE}${path}`;
  return cachedRequest(`discogs:${url}`, async () => {
    const res = await fetch(url, {
      headers: {
        Authorization: `Discogs token=${TOKEN}`,
        'User-Agent': UA,
      },
    });
    if (!res.ok) throw new Error(`Discogs ${res.status}: ${await res.text()}`);
    return res.json() as Promise<T>;
  });
}

type SearchReleaseItem = {
  id: number;
  title: string;
  year?: number | string;
  thumb?: string;
  cover_image?: string;
  genre?: string[];
  style?: string[];
  uri?: string;
  master_id?: number;
  type: string;
};
type SearchArtistItem = {
  id: number;
  title: string;
  thumb?: string;
  cover_image?: string;
  uri?: string;
  type: string;
};
type SearchResponse<T> = { results: T[] };

function parseTitle(title: string): { artist: string; album: string } {
  const idx = title.indexOf(' - ');
  if (idx === -1) return { artist: 'Various', album: title };
  return { artist: title.slice(0, idx).trim(), album: title.slice(idx + 3).trim() };
}

function cleanImage(url?: string): string | undefined {
  if (!url) return undefined;
  if (url.includes('spacer.gif')) return undefined;
  return url;
}

export function releaseToResult(r: SearchReleaseItem): ResultItem {
  const { artist, album } = parseTitle(r.title);
  return {
    id: String(r.id),
    title: album,
    subtitle: artist,
    meta: r.year ? String(r.year) : '—',
    imageUrl: cleanImage(r.cover_image || r.thumb),
    traits: musicTraits(r.genre, r.style),
  };
}

/**
 * Discogs returns its own genre and style vocabularies ("Funk / Soul",
 * "Heavy Metal"). Fold both back onto the filter labels via the existing
 * DISCOGS_GENRE_MAP so a rejected album damps the same label the UI offers.
 */
export function musicTraits(
  genres?: string[],
  styles?: string[]
): string[] | undefined {
  const labels = new Set<string>();
  for (const [label, mapping] of Object.entries(DISCOGS_GENRE_MAP)) {
    const styleMatches = mapping.style
      ? styles?.some((style) => style === mapping.style)
      : false;
    // A genre-only mapping matches on genre alone; a mapping that names a style
    // needs that style too, so "Rock" does not silently claim every metal or
    // indie release.
    const genreMatches = mapping.genre
      ? genres?.some((genre) => genre === mapping.genre)
      : false;
    if (mapping.style ? styleMatches : genreMatches) labels.add(label);
  }
  return labels.size > 0 ? [...labels] : undefined;
}

function artistItemToResult(a: SearchArtistItem): ResultItem {
  return {
    id: String(a.id),
    title: a.title,
    subtitle: 'Artist',
    meta: '',
    imageUrl: cleanImage(a.cover_image || a.thumb),
  };
}

const DISCOGS_GENRE_MAP: Record<string, { genre?: string; style?: string }> = {
  Pop: { genre: 'Pop' },
  Rock: { genre: 'Rock' },
  'Hip-Hop / Rap': { genre: 'Hip Hop' },
  'R&B / Soul': { genre: 'Funk / Soul' },
  'Electronic / EDM': { genre: 'Electronic' },
  Country: { genre: 'Folk, World, & Country', style: 'Country' },
  Jazz: { genre: 'Jazz' },
  Classical: { genre: 'Classical' },
  Metal: { genre: 'Rock', style: 'Heavy Metal' },
  'Indie / Alternative': { genre: 'Rock', style: 'Indie Rock' },
  Latin: { genre: 'Latin' },
  'K-Pop': { genre: 'Pop', style: 'K-Pop' },
  Folk: { genre: 'Folk, World, & Country', style: 'Folk' },
  Reggae: { genre: 'Reggae' },
  Blues: { genre: 'Blues' },
};

// Identity map so index.tsx can keep passing UI labels through unchanged.
export const SPOTIFY_GENRE_MAP: Record<string, string> = Object.fromEntries(
  Object.keys(DISCOGS_GENRE_MAP).map((k) => [k, k])
);

export type MusicFilterParams = {
  genres?: string[];
  yearFrom?: number;
  yearTo?: number;
  page?: number;
  deterministic?: boolean;
};

function stableResultOrder(
  left: SearchReleaseItem,
  right: SearchReleaseItem
): number {
  return (
    String(left.title).localeCompare(String(right.title)) ||
    String(left.id).localeCompare(String(right.id))
  );
}

/**
 * How many selected genres a music search will actually honour.
 *
 * Discogs' search takes one `genre` and one `style` and has no OR, so a
 * multi-genre selection has to become several requests. Three is where the
 * fan-out stops earning its cost.
 */
export const MAX_MUSIC_GENRE_QUERIES = 3;

/**
 * One Discogs genre/style pair per selected label.
 *
 * `resolveGenreStyle` returns on the *first* label it recognises, which meant
 * choosing Jazz, Metal and Reggae searched Jazz alone while all three chips sat
 * lit on screen. Two of the three did nothing, and nothing said so.
 */
export function resolveGenreStyles(
  labels: readonly string[]
): { genre?: string; style?: string }[] {
  const seen = new Set<string>();
  const resolved: { genre?: string; style?: string }[] = [];
  for (const label of labels) {
    const match = DISCOGS_GENRE_MAP[label];
    if (!match) continue;
    // Metal and Indie both map onto genre Rock with different styles, so the
    // pair is the identity, not the genre.
    const key = `${match.genre ?? ''}|${match.style ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    resolved.push(match);
    if (resolved.length === MAX_MUSIC_GENRE_QUERIES) break;
  }
  return resolved;
}

/**
 * Interleaves the per-genre result lists rather than concatenating them.
 *
 * Concatenation would fill a five-card deck from the first genre alone, which
 * looks identical to the bug this replaces.
 */
function interleave<T>(lists: readonly T[][]): T[] {
  const out: T[] = [];
  const longest = Math.max(0, ...lists.map((list) => list.length));
  for (let index = 0; index < longest; index += 1) {
    for (const list of lists) {
      if (index < list.length) out.push(list[index]);
    }
  }
  return out;
}

function dedupeById(items: readonly SearchReleaseItem[]): SearchReleaseItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = String(item.id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildYear(params: MusicFilterParams): string | undefined {
  if (params.yearFrom && params.yearTo) return `${params.yearFrom}-${params.yearTo}`;
  if (params.yearFrom) return String(params.yearFrom);
  return undefined;
}

export type EraWindow = {
  yearFrom: number;
  yearTo: number;
  weight: number;
};

/**
 * Decade windows for unfiltered randomise: four decades, evenly weighted, from
 * 1990.
 *
 * Discogs is a record-collector catalogue: its `master` releases skew heavily
 * towards the vinyl era, and randomAlbums/randomArtists previously sent no
 * `year` at all, so Discogs' own ordering picked — and it kept picking the 70s
 * to 90s. Asking for an explicit decade is what puts recent music back in
 * rotation. An explicit Era filter still overrides all of this.
 *
 * "Even across every decade" sounds neutral but is not: with 1960 as the floor
 * there are four decades before 2000 and only two-and-a-bit after, so equal
 * weights would put ~57% of picks in the last century — more old music than the
 * lopsided weights this replaces (~41%), and the opposite of what was wanted.
 * Starting at 1990 is genuinely even *and* lands pre-2000 at 25%.
 *
 * Move `yearFrom` on the first entry to retune; nothing else needs to change.
 */
export const RANDOM_ERA_WINDOWS: readonly EraWindow[] = [
  { yearFrom: 1990, yearTo: 1999, weight: 1 },
  { yearFrom: 2000, yearTo: 2009, weight: 1 },
  { yearFrom: 2010, yearTo: 2019, weight: 1 },
  { yearFrom: 2020, yearTo: new Date().getFullYear(), weight: 1 },
];

/** Weighted pick over RANDOM_ERA_WINDOWS. `roll` is injectable for tests. */
export function pickRandomEraWindow(
  roll: () => number = Math.random,
  windows: readonly EraWindow[] = RANDOM_ERA_WINDOWS
): EraWindow {
  const total = windows.reduce((sum, window) => sum + window.weight, 0);
  let remaining = Math.min(Math.max(roll(), 0), 0.999_999_9) * total;
  for (const window of windows) {
    remaining -= window.weight;
    if (remaining < 0) return window;
  }
  return windows[windows.length - 1];
}

export async function searchAlbums(query: string): Promise<ResultItem[]> {
  if (!query.trim()) return [];
  const data = await discogs<SearchResponse<SearchReleaseItem>>('/database/search', {
    q: query,
    type: 'master',
    per_page: 10,
  });
  return (data.results ?? []).slice(0, 5).map(releaseToResult);
}

export async function searchArtists(query: string): Promise<ResultItem[]> {
  if (!query.trim()) return [];
  const data = await discogs<SearchResponse<SearchArtistItem>>('/database/search', {
    q: query,
    type: 'artist',
    per_page: 10,
  });
  return (data.results ?? []).slice(0, 5).map(artistItemToResult);
}

export type RandomMusicParams = { page?: number };

export type FreshMusicParams = {
  page?: number;
  /** Injectable so a test can pin the window without mocking the clock. */
  now?: Date;
};

/**
 * Years a music deck will accept as "new".
 *
 * Two, not one. Discogs is a catalogue built by contributors, so a release is
 * listed when somebody gets round to entering it — asking only for the current
 * year returns almost nothing each January, and thin results for months after.
 */
function freshMusicYears(now: Date): number[] {
  const year = now.getFullYear();
  return [year, year - 1];
}

/** Master releases from the current year, falling back a year when thin. */
async function freshMasters(
  params: FreshMusicParams,
  perPage: number
): Promise<SearchReleaseItem[]> {
  const page = params.page ?? 1;
  for (const year of freshMusicYears(params.now ?? new Date())) {
    const data = await discogs<SearchResponse<SearchReleaseItem>>(
      '/database/search',
      { type: 'master', year: String(year), per_page: perPage, page }
    );
    if (data.results?.length) return data.results;
  }
  return [];
}

export async function freshAlbums(
  params: FreshMusicParams = {}
): Promise<ResultItem[]> {
  const results = await freshMasters(params, 20);
  return results.slice(0, 5).map(releaseToResult);
}

export async function freshArtists(
  params: FreshMusicParams = {}
): Promise<ResultItem[]> {
  const results = await freshMasters(params, 50);
  const candidates = artistNameCandidates(
    results,
    5 * ARTIST_CANDIDATE_MULTIPLIER
  );
  const artists = await artistsByName(candidates, { requireMatch: true });
  return artists.slice(0, 5);
}

export async function randomAlbums(
  params: RandomMusicParams = {}
): Promise<ResultItem[]> {
  const keys = Object.keys(DISCOGS_GENRE_MAP);
  const { genre, style } = DISCOGS_GENRE_MAP[keys[Math.floor(Math.random() * keys.length)]];
  const era = pickRandomEraWindow();
  // The deck's refill advances this. Without it every top-up asked for the
  // same page, dedup dropped everything, and the deck ran dry.
  const page = params.page ?? Math.floor(Math.random() * 5) + 1;
  const data = await discogs<SearchResponse<SearchReleaseItem>>('/database/search', {
    type: 'master',
    genre,
    style,
    year: `${era.yearFrom}-${era.yearTo}`,
    per_page: 20,
    page,
  });
  const items = data.results?.length
    ? data.results
    : (await discogs<SearchResponse<SearchReleaseItem>>('/database/search', {
        type: 'master',
        genre,
        style,
        year: `${era.yearFrom}-${era.yearTo}`,
        per_page: 20,
      })).results ?? [];
  return [...items].sort(() => Math.random() - 0.5).slice(0, 5).map(releaseToResult);
}

export async function randomArtists(
  params: RandomMusicParams = {}
): Promise<ResultItem[]> {
  const keys = Object.keys(DISCOGS_GENRE_MAP);
  const { genre, style } = DISCOGS_GENRE_MAP[keys[Math.floor(Math.random() * keys.length)]];
  // Artists are parsed out of master-release titles below, so without a year
  // this inherits the release catalogue's vinyl-era skew directly.
  const era = pickRandomEraWindow();
  const page = params.page ?? Math.floor(Math.random() * 5) + 1;
  let data = await discogs<SearchResponse<SearchReleaseItem>>('/database/search', {
    type: 'master',
    genre,
    style,
    year: `${era.yearFrom}-${era.yearTo}`,
    per_page: 50,
    page,
  });
  if (!data.results?.length) {
    data = await discogs<SearchResponse<SearchReleaseItem>>('/database/search', {
      type: 'master',
      genre,
      style,
      year: `${era.yearFrom}-${era.yearTo}`,
      per_page: 50,
    });
  }
  const candidates = artistNameCandidates(
    data.results ?? [],
    5 * ARTIST_CANDIDATE_MULTIPLIER
  );
  const artists = await artistsByName(candidates, { requireMatch: true });
  return artists.slice(0, 5);
}

/**
 * Master releases matching every selected genre and the chosen era.
 *
 * The era is never dropped. This used to retry without the `year` when a page
 * came back empty, so asking for the 80s could hand back 2015 records with
 * nothing to say it had given up — the same silent-widening failure that made
 * a 2025 single return a 1975 album. Retrying page one of the *same* era is
 * the honest version: fewer results, still the right decade.
 */
async function filteredMasters(
  params: MusicFilterParams,
  perPage: number
): Promise<SearchReleaseItem[]> {
  const year = buildYear(params);
  const page = params.page ?? Math.floor(Math.random() * 3) + 1;
  const genreQueries = resolveGenreStyles(params.genres ?? []);
  // No recognised genre still means "any genre in this era".
  const queries = genreQueries.length > 0 ? genreQueries : [{}];

  const lists = await Promise.all(
    queries.map(async ({ genre, style }) => {
      const base = { type: 'master' as const, genre, style, year, per_page: perPage };
      const data = await discogs<SearchResponse<SearchReleaseItem>>(
        '/database/search',
        { ...base, page }
      );
      if (data.results?.length) return data.results;
      // A deep page inside a narrow slice is often empty; page one rarely is.
      if (page === 1) return [];
      const first = await discogs<SearchResponse<SearchReleaseItem>>(
        '/database/search',
        base
      );
      return first.results ?? [];
    })
  );
  return dedupeById(interleave(lists));
}

export async function filterAlbums(params: MusicFilterParams): Promise<ResultItem[]> {
  const items = await filteredMasters(params, 20);
  return [...items]
    .sort(params.deterministic ? stableResultOrder : () => Math.random() - 0.5)
    .slice(0, 5)
    .map(releaseToResult);
}

export async function filterArtists(params: MusicFilterParams): Promise<ResultItem[]> {
  const results = await filteredMasters(params, 50);
  const artistSource = params.deterministic
    ? [...results].sort(stableResultOrder)
    : results;
  const candidates = artistNameCandidates(
    artistSource,
    5 * ARTIST_CANDIDATE_MULTIPLIER
  );
  const artists = await artistsByName(candidates, { requireMatch: true });
  return artists.slice(0, 5);
}

type ArtistInfo = {
  id: number;
  name: string;
  images?: { uri: string; uri150?: string }[];
  profile?: string;
  uri?: string;
};
type ArtistReleaseItem = {
  id: number;
  title: string;
  year?: number;
  thumb?: string;
  role?: string;
  type: string;
  artist?: string;
  main_release?: number;
};
type ArtistReleases = { releases: ArtistReleaseItem[] };

export async function getArtistDetail(id: string): Promise<ArtistDetail> {
  if (id.startsWith('name:')) {
    const name = decodeURIComponent(id.slice(5));
    const data = await discogs<SearchResponse<SearchArtistItem>>('/database/search', {
      q: name,
      type: 'artist',
      per_page: 1,
    });
    const first = data.results?.[0];
    if (!first) {
      return {
        id,
        name,
        imageUrl: undefined,
        albums: [],
        spotifyUrl: `https://www.discogs.com/search?q=${encodeURIComponent(name)}&type=artist`,
      };
    }
    return getArtistDetail(String(first.id));
  }
  const [artist, releases] = await Promise.all([
    discogs<ArtistInfo>(`/artists/${id}`),
    discogs<ArtistReleases>(`/artists/${id}/releases`, {
      sort: 'year',
      sort_order: 'desc',
      per_page: 25,
    }),
  ]);
  const mains = (releases.releases ?? []).filter(
    (r) => r.type === 'master' && r.role !== 'Appearance' && r.role !== 'TrackAppearance'
  );
  const seen = new Set<string>();
  const unique: ArtistReleaseItem[] = [];
  for (const r of mains) {
    const key = r.title.toLowerCase().replace(/\s*\(.*?\)\s*/g, '').trim();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(r);
  }
  let profileMetadata: {
    genres?: string[];
    styles?: string[];
    year?: number;
  } = {};
  if (unique[0]) {
    try {
      profileMetadata = await discogs<{
        genres?: string[];
        styles?: string[];
        year?: number;
      }>(`/masters/${unique[0].id}`);
    } catch {
      profileMetadata = {};
    }
  }
  return {
    id: String(artist.id),
    name: artist.name,
    imageUrl: cleanImage(artist.images?.[0]?.uri),
    albums: unique.slice(0, 8).map((r) => ({
      id: String(r.main_release ?? r.id),
      name: r.title,
      releaseDate: r.year ? String(r.year) : '',
      imageUrl: cleanImage(r.thumb),
    })),
    spotifyUrl:
      artist.uri ?? `https://www.discogs.com/artist/${artist.id}`,
    genres: profileMetadata.genres ?? [],
    styles: profileMetadata.styles ?? [],
    description: toPlainText(artist.profile),
    releaseYear: profileMetadata.year
      ? String(profileMetadata.year)
      : unique[0]?.year
        ? String(unique[0].year)
        : undefined,
  };
}

/**
 * A window of roughly a decade either side of the seed.
 *
 * Similar used to send no `year` at all, which put the entire Discogs
 * catalogue in range — and that catalogue is a vinyl-era archive. Sharing a
 * genre tag with something recorded fifty years earlier is not similarity.
 */
export function eraNeighbourhood(year?: number, span = 10): string | undefined {
  if (!year || !Number.isFinite(year)) return undefined;
  const now = new Date().getFullYear();
  return `${year - span}-${Math.min(year + span, now)}`;
}

/**
 * Narrowest query first, widening only when a rung comes back empty.
 *
 * `style` and `genre` used to be sent together, so a seed carrying no style
 * silently fell back to the whole genre bucket with nothing left to narrow it.
 * Ordering the attempts makes each widening deliberate and visible.
 */
function similarSearchAttempts(
  style: string | undefined,
  genre: string | undefined,
  year: string | undefined
): Record<string, string | number | undefined>[] {
  const narrow = style ? { style } : { genre };
  const attempts: Record<string, string | number | undefined>[] = [];
  if (year) attempts.push({ ...narrow, year });
  attempts.push({ ...narrow });
  if (style && genre) {
    if (year) attempts.push({ genre, year });
    attempts.push({ genre });
  }
  return attempts;
}

async function searchSimilarMasters(
  style: string | undefined,
  genre: string | undefined,
  year: string | undefined,
  perPage: number
): Promise<SearchReleaseItem[]> {
  for (const attempt of similarSearchAttempts(style, genre, year)) {
    const data = await discogs<SearchResponse<SearchReleaseItem>>(
      '/database/search',
      { type: 'master', per_page: perPage, ...attempt }
    );
    if (data.results?.length) return data.results;
  }
  return [];
}

/** One Discogs search per name, failures dropped rather than propagated. */
export async function mastersByArtistNames(
  names: readonly string[],
  perArtist: number
): Promise<SearchReleaseItem[]> {
  const found = await Promise.all(
    names.map(async (name) => {
      try {
        const data = await discogs<SearchResponse<SearchReleaseItem>>(
          '/database/search',
          { q: name, type: 'master', per_page: perArtist }
        );
        return data.results ?? [];
      } catch {
        return [];
      }
    })
  );
  return found.flat();
}

export type ArtistsByNameOptions = {
  /**
   * Drop names Discogs cannot resolve instead of falling back to a `name:` id.
   *
   * A caller browsing artists wants real artists — a name that resolves to
   * nothing is usually not an artist at all, which is exactly the junk the
   * deck used to be full of. A caller following a similarity edge would rather
   * show an unresolved name than a gap, so that path leaves this off.
   */
  requireMatch?: boolean;
  /** Per-artist `meta`, keyed by the name passed in. */
  metaByName?: ReadonlyMap<string, string>;
};

export async function artistsByName(
  names: readonly string[],
  options: ArtistsByNameOptions = {}
): Promise<ResultItem[]> {
  const found = await Promise.all(
    names.map(async (name) => {
      try {
        const data = await discogs<SearchResponse<SearchArtistItem>>(
          '/database/search',
          { q: name, type: 'artist', per_page: 1 }
        );
        return data.results?.[0];
      } catch {
        return undefined;
      }
    })
  );
  const out: ResultItem[] = [];
  const seen = new Set<string>();
  names.forEach((name, index) => {
    const match = found[index];
    if (seen.has(name.toLowerCase())) return;
    if (!match && options.requireMatch) return;
    seen.add(name.toLowerCase());
    out.push({
      id: match ? String(match.id) : `name:${encodeURIComponent(name)}`,
      // Last.fm's spelling is the one the user would recognise; Discogs adds
      // disambiguation suffixes like "Eden (5)".
      title: name,
      subtitle: 'Artist',
      meta: options.metaByName?.get(name) ?? '',
      imageUrl: match ? cleanImage(match.cover_image || match.thumb) : undefined,
    });
  });
  return out;
}

/**
 * Artist names worth resolving, taken from master-release titles.
 *
 * Discogs' `type=artist` search does not honour `genre` or `year` reliably, so
 * a genre- or era-constrained artist deck has to be sampled from releases and
 * resolved afterwards rather than queried directly.
 */
function artistNameCandidates(
  results: readonly SearchReleaseItem[],
  limit: number
): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const result of results) {
    const { artist } = parseTitle(result.title);
    // "Various" is a compilation credit, not an artist.
    const name = stripDiscogsSuffix(artist);
    if (!name || name === 'Various') continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
    if (names.length === limit) break;
  }
  return names;
}

/** Resolve twice the wanted count, since some names are not real artists. */
const ARTIST_CANDIDATE_MULTIPLIER = 2;

export async function getSimilarAlbums(
  id: string,
  options: { deterministic?: boolean } = {}
): Promise<ResultItem[]> {
  let release: ReleaseInfo;
  try {
    const master = await discogs<{ main_release: number }>(`/masters/${id}`);
    release = await discogs<ReleaseInfo>(`/releases/${master.main_release}`);
  } catch {
    release = await discogs<ReleaseInfo>(`/releases/${id}`);
  }
  const order = options.deterministic
    ? stableResultOrder
    : () => Math.random() - 0.5;
  const finish = (items: readonly SearchReleaseItem[]): ResultItem[] =>
    [...items]
      .filter((r) => String(r.id) !== id && r.cover_image)
      .sort(order)
      .slice(0, 10)
      .map(releaseToResult);

  // Last.fm knows Chappell Roan sits next to Sabrina Carpenter. Discogs only
  // knows they share a tag, which is how "The Giver" once came back with a 1975
  // trucker album. Prefer the source that has an actual opinion; without a key
  // this returns nothing and the tag search below runs exactly as before.
  const seedArtist = release.artists?.[0]?.name;
  if (seedArtist) {
    const neighbours = await similarArtistNames(seedArtist, 6);
    if (neighbours.length > 0) {
      const seedTitle = release.title?.trim().toLowerCase();
      const byNeighbour = (await mastersByArtistNames(neighbours, 3)).filter(
        (r) => parseTitle(r.title).album.trim().toLowerCase() !== seedTitle
      );
      const items = finish(byNeighbour);
      // A thin result is worse than a broad one; fall through if it did not
      // find enough to fill a rung.
      if (items.length >= 3) return items;
    }
  }

  const style = release.styles?.[0];
  const genre = release.genres?.[0];
  if (!style && !genre) return [];
  return finish(
    await searchSimilarMasters(
      style,
      genre,
      eraNeighbourhood(release.year),
      30
    )
  );
}

export async function getSimilarArtists(id: string): Promise<ResultItem[]> {
  let artistName: string;
  if (id.startsWith('name:')) {
    artistName = decodeURIComponent(id.slice(5));
    const search = await discogs<SearchResponse<SearchArtistItem>>('/database/search', {
      q: artistName,
      type: 'artist',
      per_page: 1,
    });
    if (!search.results?.[0]) return [];
    const realId = String(search.results[0].id);
    return getSimilarArtists(realId);
  }
  const artist = await discogs<ArtistInfo>(`/artists/${id}`);
  artistName = artist.name;

  // Same reasoning as albums: listening data beats a shared genre tag.
  const neighbours = await similarArtistNames(artistName, 10);
  if (neighbours.length > 0) {
    const resolved = await artistsByName(neighbours);
    if (resolved.length >= 3) return resolved.slice(0, 10);
  }

  const releases = await discogs<ArtistReleases>(`/artists/${id}/releases`, {
    sort: 'year',
    sort_order: 'desc',
    per_page: 5,
  });
  const firstRelease = (releases.releases ?? []).find((r) => r.type === 'master');
  if (!firstRelease) return [];
  let style: string | undefined;
  let genre: string | undefined;
  let year: number | undefined = firstRelease.year;
  try {
    const master = await discogs<{
      main_release: number;
      styles?: string[];
      genres?: string[];
      year?: number;
    }>(`/masters/${firstRelease.id}`);
    style = master.styles?.[0];
    genre = master.genres?.[0];
    year = master.year ?? year;
  } catch {
    return [];
  }
  if (!style && !genre) return [];
  const results = await searchSimilarMasters(
    style,
    genre,
    eraNeighbourhood(year),
    50
  );
  const seen = new Set<string>([stripDiscogsSuffix(artistName).toLowerCase()]);
  const out: ResultItem[] = [];
  for (const r of results) {
    const { artist: a } = parseTitle(r.title);
    const key = stripDiscogsSuffix(a).toLowerCase();
    if (a === 'Various' || seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: `name:${encodeURIComponent(a)}`,
      title: a,
      subtitle: 'Artist',
      meta: '',
      imageUrl: cleanImage(r.cover_image || r.thumb),
    });
    if (out.length === 10) break;
  }
  return out;
}

type ReleaseInfo = {
  id: number;
  title: string;
  artists: { name: string }[];
  year?: number;
  genres?: string[];
  styles?: string[];
  tracklist: { title: string; duration: string; position?: string; type_?: string }[];
  images?: { uri: string }[];
  uri?: string;
  community?: { have: number; want: number };
  formats?: { name: string }[];
};

function durationToMs(s: string): number {
  if (!s) return 0;
  const parts = s.split(':').map((p) => parseInt(p, 10));
  if (parts.some((n) => Number.isNaN(n))) return 0;
  if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
  return parts[0] * 1000;
}

export async function getAlbumDetail(id: string): Promise<AlbumDetail> {
  let release: ReleaseInfo;
  try {
    const master = await discogs<{ main_release: number }>(`/masters/${id}`);
    release = await discogs<ReleaseInfo>(`/releases/${master.main_release}`);
  } catch {
    release = await discogs<ReleaseInfo>(`/releases/${id}`);
  }
  const tracks = (release.tracklist ?? [])
    .filter((t) => !t.type_ || t.type_ === 'track')
    .map((t, i) => ({
      id: `${release.id}-${i}`,
      name: t.title,
      durationMs: durationToMs(t.duration),
    }));
  return {
    id: String(release.id),
    name: release.title,
    artists: release.artists.map((a) => a.name),
    releaseDate: release.year ? String(release.year) : '',
    totalTracks: tracks.length,
    albumType: (release.formats?.[0]?.name ?? 'Album').toLowerCase(),
    genres: [...(release.genres ?? []), ...(release.styles ?? [])],
    popularity: release.community?.have ?? 0,
    imageUrl: cleanImage(release.images?.[0]?.uri),
    tracks,
    spotifyUrl: release.uri ?? `https://www.discogs.com/release/${release.id}`,
  };
}
