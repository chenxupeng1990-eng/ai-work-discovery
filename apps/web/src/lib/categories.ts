import type { ContentItem } from "./schema";

type RecommendationTrack = ContentItem["recommendationTrack"];

export const CATEGORY_DEFINITIONS = [
  { slug: "inspiration", track: "灵感实验", description: "打开新思路，快速验证值得继续探索的 AI 用法。", accent: "cyan" },
  { slug: "productivity", track: "工作提效", description: "进入真实工作流，减少重复劳动并提高交付质量。", accent: "blue" },
  { slug: "team-practice", track: "团队实践", description: "把个人技巧变成团队可复用、可协作的工作方法。", accent: "teal" },
  { slug: "frontier-signals", track: "前沿信号", description: "观察正在形成的新工具、新能力和行业变化。", accent: "violet" },
] as const satisfies readonly {
  slug: string;
  track: RecommendationTrack;
  description: string;
  accent: "cyan" | "blue" | "teal" | "violet";
}[];

export type CategorySlug = typeof CATEGORY_DEFINITIONS[number]["slug"];

export const categoryForSlug = (slug: string) => CATEGORY_DEFINITIONS.find((item) => item.slug === slug);
export const slugForTrack = (track: RecommendationTrack) => CATEGORY_DEFINITIONS.find((item) => item.track === track)!.slug;
export const itemsForCategory = (items: readonly ContentItem[], slug: CategorySlug) => {
  const category = categoryForSlug(slug)!;
  return items.filter((item) => item.recommendationTrack === category.track);
};
