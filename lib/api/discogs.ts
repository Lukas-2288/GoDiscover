import type { AlbumDetail, ArtistDetail, ResultItem } from '../../types/content';

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
  const res = await fetch(url, {
    headers: {
      Authorization: `Discogs token=${TOKEN}`,
      'User-Agent': UA,
    },
  });
  if (!res.ok) throw new Error(`Discogs ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
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

function releaseToResult(r: SearchReleaseItem): ResultItem {
  const { artist, album } = parseTitle(r.title);
  return {
    id: String(r.id),
    title: album,
    subtitle: artist,
    meta: r.year ? String(r.year) : '—',
    imageUrl: cleanImage(r.cover_image || r.thumb),
  };
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
};

function resolveGenreStyle(labels: string[]): { genre?: string; style?: string } {
  for (const l of labels) {
    const m = DISCOGS_GENRE_MAP[l];
    if (m) return m;
  }
  return {};
}

function buildYear(params: MusicFilterParams): string | undefined {
  if (params.yearFrom && params.yearTo) return `${params.yearFrom}-${params.yearTo}`;
  if (params.yearFrom) return String(params.yearFrom);
  return undefined;
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

export async function randomAlbums(): Promise<ResultItem[]> {
  const keys = Object.keys(DISCOGS_GENRE_MAP);
  const { genre, style } = DISCOGS_GENRE_MAP[keys[Math.floor(Math.random() * keys.length)]];
  const page = Math.floor(Math.random() * 10) + 1;
  const data = await discogs<SearchResponse<SearchReleaseItem>>('/database/search', {
    type: 'master',
    genre,
    style,
    per_page: 20,
    page,
  });
  const items = data.results ?? [];
  return [...items].sort(() => Math.random() - 0.5).slice(0, 5).map(releaseToResult);
}

export async function randomArtists(): Promise<ResultItem[]> {
  const keys = Object.keys(DISCOGS_GENRE_MAP);
  const { genre, style } = DISCOGS_GENRE_MAP[keys[Math.floor(Math.random() * keys.length)]];
  const page = Math.floor(Math.random() * 10) + 1;
  const data = await discogs<SearchResponse<SearchReleaseItem>>('/database/search', {
    type: 'master',
    genre,
    style,
    per_page: 50,
    page,
  });
  const seen = new Set<string>();
  const out: ResultItem[] = [];
  for (const r of data.results ?? []) {
    const { artist } = parseTitle(r.title);
    if (artist === 'Various' || seen.has(artist.toLowerCase())) continue;
    seen.add(artist.toLowerCase());
    out.push({
      id: `name:${encodeURIComponent(artist)}`,
      title: artist,
      subtitle: 'Artist',
      meta: '',
      imageUrl: cleanImage(r.cover_image || r.thumb),
    });
    if (out.length === 5) break;
  }
  return out;
}

export async function filterAlbums(params: MusicFilterParams): Promise<ResultItem[]> {
  const { genre, style } = resolveGenreStyle(params.genres ?? []);
  const year = buildYear(params);
  const page = Math.floor(Math.random() * 3) + 1;
  const data = await discogs<SearchResponse<SearchReleaseItem>>('/database/search', {
    type: 'master',
    genre,
    style,
    year,
    per_page: 20,
    page,
  });
  let items = data.results ?? [];
  if (items.length === 0 && year) {
    const fallback = await discogs<SearchResponse<SearchReleaseItem>>('/database/search', {
      type: 'master',
      genre,
      style,
      per_page: 20,
    });
    items = fallback.results ?? [];
  }
  return [...items].sort(() => Math.random() - 0.5).slice(0, 5).map(releaseToResult);
}

export async function filterArtists(params: MusicFilterParams): Promise<ResultItem[]> {
  const { genre, style } = resolveGenreStyle(params.genres ?? []);
  const year = buildYear(params);
  const page = Math.floor(Math.random() * 3) + 1;
  const data = await discogs<SearchResponse<SearchReleaseItem>>('/database/search', {
    type: 'master',
    genre,
    style,
    year,
    per_page: 50,
    page,
  });
  const seen = new Set<string>();
  const out: ResultItem[] = [];
  for (const r of data.results ?? []) {
    const { artist } = parseTitle(r.title);
    if (artist === 'Various' || seen.has(artist.toLowerCase())) continue;
    seen.add(artist.toLowerCase());
    out.push({
      id: `name:${encodeURIComponent(artist)}`,
      title: artist,
      subtitle: 'Artist',
      meta: '',
      imageUrl: cleanImage(r.cover_image || r.thumb),
    });
    if (out.length === 5) break;
  }
  return out;
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
  };
}

export async function getSimilarAlbums(id: string): Promise<ResultItem[]> {
  let release: ReleaseInfo;
  try {
    const master = await discogs<{ main_release: number }>(`/masters/${id}`);
    release = await discogs<ReleaseInfo>(`/releases/${master.main_release}`);
  } catch {
    release = await discogs<ReleaseInfo>(`/releases/${id}`);
  }
  const style = release.styles?.[0];
  const genre = release.genres?.[0];
  if (!style && !genre) return [];
  const data = await discogs<SearchResponse<SearchReleaseItem>>('/database/search', {
    type: 'master',
    style,
    genre,
    per_page: 30,
  });
  const items = data.results ?? [];
  return [...items]
    .filter((r) => String(r.id) !== id && r.cover_image)
    .sort(() => Math.random() - 0.5)
    .slice(0, 10)
    .map(releaseToResult);
}

export async function getSimilarArtists(id: string): Promise<ResultItem[]> {
  let artistName: string;
  let firstReleaseId: number | undefined;
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
  const releases = await discogs<ArtistReleases>(`/artists/${id}/releases`, {
    sort: 'year',
    sort_order: 'desc',
    per_page: 5,
  });
  const artist = await discogs<ArtistInfo>(`/artists/${id}`);
  artistName = artist.name;
  firstReleaseId = (releases.releases ?? []).find((r) => r.type === 'master')?.id;
  if (!firstReleaseId) return [];
  let style: string | undefined;
  let genre: string | undefined;
  try {
    const master = await discogs<{ main_release: number; styles?: string[]; genres?: string[] }>(
      `/masters/${firstReleaseId}`
    );
    style = master.styles?.[0];
    genre = master.genres?.[0];
  } catch {
    return [];
  }
  if (!style && !genre) return [];
  const data = await discogs<SearchResponse<SearchReleaseItem>>('/database/search', {
    type: 'master',
    style,
    genre,
    per_page: 50,
  });
  const seen = new Set<string>([artistName.toLowerCase()]);
  const out: ResultItem[] = [];
  for (const r of data.results ?? []) {
    const { artist: a } = parseTitle(r.title);
    if (a === 'Various' || seen.has(a.toLowerCase())) continue;
    seen.add(a.toLowerCase());
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
