import { describe, expect, it } from "vitest";

import generatedDataset from "../../src/generated/content.json";
import { PublicDatasetSchema } from "../../src/lib/schema";
import {
  MIAODA_SAFE_EXCLUDED_SLUGS,
  buildMiaodaSafeDataset,
} from "../../scripts/publish/miaoda-safe-content";

describe("buildMiaodaSafeDataset", () => {
  it("removes high-risk cases and neutralizes public network wording", () => {
    const source = PublicDatasetSchema.parse(generatedDataset);
    const safe = buildMiaodaSafeDataset(source);
    const excluded = new Set<string>(MIAODA_SAFE_EXCLUDED_SLUGS);

    expect(safe.items.length).toBe(source.items.length - excluded.size);
    expect(safe.items.some((item) => excluded.has(item.slug))).toBe(false);
    expect(JSON.stringify(safe)).not.toMatch(/\bVPN\b/iu);
    expect(safe.items.every((item) =>
      ["无需额外配置", "网络条件待确认"].includes(item.networkRequirement)
    )).toBe(true);
  });
});
