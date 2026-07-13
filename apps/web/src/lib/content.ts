import { sortContent } from "./content-query";
import type { ContentItem } from "./schema";

export function getFeatured(items: ContentItem[]): ContentItem[] {
  return sortContent(items.filter((item) => item.featured), "featured");
}

export function getRecent(items: ContentItem[], limit: number): ContentItem[] {
  if (limit <= 0) return [];

  return sortContent(items, "latest").slice(0, limit);
}

export function getBySlug(items: ContentItem[], slug: string): ContentItem | undefined {
  return items.find((item) => item.slug === slug);
}

export function getRelated(items: ContentItem[], current: ContentItem, limit = 3): ContentItem[] {
  if (limit <= 0) return [];

  return items
    .filter((item) => item.id !== current.id)
    .map((item) => ({
      item,
      score: item.tags.filter((tag) => current.tags.includes(tag)).length
        + Number(item.category === current.category),
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score
      || right.item.sortWeight - left.item.sortWeight
      || Date.parse(right.item.updatedAt) - Date.parse(left.item.updatedAt)
      || left.item.slug.localeCompare(right.item.slug)
      || left.item.id.localeCompare(right.item.id))
    .slice(0, limit)
    .map(({ item }) => item);
}
