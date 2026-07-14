import type { ContentItem } from "./schema";

const compareHomePriority = (left: ContentItem, right: ContentItem) => (
  Number(right.featured) - Number(left.featured)
  || Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
  || right.sortWeight - left.sortWeight
  || left.slug.localeCompare(right.slug)
  || left.id.localeCompare(right.id)
);

const select = (items: readonly ContentItem[], limit: number) => (
  limit <= 0 ? [] : [...items].sort(compareHomePriority).slice(0, limit)
);

export const selectHeroItems = (items: readonly ContentItem[], limit = 4) => select(items, limit);
export const selectHomepageItems = (items: readonly ContentItem[], limit = 10) => select(items, limit);
