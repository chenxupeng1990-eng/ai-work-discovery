import { describe, expect, it } from "vitest";
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
  coverImage: "/images/case.png",
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
  it("rejects forbidden and draft publication values", () => {
    const result = PublicDatasetSchema.safeParse({
      generatedAt: "2026-07-13T00:00:00.000Z",
      items: [{ ...validItem, status: "Draft" }],
    });

    expect(result.success).toBe(false);
  });

  it.each(["status", "publicLevel", "rawInbox"])(
    "rejects the internal %s field",
    (field) => {
      const result = PublicDatasetSchema.safeParse({
        generatedAt: "2026-07-13T00:00:00.000Z",
        items: [{ ...validItem, [field]: "internal" }],
      });

      expect(result.success).toBe(false);
    },
  );

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
    expect(fixtureDataset.items).toHaveLength(8);
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
      "tool-github-codex-skills",
      "collaboration-ai-work-discovery-review",
      "getting-started-codex-dependencies",
    ]);
    expect(PublicDatasetSchema.parse(fixtureDataset)).toEqual(fixtureDataset);
    expect(PublicDatasetSchema.parse(generatedDataset)).toEqual(fixtureDataset);
  });
});
