import { describe, expect, it } from "vitest";
import type { ContentItem } from "../../src/lib/schema";
import { CATEGORY_DEFINITIONS, categoryForSlug, itemsForCategory, slugForTrack } from "../../src/lib/categories";

const item = (id: string, recommendationTrack: ContentItem["recommendationTrack"]): ContentItem => ({
  id,
  slug: id,
  title: id,
  type: "Case",
  category: recommendationTrack,
  summary: id,
  recommendationReason: id,
  recommendationTrack,
  timeToValue: "10 分钟",
  adoptionLevel: "直接使用",
  networkRequirement: "无需 VPN",
  takeaway: id,
  coverImage: "/images/fallback-default.webp",
  tags: [],
  audience: [],
  scenario: id,
  sourceName: id,
  featured: false,
  sortWeight: 0,
  publishedAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  copyBlocks: [],
});

describe("category metadata", () => {
  it("defines four stable, unique routes", () => {
    expect(CATEGORY_DEFINITIONS.map(({ slug }) => slug)).toEqual([
      "inspiration", "productivity", "team-practice", "frontier-signals",
    ]);
    expect(new Set(CATEGORY_DEFINITIONS.map(({ track }) => track)).size).toBe(4);
  });

  it("maps slugs and Chinese tracks in both directions", () => {
    expect(categoryForSlug("productivity")?.track).toBe("工作提效");
    expect(slugForTrack("团队实践")).toBe("team-practice");
    expect(categoryForSlug("unknown")).toBeUndefined();
  });

  it("filters items by the category track", () => {
    const items = [item("one", "团队实践"), item("two", "工作提效")];
    expect(itemsForCategory(items, "team-practice").map(({ id }) => id)).toEqual(["one"]);
  });
});
