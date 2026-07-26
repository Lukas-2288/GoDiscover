import type { ContentCategory, ResultItem } from "../../types/content";
import {
  buildCulturalProfile,
  type CulturalProfileDetail,
} from "./culturalProfile";
import {
  loadDetail,
  type ContentDetail,
} from "./loadDetail";
import type { MapRecommendationSeed } from "./mapRecommendations";

export type MapDetailLoader = (
  category: ContentCategory,
  item: ResultItem
) => Promise<ContentDetail>;

function profileDetail(detail: ContentDetail): CulturalProfileDetail {
  return detail.data as CulturalProfileDetail;
}

export async function loadMapRecommendationSeed(
  category: ContentCategory,
  item: ResultItem,
  detailLoader: MapDetailLoader = loadDetail
): Promise<MapRecommendationSeed> {
  const detail = await detailLoader(category, item);
  if (detail.category !== category) {
    throw new Error("Recommendation detail category mismatch");
  }
  return {
    category,
    item,
    profile: buildCulturalProfile(category, item, profileDetail(detail)),
  };
}
