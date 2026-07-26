import type { ContentCategory, ResultItem } from "../../types/content";
import { ERA_FILTERS } from "../../constants/Filters";
import { SPOTIFY_GENRE_MAP } from "../api/discogs";
import { OL_SUBJECTS } from "../api/openlibrary";
import { TMDB_GENRES } from "../api/tmdb";
import type { CulturalProfile } from "./culturalProfile";
import type { DiscoveryProviderRegistry } from "./loadDiscovery";

const CATEGORIES: readonly ContentCategory[] = ["movies", "books", "artists", "albums"];
const CONFIDENCE_THRESHOLD = 0.6;
const MAX_RECOMMENDATIONS = 8;

export type RecommendationReason = {
  kind:
    | "provider-similar"
    | "shared-genre"
    | "shared-style"
    | "shared-subject"
    | "shared-creator"
    | "shared-era";
  label: string;
  evidence: string[];
};

export type MapRecommendation = {
  category: ContentCategory;
  item: ResultItem;
  score: number;
  reason: RecommendationReason;
};

export type RecommendationSourceStatus = {
  category: ContentCategory;
  source: "similar" | "traits";
  status: "available" | "failed" | "not-applicable";
};

export type MapRecommendationSeed = {
  category: ContentCategory;
  item: ResultItem;
  profile: CulturalProfile;
};

export type MapRecommendationDependencies = {
  providers: DiscoveryProviderRegistry;
};

export type MapRecommendationResult = {
  recommendations: MapRecommendation[];
  sourceStatuses: RecommendationSourceStatus[];
};

type TraitEvidence = {
  kind: Exclude<RecommendationReason["kind"], "provider-similar">;
  value: string;
  query: string;
  mode: "filter" | "search";
  score: number;
};

const PROVIDER_TRAIT_FILTERS: Record<ContentCategory, ReadonlySet<string>> = {
  movies: new Set(Object.keys(TMDB_GENRES)),
  books: new Set(Object.keys(OL_SUBJECTS)),
  artists: new Set(Object.keys(SPOTIFY_GENRE_MAP)),
  albums: new Set(Object.keys(SPOTIFY_GENRE_MAP)),
};

const STYLE_FILTERS: Partial<
  Record<string, Partial<Record<ContentCategory, string>>>
> = {
  "Trip-Hop": {
    artists: "Electronic / EDM",
    albums: "Electronic / EDM",
  },
  Downtempo: {
    artists: "Electronic / EDM",
    albums: "Electronic / EDM",
  },
  Epic: {
    movies: "Adventure",
    books: "Fantasy",
  },
  "Coming-of-age": {
    movies: "Drama",
    books: "Young Adult",
  },
  Noir: {
    movies: "Crime",
    books: "Mystery / Thriller",
  },
};

function traitEvidence(profile: CulturalProfile, category: ContentCategory): TraitEvidence | null {
  const filters = PROVIDER_TRAIT_FILTERS[category];
  for (const genre of profile.genres) {
    if (filters.has(genre)) {
      return {
        kind: "shared-genre",
        value: genre,
        query: genre,
        mode: "filter",
        score: 0.68,
      };
    }
  }
  for (const subject of profile.subjects) {
    if (filters.has(subject)) {
      return {
        kind: "shared-subject",
        value: subject,
        query: subject,
        mode: "filter",
        score: 0.66,
      };
    }
  }
  for (const style of profile.styles) {
    const filter = STYLE_FILTERS[style]?.[category];
    if (filter && filters.has(filter)) {
      return {
        kind: "shared-style",
        value: style,
        query: filter,
        mode: "filter",
        score: 0.67,
      };
    }
  }
  const creator = profile.creators[0];
  if (creator) {
    return {
      kind: "shared-creator",
      value: creator,
      query: creator.replace(/-/g, " "),
      mode: "search",
      score: 0.7,
    };
  }
  return null;
}

function providerDecade(era?: string): string | undefined {
  if (!era) return undefined;
  if (ERA_FILTERS.decades.includes(era)) return era;
  const year = Number(era.match(/^(\d{4})s$/)?.[1]);
  if (!Number.isInteger(year)) return undefined;
  const decade = `${String(year % 100).padStart(2, "0")}s`;
  return ERA_FILTERS.decades.includes(decade) ? decade : undefined;
}

function traitFilters(evidence: TraitEvidence, profile: CulturalProfile): string[] {
  return [evidence.query, providerDecade(profile.era)].filter(
    (value): value is string => Boolean(value)
  );
}

