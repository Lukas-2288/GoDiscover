import type { ContentCategory, ResultItem } from "../../types/content";
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

const PROVIDER_GENRES: Record<ContentCategory, Record<string, string>> = {
  movies: Object.fromEntries([
    "Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary", "Drama", "Fantasy", "Horror", "Romance", "Sci-Fi", "Thriller", "Western",
  ].map((genre) => [genre, genre])),
  books: {
    Fantasy: "Fantasy",
    Horror: "Horror",
    Romance: "Romance",
    "Sci-Fi": "Sci-Fi",
  },
  artists: Object.fromEntries([
    "Pop", "Rock", "Electronic / EDM", "Country", "Jazz", "Classical", "Reggae", "Blues", "Latin", "Folk",
  ].map((genre) => [genre, genre])),
  albums: Object.fromEntries([
    "Pop", "Rock", "Electronic / EDM", "Country", "Jazz", "Classical", "Reggae", "Blues", "Latin", "Folk",
  ].map((genre) => [genre, genre])),
};

function traitEvidence(profile: CulturalProfile, category: ContentCategory): TraitEvidence | null {
  const filters = PROVIDER_GENRES[category];
  for (const genre of profile.genres) {
    const filter = filters[genre];
    if (filter) return { kind: "shared-genre", value: genre, filter, score: 0.68 };
  }
  if (category === "books") {
    const subject = profile.subjects.find((value) => value === "Mystery" || value === "Thriller");
    if (subject) {
      return { kind: "shared-subject", value: subject, filter: "Mystery / Thriller", score: 0.66 };
    }
  }
  return null;
}

function traitFilters(evidence: TraitEvidence, profile: CulturalProfile): string[] {
  return [evidence.filter, profile.era].filter(
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
    return categoryDifference || left.item.title.localeCompare(right.item.title);
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
  const sourceStatuses: RecommendationSourceStatus[] = [];
  const candidates = new Map<string, MapRecommendation>();
  const add = (candidate: MapRecommendation) => {
    if (candidate.category === seed.category && candidate.item.id === seed.item.id) return;
    if (candidate.score < CONFIDENCE_THRESHOLD) return;
    const key = candidateKey(candidate);
    const current = candidates.get(key);
    if (!current || candidate.score > current.score) candidates.set(key, candidate);
  };

  try {
    const similar = await dependencies.providers[seed.category].similar(seed.item);
    sourceStatuses.push({ category: seed.category, source: "similar", status: "available" });
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
    sourceStatuses.push({ category: seed.category, source: "similar", status: "failed" });
  }

  await Promise.all(CATEGORIES.map(async (category) => {
    const evidence = traitEvidence(seed.profile, category);
    if (!evidence) {
      sourceStatuses.push({ category, source: "traits", status: "not-applicable" });
      return;
    }
    try {
      const items = await dependencies.providers[category].filter(traitFilters(evidence, seed.profile));
      sourceStatuses.push({ category, source: "traits", status: "available" });
      for (const item of items) {
        add({ category, item, score: evidence.score, reason: traitReason(evidence) });
      }
    } catch {
      sourceStatuses.push({ category, source: "traits", status: "failed" });
    }
  }));

  return { recommendations: prioritizeVariety([...candidates.values()]), sourceStatuses };
}
