import { describe, expect, it } from "vitest";
import { fixtureDataset } from "../fixtures/content";
import {
  getFeatured,
  getRecent,
  getBySlug,
  getRelated,
} from "../../src/lib/content";
import { queryContent } from "../../src/lib/content-query";

const baseItem = fixtureDataset.items[0];

const searchOptions = (query: string) => ({
  query,
  category: "全部",
  sort: "featured" as const,
});

describe("queryContent", () => {
  it.each([
    ["标题中的中文", "title"],
    ["摘要中的中文", "summary"],
    ["推荐理由中的中文", "recommendation"],
    ["来源中的中文", "source"],
    ["标签中的中文", "tag"],
  ])("matches Chinese text in %s", (query, slug) => {
    const items = [
      { ...baseItem, id: "title", slug: "title", title: "标题中的中文" },
      { ...baseItem, id: "summary", slug: "summary", summary: "摘要中的中文" },
      {
        ...baseItem,
        id: "recommendation",
        slug: "recommendation",
        recommendationReason: "推荐理由中的中文",
      },
      { ...baseItem, id: "source", slug: "source", sourceName: "来源中的中文" },
      { ...baseItem, id: "tag", slug: "tag", tags: ["标签中的中文"] },
    ];

    expect(queryContent(items, searchOptions(query)).map((item) => item.slug)).toEqual([slug]);
  });

  it("filters by category while 全部 keeps every item", () => {
    const items = [
      { ...baseItem, id: "one", slug: "one", category: "团队案例" },
      { ...baseItem, id: "two", slug: "two", category: "工具" },
    ];

    expect(queryContent(items, { ...searchOptions(""), category: "工具" }).map((item) => item.slug)).toEqual(["two"]);
    expect(queryContent(items, searchOptions("")).map((item) => item.slug)).toEqual(["one", "two"]);
  });

  it("sorts featured results by weight, update time, and slug", () => {
    const items = [
      { ...baseItem, id: "last", slug: "last", sortWeight: 10, updatedAt: "2026-07-01T00:00:00.000Z" },
      { ...baseItem, id: "middle", slug: "middle", sortWeight: 20, updatedAt: "2026-07-01T00:00:00.000Z" },
      { ...baseItem, id: "first-b", slug: "first-b", sortWeight: 20, updatedAt: "2026-07-02T00:00:00.000Z" },
      { ...baseItem, id: "first-a", slug: "first-a", sortWeight: 20, updatedAt: "2026-07-02T00:00:00.000Z" },
    ];

    expect(queryContent(items, searchOptions("")).map((item) => item.slug)).toEqual([
      "first-a",
      "first-b",
      "middle",
      "last",
    ]);
  });

  it("sorts latest results by update time, weight, and slug", () => {
    const items = [
      { ...baseItem, id: "last", slug: "last", sortWeight: 100, updatedAt: "2026-07-01T00:00:00.000Z" },
      { ...baseItem, id: "middle", slug: "middle", sortWeight: 20, updatedAt: "2026-07-02T00:00:00.000Z" },
      { ...baseItem, id: "first-b", slug: "first-b", sortWeight: 20, updatedAt: "2026-07-03T00:00:00.000Z" },
      { ...baseItem, id: "first-a", slug: "first-a", sortWeight: 20, updatedAt: "2026-07-03T00:00:00.000Z" },
    ];

    expect(queryContent(items, { ...searchOptions(""), sort: "latest" }).map((item) => item.slug)).toEqual([
      "first-a",
      "first-b",
      "middle",
      "last",
    ]);
  });

  it("does not change the input item order", () => {
    const items = [
      { ...baseItem, id: "last", slug: "last", sortWeight: 10 },
      { ...baseItem, id: "first", slug: "first", sortWeight: 20 },
    ];

    queryContent(items, searchOptions(""));

    expect(items.map((item) => item.slug)).toEqual(["last", "first"]);
  });
});

