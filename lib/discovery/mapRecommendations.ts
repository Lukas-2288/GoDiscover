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
  kind: "provider-similar" | "shared-genre" | "shared-style" | "shared-subject" | "shared-era";
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
  filter: string;
  score: number;
};

const PROVIDER_TRAIT_FILTERS: Record<ContentCategory, ReadonlySet<string>> = {
  movies: new Set(Object.keys(TMDB_GENRES)),
  books: new Set(Object.keys(OL_SUBJECTS)),
  artists: new Set(Object.keys(SPOTIFY_GENRE_MAP)),
  albums: new Set(Object.keys(SPOTIFY_GENRE_MAP)),
};

function traitEvidence(profile: CulturalProfile, category: ContentCategory): TraitEvidence | null {
  const filters = PROVIDER_TRAIT_FILTERS[category];
  for (const genre of profile.genres) {
    if (filters.has(genre)) return { kind: "shared-genre", value: genre, filter: genre, score: 0.68 };
  }
  for (const subject of profile.subjects) {
    if (filters.has(subject)) return { kind: "shared-subject", value: subject, filter: subject, score: 0.66 };
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
  return [evidence.filter, providerDecade(profile.era)].filter(
    (value): value is string => Boolean(value)
  );
}

function traitReason(evidence: TraitEvidence): RecommendationReason {
  const label = {
    "shared-genre": "Shared genre",
    "shared-style": "Shared style",
    "shared-subject": "Shared subject",
    "shared-era": "Shared era",
  }[evidence.kind];
  return { kind: evidence.kind, label: `${label}: ${evidence.value}`, evidence: [evidence.value] };
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
    const similar = await dependencies.providers[seed.category].similar(seed.item);
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
      const items = await dependencies.providers[category].filter(traitFilters(evidence, seed.profile));
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
