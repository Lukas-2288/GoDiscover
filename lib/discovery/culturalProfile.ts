import type { ContentCategory, ResultItem } from "../../types/content";

export const CULTURAL_VOCABULARY_VERSION = 1 as const;

export type CulturalProfile = {
  vocabularyVersion: typeof CULTURAL_VOCABULARY_VERSION;
  genres: string[];
  styles: string[];
  subjects: string[];
  creators: string[];
  era?: string;
};

export type CulturalProfileDetail = {
  genres?: readonly string[];
  styles?: readonly string[];
  subjects?: readonly string[];
  description?: string;
  overview?: string;
  creators?: readonly string[];
  authors?: readonly string[];
  artists?: readonly string[];
  name?: string;
  releaseYear?: string;
  firstPublishYear?: number;
  releaseDate?: string;
};

const GENRE_VOCABULARY: Record<string, string> = {
  "science fiction": "Sci-Fi",
  "sci fi": "Sci-Fi",
  "sci-fi": "Sci-Fi",
  electronic: "Electronic / EDM",
  edm: "Electronic / EDM",
  fantasy: "Fantasy",
  horror: "Horror",
  romance: "Romance",
  drama: "Drama",
  comedy: "Comedy",
  documentary: "Documentary",
  jazz: "Jazz",
  classical: "Classical",
  rock: "Rock",
  pop: "Pop",
  reggae: "Reggae",
  blues: "Blues",
  latin: "Latin",
  country: "Country",
  folk: "Folk",
};

const STYLE_VOCABULARY: Record<string, string> = {
  "trip hop": "Trip-Hop",
  "trip-hop": "Trip-Hop",
  downtempo: "Downtempo",
  "space opera": "Epic",
  epic: "Epic",
  "coming of age": "Coming-of-age",
  "coming-of-age": "Coming-of-age",
  "film noir": "Noir",
  noir: "Noir",
};

const SUBJECT_VOCABULARY: Record<string, string> = {
  "space opera": "Space opera",
  "coming of age": "Coming of age",
  "coming-of-age": "Coming of age",
  mystery: "Mystery",
  thriller: "Thriller",
  history: "History",
  biography: "Biography",
  philosophy: "Philosophy",
};

function key(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function normalize(values: readonly string[], vocabulary: Record<string, string>): string[] {
  return unique(values.map((value) => vocabulary[key(value)]).filter((value): value is string => Boolean(value)));
}

function normalizeCreators(values: readonly string[]): string[] {
  return unique(
    values
      .map((value) => key(value).replace(/\s+/g, "-"))
      .filter(Boolean)
  );
}

function deriveEra(values: readonly (string | number | undefined)[]): string | undefined {
  for (const value of values) {
    const year = Number(String(value ?? "").match(/\b(1\d{3}|20\d{2})\b/)?.[1]);
    if (Number.isInteger(year)) return `${Math.floor(year / 10) * 10}s`;
  }
  return undefined;
}

function descriptionStyles(description: string): string[] {
  return normalize(Object.keys(STYLE_VOCABULARY).filter((term) => new RegExp(`\\b${term.replace(/[- ]/g, "[- ]")}\\b`, "i").test(description)), STYLE_VOCABULARY);
}

export function buildCulturalProfile(
  category: ContentCategory,
  item: ResultItem,
  detail: CulturalProfileDetail = {}
): CulturalProfile {
  const description = detail.description ?? detail.overview ?? "";
  const fallbackCreators =
    category === "artists" ? [detail.name ?? item.title] :
    category === "books" || category === "albums" ? [item.subtitle] : [];
  const creators = detail.creators ?? detail.authors ?? detail.artists ?? fallbackCreators;

  return {
    vocabularyVersion: CULTURAL_VOCABULARY_VERSION,
    genres: normalize([...(detail.genres ?? []), ...(detail.subjects ?? [])], GENRE_VOCABULARY),
    styles: unique([
      ...normalize(detail.styles ?? [], STYLE_VOCABULARY),
      ...descriptionStyles(description),
    ]),
    subjects: normalize(detail.subjects ?? [], SUBJECT_VOCABULARY),
    creators: normalizeCreators(creators),
    era: deriveEra([detail.releaseYear, detail.firstPublishYear, detail.releaseDate, item.meta]),
  };
}
