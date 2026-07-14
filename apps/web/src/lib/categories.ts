import { RECOMMENDATION_TRACKS, type ContentItem } from "./schema";

type RecommendationTrack = ContentItem["recommendationTrack"];

export const CATEGORY_DEFINITIONS = [
  { slug: "inspiration", track: RECOMMENDATION_TRACKS[0], description: "打开新思路，快速验证值得继续探索的 AI 用法。", accent: "cyan" },
  { slug: "productivity", track: RECOMMENDATION_TRACKS[1], description: "进入真实工作流，减少重复劳动并提高交付质量。", accent: "blue" },
  { slug: "team-practice", track: RECOMMENDATION_TRACKS[2], description: "把个人技巧变成团队可复用、可协作的工作方法。", accent: "teal" },
  { slug: "frontier-signals", track: RECOMMENDATION_TRACKS[3], description: "观察正在形成的新工具、新能力和行业变化。", accent: "violet" },
] as const satisfies readonly {
  slug: string;
  track: RecommendationTrack;
  description: string;
  accent: "cyan" | "blue" | "teal" | "violet";
}[];

export type CategorySlug = typeof CATEGORY_DEFINITIONS[number]["slug"];

export const categoryForSlug = (slug: string) => CATEGORY_DEFINITIONS.find((item) => item.slug === slug);
export const slugForTrack = (track: RecommendationTrack) => {
  const category = CATEGORY_DEFINITIONS.find((item) => item.track === track);
  if (!category) throw new Error(`Unknown recommendation track: ${track}`);
  return category.slug;
};
export const itemsForCategory = (items: readonly ContentItem[], slug: CategorySlug) => {
  const category = categoryForSlug(slug);
  if (!category) return [];
  return items.filter((item) => item.recommendationTrack === category.track);
};
