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
  action: "Action",
  adventure: "Adventure",
  animation: "Animation",
  comedy: "Comedy",
  crime: "Crime",
  documentary: "Documentary",
  drama: "Drama",
  fantasy: "Fantasy",
  horror: "Horror",
  romance: "Romance",
  "science fiction": "Sci-Fi",
  "sci fi": "Sci-Fi",
  "sci-fi": "Sci-Fi",
  thriller: "Thriller",
  western: "Western",
  "hip hop": "Hip-Hop / Rap",
  "hip hop rap": "Hip-Hop / Rap",
  rap: "Hip-Hop / Rap",
  "r b": "R&B / Soul",
  "r and b": "R&B / Soul",
  "r b soul": "R&B / Soul",
  soul: "R&B / Soul",
  electronic: "Electronic / EDM",
  edm: "Electronic / EDM",
  "electronic edm": "Electronic / EDM",
  country: "Country",
  jazz: "Jazz",
  classical: "Classical",
  metal: "Metal",
  "heavy metal": "Metal",
  indie: "Indie / Alternative",
  "indie rock": "Indie / Alternative",
  alternative: "Indie / Alternative",
  "indie alternative": "Indie / Alternative",
  rock: "Rock",
  pop: "Pop",
  "k pop": "K-Pop",
  "k-pop": "K-Pop",
  reggae: "Reggae",
  blues: "Blues",
  latin: "Latin",
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
  fiction: "Fiction",
  nonfiction: "Non-Fiction",
  "non fiction": "Non-Fiction",
  fantasy: "Fantasy",
  romance: "Romance",
  "space opera": "Space opera",
  "coming of age": "Coming of age",
  "coming-of-age": "Coming of age",
  mystery: "Mystery / Thriller",
  thriller: "Mystery / Thriller",
  "mystery thriller": "Mystery / Thriller",
  "historical fiction": "Historical Fiction",
  history: "History",
  biography: "Biography / Memoir",
  memoir: "Biography / Memoir",
  "biography memoir": "Biography / Memoir",
  "self help": "Self-Help",
  "self-help": "Self-Help",
  "young adult": "Young Adult",
  "young adult fiction": "Young Adult",
  "literary fiction": "Literary Fiction",
  "graphic novel": "Graphic Novel",
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

function descriptionTerms(description: string, vocabulary: Record<string, string>): string[] {
  return Object.keys(vocabulary).filter((term) => {
    if (term === "fiction" && /\b(?:science|historical)[ -]fiction\b/i.test(description)) {
      return false;
    }
    return new RegExp(`\\b${term.replace(/[- ]/g, "[- ]")}\\b`, "i").test(description);
  });
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
  const genreValues = [...(detail.genres ?? []), ...(detail.subjects ?? []), ...descriptionTerms(description, GENRE_VOCABULARY)];
  const subjectValues = [...(detail.subjects ?? []), ...descriptionTerms(description, SUBJECT_VOCABULARY)];

  return {
    vocabularyVersion: CULTURAL_VOCABULARY_VERSION,
    genres: normalize(genreValues, GENRE_VOCABULARY),
    styles: unique([
      ...normalize(detail.styles ?? [], STYLE_VOCABULARY),
      ...normalize(descriptionTerms(description, STYLE_VOCABULARY), STYLE_VOCABULARY),
    ]),
    subjects: normalize(subjectValues, SUBJECT_VOCABULARY),
    creators: normalizeCreators(creators),
    era: deriveEra([detail.releaseYear, detail.firstPublishYear, detail.releaseDate, item.meta]),
  };
}
