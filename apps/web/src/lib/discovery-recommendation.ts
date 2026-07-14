import {
  ADOPTION_LEVELS,
  RECOMMENDATION_TRACKS,
  TIME_TO_VALUE_OPTIONS as SCHEMA_TIME_TO_VALUE_OPTIONS,
  type ContentItem,
} from "./schema";

export const DISCOVERY_TRACKS = RECOMMENDATION_TRACKS;
export const TIME_TO_VALUE_OPTIONS = SCHEMA_TIME_TO_VALUE_OPTIONS;
export const ADOPTION_LEVEL_OPTIONS = ADOPTION_LEVELS;
export const DISCOVERY_FORMATS = ["可复制内容", "团队案例", "Skill 与工具", "趋势信号"] as const;

export type DiscoveryTrack = typeof DISCOVERY_TRACKS[number];
export type TimeToValue = typeof TIME_TO_VALUE_OPTIONS[number];
export type AdoptionLevel = typeof ADOPTION_LEVEL_OPTIONS[number];
export type DiscoveryFormat = typeof DISCOVERY_FORMATS[number];

export interface DiscoveryPreferences {
  timeToValue: TimeToValue;
  goal: DiscoveryTrack;
  format: DiscoveryFormat;
  adoptionLevel: AdoptionLevel;
}

type DiscoveryItem = ContentItem & {
  recommendationTrack: DiscoveryTrack;
  timeToValue: TimeToValue;
  adoptionLevel: AdoptionLevel;
};

export function recommendContent(
  items: readonly DiscoveryItem[],
  preferences: DiscoveryPreferences,
  limit = 3,
): DiscoveryItem[] {
  if (limit <= 0) return [];

  return items
    .map((item) => ({ item, score: recommendationScore(item, preferences) }))
    .sort((left, right) => (
      right.score - left.score
      || right.item.sortWeight - left.item.sortWeight
      || Date.parse(right.item.updatedAt) - Date.parse(left.item.updatedAt)
      || left.item.id.localeCompare(right.item.id)
    ))
    .slice(0, limit)
    .map(({ item }) => item);
}

function recommendationScore(item: DiscoveryItem, preferences: DiscoveryPreferences): number {
  let score = 0;
  if (item.recommendationTrack === preferences.goal) score += 16;
  if (item.timeToValue === preferences.timeToValue) score += 5;
  if (matchesFormat(item, preferences.format)) score += 4;
  if (item.adoptionLevel === preferences.adoptionLevel) score += 3;
  if (item.featured) score += 1;
  return score;
}

function matchesFormat(item: DiscoveryItem, format: DiscoveryFormat): boolean {
  if (format === "可复制内容") return item.copyBlocks.length > 0;
  if (format === "团队案例") return item.type === "Case" || item.type === "Collaboration";
  if (format === "Skill 与工具") {
    return item.type === "Skill" || item.type === "Tool" || item.type === "Getting Started";
  }
  return item.type === "AI Signal";
}