function traitReason(evidence: TraitEvidence): RecommendationReason {
  const label = {
    "shared-genre": "Shared genre",
    "shared-style": "Shared style",
    "shared-subject": "Shared subject",
    "shared-creator": "Shared creator",
    "shared-era": "Shared era",
  }[evidence.kind];
  const displayValue =
    evidence.kind === "shared-creator"
      ? evidence.value
          .split("-")
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(" ")
      : evidence.value;
  return {
    kind: evidence.kind,
    label: `${label}: ${displayValue}`,
    evidence: [evidence.value],
  };
}

function providerSeed(
  seed: MapRecommendationSeed,
  category: ContentCategory,
  evidence?: TraitEvidence
): string {
  return [
    `${seed.category}:${seed.item.id}`,
    category,
    evidence?.kind ?? "similar",
    evidence?.value ?? "",
    seed.profile.era ?? "",
  ].join("|");
}

function candidateKey(candidate: Pick<MapRecommendation, "category" | "item">): string {
  return `${candidate.category}:${candidate.item.id}`;
}

function prioritizeVariety(candidates: readonly MapRecommendation[]): MapRecommendation[] {
  const sorted = [...candidates].sort((left, right) => {
    const scoreDifference = right.score - left.score;
    if (scoreDifference) return scoreDifference;
    const categoryDifference = CATEGORIES.indexOf(left.category) - CATEGORIES.indexOf(right.category);
    return categoryDifference || left.item.title.localeCompare(right.item.title) || left.item.id.localeCompare(right.item.id);
  });
  const categoriesSeen = new Set<ContentCategory>();
  const varied: MapRecommendation[] = [];
  const remaining: MapRecommendation[] = [];
  for (const candidate of sorted) {
    if (!categoriesSeen.has(candidate.category)) {
      categoriesSeen.add(candidate.category);
      varied.push(candidate);
    } else {
      remaining.push(candidate);
    }
  }
  return [...varied, ...remaining].slice(0, MAX_RECOMMENDATIONS);
}

export async function findMapRecommendations(
  seed: MapRecommendationSeed,
  dependencies: MapRecommendationDependencies
): Promise<MapRecommendationResult> {
  const candidates = new Map<string, MapRecommendation>();
  const add = (candidate: MapRecommendation) => {
    if (candidate.category === seed.category && candidate.item.id === seed.item.id) return;
    if (candidate.score < CONFIDENCE_THRESHOLD) return;
    const key = candidateKey(candidate);
    const current = candidates.get(key);
    if (!current || candidate.score > current.score) candidates.set(key, candidate);
  };

  let similarStatus: RecommendationSourceStatus;
  try {
    const similarProvider = dependencies.providers[seed.category];
    const similar = similarProvider.mapSimilar
      ? await similarProvider.mapSimilar(seed.item, {
          seed: providerSeed(seed, seed.category),
        })
      : await similarProvider.similar(seed.item);
    similarStatus = { category: seed.category, source: "similar", status: "available" };
    for (const item of similar) {
      add({
        category: seed.category,
        item,
        score: 0.9,
        reason: {
          kind: "provider-similar",
          label: `Provider-native similar ${seed.category.slice(0, -1)}`,
          evidence: ["provider-native similar result"],
        },
      });
    }
  } catch {
    similarStatus = { category: seed.category, source: "similar", status: "failed" };
  }

  const traitResults = await Promise.all(CATEGORIES.map(async (category) => {
    const evidence = traitEvidence(seed.profile, category);
    if (!evidence) {
      return { category, status: "not-applicable" as const, candidates: [] };
    }
    try {
      const provider = dependencies.providers[category];
      const items =
        evidence.mode === "search"
          ? await provider.search(evidence.query)
          : provider.mapFilter
            ? await provider.mapFilter(traitFilters(evidence, seed.profile), {
                seed: providerSeed(seed, category, evidence),
              })
            : await provider.filter(traitFilters(evidence, seed.profile));
      return {
        category,
        status: "available" as const,
        candidates: items.map((item) => ({ category, item, score: evidence.score, reason: traitReason(evidence) })),
      };
    } catch {
      return { category, status: "failed" as const, candidates: [] };
    }
  }));

  for (const result of traitResults) {
    for (const candidate of result.candidates) add(candidate);
  }
  const sourceStatuses = CATEGORIES.flatMap((category) => [
    ...(category === seed.category ? [similarStatus] : []),
    { category, source: "traits" as const, status: traitResults.find((result) => result.category === category)!.status },
  ]);

  return { recommendations: prioritizeVariety([...candidates.values()]), sourceStatuses };
}
