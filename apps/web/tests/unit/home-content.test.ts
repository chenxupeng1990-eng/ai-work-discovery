import { describe, expect, it } from "vitest";
import type { ContentItem } from "../../src/lib/schema";
import { selectHeroItems, selectHomepageItems } from "../../src/lib/home-content";

const item = (id: string, overrides: Partial<ContentItem> = {}): ContentItem => ({
  id,
  slug: id,
  title: id,
  type: "Case",
  category: "灵感实验",
  summary: id,
  recommendationReason: id,
  recommendationTrack: "灵感实验",
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
  ...overrides,
});

describe("homepage content selection", () => {
  it("prioritizes featured and newer content without mutating input", () => {
    const input = [
      item("older", { updatedAt: "2026-01-02T00:00:00.000Z", sortWeight: 9 }),
      item("featured-old", { featured: true, updatedAt: "2026-01-03T00:00:00.000Z" }),
      item("recent", { updatedAt: "2026-01-04T00:00:00.000Z" }),
      item("featured-new", { featured: true, updatedAt: "2026-01-05T00:00:00.000Z" }),
    ];
    const originalOrder = input.map(({ id }) => id);

    expect(selectHeroItems(input).map(({ id }) => id)).toEqual(["featured-new", "featured-old", "recent", "older"]);
    expect(input.map(({ id }) => id)).toEqual(originalOrder);
  });

  it("applies the requested limit and returns no items for zero", () => {
    const input = [item("b"), item("a")];
    expect(selectHomepageItems(input, 2)).toHaveLength(2);
    expect(selectHeroItems(input, 0)).toEqual([]);
  });

  it("never exceeds the public hero and homepage caps", () => {
    const input = Array.from({ length: 12 }, (_, index) => item(`item-${index}`));
    expect(selectHeroItems(input, 5)).toHaveLength(4);
    expect(selectHomepageItems(input, 11)).toHaveLength(10);
  });

  it("uses sort weight, slug, and id as deterministic tie-breakers", () => {
    const sameDate = "2026-01-01T00:00:00.000Z";
    const input = [
      item("z-id", { slug: "same", updatedAt: sameDate, sortWeight: 1 }),
      item("a-id", { slug: "same", updatedAt: sameDate, sortWeight: 1 }),
      item("low-weight", { slug: "a", updatedAt: sameDate, sortWeight: 0 }),
      item("high-weight", { slug: "b", updatedAt: sameDate, sortWeight: 2 }),
    ];

    expect(selectHomepageItems(input).map(({ id }) => id)).toEqual([
      "high-weight", "a-id", "z-id", "low-weight",
    ]);
  });
});
