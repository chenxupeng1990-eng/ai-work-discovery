import type { ContentItem } from "./schema";

export type ContentSort = "featured" | "latest";

export type QueryOptions = {
  query: string;
  category: string;
  sort: ContentSort;
};

const normalize = (value: string) => value.trim().toLocaleLowerCase("zh-CN");

const compareStrings = (left: string, right: string) => {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
};

export function sortContent(items: ContentItem[], sort: ContentSort): ContentItem[] {
  return [...items].sort((left, right) => {
    const primary = sort === "latest"
      ? Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
      : right.sortWeight - left.sortWeight;
    const secondary = sort === "latest"
      ? right.sortWeight - left.sortWeight
      : Date.parse(right.updatedAt) - Date.parse(left.updatedAt);

    return primary
      || secondary
      || compareStrings(left.slug, right.slug)
      || compareStrings(left.id, right.id);
  });
}

export function queryContent(items: ContentItem[], options: QueryOptions): ContentItem[] {
  const query = normalize(options.query);

  return sortContent(
    items
      .filter((item) => options.category === "全部" || item.category === options.category)
      .filter((item) => {
        if (!query) return true;

        return normalize([
          item.title,
          item.summary,
          item.recommendationReason,
          item.sourceName,
          ...item.tags,
        ].join(" ")).includes(query);
      }),
    options.sort,
  );
}
