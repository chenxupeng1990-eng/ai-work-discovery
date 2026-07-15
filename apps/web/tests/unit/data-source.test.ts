import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import generatedDataset from "../../src/generated/content.json";
import { PublicDatasetSchema } from "../../src/lib/schema";

const pagePaths = [
  "src/pages/index.astro",
  "src/pages/updates.astro",
  "src/pages/content/[slug].astro",
];

describe("production content data source", () => {
  it("keeps fixtures and public/data imports out of production pages", () => {
    const sources = pagePaths.map((path) => readFileSync(resolve(path), "utf8"));

    expect(sources.join("\n")).not.toMatch(/(?:data\/fixtures|public\/data)/);
    for (const source of sources) expect(source).toMatch(/lib\/public-dataset/);
  });

  it("keeps the Codex methods page on its independent validated static source", () => {
    const source = readFileSync(resolve("src/pages/discover.astro"), "utf8");
    expect(source).toMatch(/data\/codex-methods/);
    expect(source).not.toMatch(/(?:lib\/public-dataset|data\/fixtures|public\/data)/);
  });

  it("loads and validates the generated dataset through one production module", async () => {
    const loaderPath = resolve("src/lib/public-dataset.ts");
    expect(existsSync(loaderPath)).toBe(true);
    if (!existsSync(loaderPath)) return;

    const modulePath = "../../src/lib/public-dataset.ts";
    const { publicDataset } = await import(/* @vite-ignore */ modulePath);
    expect(publicDataset).toEqual(PublicDatasetSchema.parse(generatedDataset));
  });

  it("does not keep a second public JSON dataset", () => {
    expect(existsSync(resolve("public/data/content.json"))).toBe(false);
  });
});