describe("content route helpers", () => {
  it("returns featured items in featured order", () => {
    expect(getFeatured(fixtureDataset.items).map((item) => item.slug)).toEqual([
      "feishu-bridge-team-entry",
      "storyboarding-ai-video-workflow",
      "codex-skills-practical-roundup",
      "ai-hot-agent-workflows-signal",
    ]);
  });

  it("returns the requested number of most recently updated items", () => {
    const items = [
      { ...baseItem, id: "old", slug: "old", updatedAt: "2026-07-01T00:00:00.000Z" },
      { ...baseItem, id: "new", slug: "new", updatedAt: "2026-07-03T00:00:00.000Z" },
      { ...baseItem, id: "middle", slug: "middle", updatedAt: "2026-07-02T00:00:00.000Z" },
    ];

    expect(getRecent(items, 2).map((item) => item.slug)).toEqual(["new", "middle"]);
  });

  it("does not change input order when returning recent items", () => {
    const items = [
      { ...baseItem, id: "old", slug: "old", updatedAt: "2026-07-01T00:00:00.000Z" },
      { ...baseItem, id: "new", slug: "new", updatedAt: "2026-07-03T00:00:00.000Z" },
      { ...baseItem, id: "middle", slug: "middle", updatedAt: "2026-07-02T00:00:00.000Z" },
    ];

    getRecent(items, 2);

    expect(items.map((item) => item.slug)).toEqual(["old", "new", "middle"]);
  });

  it("returns no recent items for a non-positive limit", () => {
    expect(getRecent(fixtureDataset.items, 0)).toEqual([]);
    expect(getRecent(fixtureDataset.items, -1)).toEqual([]);
  });

  it("returns content by slug and undefined for a missing slug", () => {
    expect(getBySlug(fixtureDataset.items, "feishu-bridge-team-entry")?.id).toBe("case-feishu-bridge");
    expect(getBySlug(fixtureDataset.items, "missing-content")).toBeUndefined();
  });

  it("returns deterministically ranked related content without the current item", () => {
    const current = {
      ...baseItem,
      id: "current",
      slug: "current",
      category: "团队案例",
      tags: ["共享标签", "当前标签"],
    };
    const items = [
      current,
      { ...baseItem, id: "category", slug: "category", category: "团队案例", tags: [], sortWeight: 100 },
      { ...baseItem, id: "tag", slug: "tag", category: "工具", tags: ["共享标签"], sortWeight: 90 },
      { ...baseItem, id: "both", slug: "both", category: "团队案例", tags: ["共享标签"], sortWeight: 1 },
      { ...baseItem, id: "unrelated", slug: "unrelated", category: "其他", tags: [], sortWeight: 999 },
    ];

    expect(getRelated(items, current, 3).map((item) => item.slug)).toEqual(["both", "category", "tag"]);
    expect(getRelated(items, current).map((item) => item.id)).not.toContain(current.id);
  });

  it("returns the top two related items when more than two candidates qualify", () => {
    const current = {
      ...baseItem,
      id: "current",
      slug: "current",
      category: "团队案例",
      tags: ["共享标签"],
    };
    const items = [
      current,
      { ...baseItem, id: "category", slug: "category", category: "团队案例", tags: [], sortWeight: 100 },
      { ...baseItem, id: "tag", slug: "tag", category: "工具", tags: ["共享标签"], sortWeight: 90 },
      { ...baseItem, id: "both", slug: "both", category: "团队案例", tags: ["共享标签"], sortWeight: 1 },
    ];

    const related = getRelated(items, current, 2);

    expect(related).toHaveLength(2);
    expect(related.map((item) => item.slug)).toEqual(["both", "category"]);
  });

  it("does not change input order when returning related items", () => {
    const current = {
      ...baseItem,
      id: "current",
      slug: "current",
      category: "团队案例",
      tags: ["共享标签"],
    };
    const items = [
      current,
      { ...baseItem, id: "lower", slug: "lower", category: "团队案例", tags: [], sortWeight: 1 },
      { ...baseItem, id: "higher", slug: "higher", category: "团队案例", tags: [], sortWeight: 100 },
    ];

    getRelated(items, current, 2);

    expect(items.map((item) => item.slug)).toEqual(["current", "lower", "higher"]);
  });

  it("returns no related items for a non-positive limit", () => {
    expect(getRelated(fixtureDataset.items, baseItem, 0)).toEqual([]);
    expect(getRelated(fixtureDataset.items, baseItem, -1)).toEqual([]);
  });
});
