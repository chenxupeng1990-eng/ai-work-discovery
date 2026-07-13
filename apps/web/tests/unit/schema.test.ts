import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fixtureDataset } from "../../src/data/fixtures";
import generatedDataset from "../../src/generated/content.json";
import { PublicDatasetSchema } from "../../src/lib/schema";

const validItem = {
  id: "case-1",
  slug: "case-1",
  title: "Case",
  type: "Case",
  category: "Cases",
  summary: "Summary",
  recommendationReason: "Reason",
  coverImage: "/images/fixtures/case.png",
  tags: [],
  audience: [],
  scenario: "Team work",
  sourceName: "Public source",
  featured: false,
  sortWeight: 0,
  publishedAt: "2026-07-13T00:00:00.000Z",
  updatedAt: "2026-07-13T00:00:00.000Z",
  copyBlocks: [],
} as const;

describe("PublicDatasetSchema", () => {
  it("rejects Draft status", () => {
    const result = PublicDatasetSchema.safeParse({
      generatedAt: "2026-07-13T00:00:00.000Z",
      items: [{ ...validItem, status: "Draft" }],
    });

    expect(result.success).toBe(false);
  });

  it("rejects Forbidden publicLevel", () => {
    const result = PublicDatasetSchema.safeParse({
      generatedAt: "2026-07-13T00:00:00.000Z",
      items: [{ ...validItem, publicLevel: "Forbidden" }],
    });

    expect(result.success).toBe(false);
  });

  it("rejects the internal rawInbox field", () => {
    const result = PublicDatasetSchema.safeParse({
      generatedAt: "2026-07-13T00:00:00.000Z",
      items: [{ ...validItem, rawInbox: "internal" }],
    });

    expect(result.success).toBe(false);
  });

  it.each([
    "/images/fixtures/case.png",
    "/images/content/cases/case-cover.webp",
    "/images/fallback-card.webp",
  ])("accepts the controlled cover image path %s", (coverImage) => {
    const result = PublicDatasetSchema.safeParse({
      generatedAt: "2026-07-13T00:00:00.000Z",
      items: [{ ...validItem, coverImage }],
    });

    expect(result.success).toBe(true);
  });

  it.each([
    "https://example.com/cover.png",
    "http://example.com/cover.png",
    "https://open.feishu.cn/cover.png",
    "https://ai.example.com/generated-cover.webp",
    "/images/uploads/cover.png",
    "/images/content/../private/cover.png",
    "/images/fallback-card.png",
  ])("rejects the uncontrolled cover image path %s", (coverImage) => {
    const result = PublicDatasetSchema.safeParse({
      generatedAt: "2026-07-13T00:00:00.000Z",
      items: [{ ...validItem, coverImage }],
    });

    expect(result.success).toBe(false);
  });

  it("rejects extra fields at dataset and copy-block boundaries", () => {
    const datasetResult = PublicDatasetSchema.safeParse({
      generatedAt: "2026-07-13T00:00:00.000Z",
      items: [validItem],
      status: "Published",
    });
    const copyBlockResult = PublicDatasetSchema.safeParse({
      generatedAt: "2026-07-13T00:00:00.000Z",
      items: [{
        ...validItem,
        copyBlocks: [{
          id: "copy-1",
          title: "Command",
          type: "Command",
          language: "shell",
          content: "npm test",
          order: 0,
          rawInbox: "internal",
        }],
      }],
    });

    expect(datasetResult.success).toBe(false);
    expect(copyBlockResult.success).toBe(false);
  });

  it("validates realistic fixtures and their generated JSON", () => {
    expect(fixtureDataset.items).toHaveLength(10);
    expect(new Set(fixtureDataset.items.map((item) => item.type))).toEqual(new Set([
      "Case",
      "Inspiration",
      "Collaboration",
      "Tool",
      "Skill",
      "AI Signal",
      "Getting Started",
    ]));
    expect(fixtureDataset.items.map((item) => item.id)).toEqual([
      "case-feishu-bridge",
      "inspiration-storyboarding-video",
      "skill-codex-skills-roundup",
      "configuration-agents-md",
      "signal-ai-hot-agent-workflows",
      "signal-openai-agent-building-tools",
      "signal-anthropic-model-context-protocol",
      "tool-github-codex-skills",
      "collaboration-ai-work-discovery-review",
      "getting-started-codex-dependencies",
    ]);
    expect(PublicDatasetSchema.parse(fixtureDataset)).toEqual(fixtureDataset);
    expect(PublicDatasetSchema.parse(generatedDataset)).toEqual(fixtureDataset);
  });

  it("uses meaningful fixture update times that can drive latest sorting", () => {
    const updateTimes = fixtureDataset.items.map((item) => Date.parse(item.updatedAt));
    const generatedAt = Date.parse(fixtureDataset.generatedAt);

    expect(new Set(updateTimes).size).toBeGreaterThan(1);
    expect(updateTimes.every((updatedAt) => updatedAt <= generatedAt)).toBe(true);
  });

  it("provides three to five genuine AI Signal fixtures", () => {
    const signals = fixtureDataset.items.filter((item) => item.type === "AI Signal");

    expect(signals.length).toBeGreaterThanOrEqual(3);
    expect(signals.length).toBeLessThanOrEqual(5);
    expect(signals.every((item) => Boolean(item.originalUrl))).toBe(true);
  });

  it("keeps the public content JSON synchronized with fixtures", () => {
    const publicDataPath = resolve("public/data/content.json");

    expect(existsSync(publicDataPath)).toBe(true);
    expect(PublicDatasetSchema.parse(JSON.parse(readFileSync(publicDataPath, "utf8")))).toEqual(
      fixtureDataset,
    );
  });

  it("uses interface screenshots instead of the Feishu auth QR code", () => {
    const coversById = Object.fromEntries(
      fixtureDataset.items.map((item) => [item.id, item.coverImage]),
    );

    expect(coversById["case-feishu-bridge"]).toBe(
      "/images/fixtures/codex_environment_screen.png",
    );
    expect(coversById["collaboration-ai-work-discovery-review"]).toBe(
      "/images/fixtures/codex_environment_page_after_config.png",
    );
    expect(Object.values(coversById)).not.toContain(
      "/images/fixtures/feishu-docs-auth.png",
    );
  });
});
