# AI Work Discovery Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public Astro content-discovery website backed by reviewed Feishu Base records, with copyable resources, curated AI signals, and an AI-assisted inspiration inbox that only creates human-reviewable drafts.

**Architecture:** A single Astro application lives in `apps/web`. Astro generates all public routes and static JSON; React islands handle search, filters, and copy feedback. TypeScript sync scripts read and write Feishu Base through explicit adapters, process inbox records through an OpenAI-compatible API, download public assets, validate an allowlisted dataset, and only then permit a static deployment.

**Tech Stack:** Astro, React, TypeScript strict mode, Zod, Vitest, Testing Library, Playwright, native `fetch`, `tsx`, GitHub Actions, Cloudflare Pages-compatible static output.

## Global Constraints

- The site is public and must only expose `Published` records whose public level is `Public` or `Desensitized Case`.
- AI processing creates drafts and never publishes automatically.
- The browser must never call Feishu or the AI provider directly.
- Feishu and AI credentials must only come from environment variables or repository secrets.
- The visual system uses `#061b31` text, `#ffffff` canvas, `#e5edf5` rules, and `#533afd` functional accents.
- Letter spacing is always `0`; headings use font weight 300 or 400.
- Buttons, inputs, and content cards use at most `4px` radius; tags alone may be pills.
- No shadows, backdrop blur, decorative gradients, or ornamental blobs.
- Content images use stable aspect ratios and show the actual case, workflow, interface, or source when available.
- The sync schedule is every six hours and also supports manual dispatch.
- A failed sync or build must leave the currently deployed site unchanged.
- Implementation is scoped to the MVP exclusions in the approved design specification.

## Planned File Structure

```text
apps/web/
  astro.config.mjs                 Astro static-output and React integration
  package.json                     Commands and dependencies
  playwright.config.ts             Desktop/mobile end-to-end configuration
  tsconfig.json                    Strict TypeScript configuration
  vitest.config.ts                 Unit/component test configuration
  public/
    images/fallback-*.webp          Stable fallback covers
  scripts/
    sync-content.ts                Top-level synchronization command
    config.ts                      Environment parsing
    feishu/client.ts               Feishu token and Base HTTP client
    feishu/fields.ts               Feishu field-name constants
    feishu/map-records.ts          Base records to typed domain records
    inbox/detect-source.ts         URL/text/source detection
    inbox/fetch-metadata.ts        Bounded public metadata retrieval
    inbox/ai-enricher.ts           OpenAI-compatible structured enrichment
    inbox/process-inbox.ts         Draft creation orchestration
    publish/assets.ts              Public image download and normalization
    publish/build-dataset.ts       Allowlist, validation, and JSON generation
  src/
    components/
      AISignals.astro
      ContentCard.astro
      CopyBlock.tsx
      DiscoveryExplorer.tsx
      FeishuDocumentCard.astro
      FeaturedSpotlight.astro
      Footer.astro
      Header.astro
      ReadyToUse.astro
    data/fixtures.ts               Initial realistic local content
    generated/content.json         Generated public dataset
    layouts/BaseLayout.astro       Shared document shell
    lib/content-query.ts           Search/filter/sort functions
    lib/content.ts                 Dataset loading and route helpers
    lib/schema.ts                  Shared Zod schemas and inferred types
    pages/index.astro              Discovery homepage
    pages/discover.astro           Search/filter listing
    pages/content/[slug].astro     Content details
    pages/updates.astro            Recent updates
    styles/global.css              Visual tokens and responsive primitives
  tests/
    e2e/home.spec.ts
    e2e/discover.spec.ts
    e2e/detail.spec.ts
    unit/content-query.test.ts
    unit/map-records.test.ts
    unit/detect-source.test.ts
    unit/ai-enricher.test.ts
    unit/build-dataset.test.ts
.github/workflows/
  ci.yml                            Tests and production build
  sync-content.yml                  Six-hour/manual sync and deploy hook
docs/
  content-operations.md             Base schema and editor workflow
  deployment.md                     Secrets, hosting, and failure recovery
```

---

### Task 1: Scaffold the Astro Application and Quality Gates

**Files:**
- Create: `.gitignore`
- Create: `apps/web/package.json`
- Create: `apps/web/astro.config.mjs`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/src/pages/index.astro`
- Create: `apps/web/tests/setup.ts`

**Interfaces:**
- Produces: npm commands `dev`, `build`, `check`, `test`, `test:e2e`, and `sync` used by every later task.
- Produces: an Astro static-output application rooted at `apps/web`.

- [ ] **Step 1: Add repository and generated-file ignores**

```gitignore
.superpowers/
**/node_modules/
**/dist/
**/.astro/
**/playwright-report/
**/test-results/
apps/web/.env
apps/web/src/generated/*.tmp.json
```

- [ ] **Step 2: Create the package manifest**

```json
{
  "name": "ai-work-discovery-site",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "astro dev",
    "build": "astro check && astro build",
    "check": "astro check",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "sync": "tsx scripts/sync-content.ts"
  },
  "dependencies": {
    "@astrojs/react": "latest",
    "astro": "latest",
    "cheerio": "latest",
    "react": "latest",
    "react-dom": "latest",
    "zod": "latest"
  },
  "devDependencies": {
    "@astrojs/check": "latest",
    "@playwright/test": "latest",
    "@testing-library/jest-dom": "latest",
    "@testing-library/react": "latest",
    "@types/node": "latest",
    "@types/react": "latest",
    "@types/react-dom": "latest",
    "jsdom": "latest",
    "tsx": "latest",
    "typescript": "latest",
    "vitest": "latest"
  }
}
```

- [ ] **Step 3: Configure Astro, TypeScript, Vitest, and Playwright**

```js
// apps/web/astro.config.mjs
import { defineConfig } from "astro/config";
import react from "@astrojs/react";

export default defineConfig({
  output: "static",
  integrations: [react()],
});
```

```json
// apps/web/tsconfig.json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  }
}
```

```ts
// apps/web/vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "jsdom", setupFiles: ["./tests/setup.ts"] },
});
```

```ts
// apps/web/tests/setup.ts
import "@testing-library/jest-dom/vitest";
```

```ts
// apps/web/playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  webServer: { command: "npm run dev -- --host 127.0.0.1", port: 4321, reuseExistingServer: true },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } }
  ]
});
```

- [ ] **Step 4: Add the initial page and install dependencies**

```astro
---
---
<html lang="zh-CN"><body><main><h1>AI Work Discovery</h1></main></body></html>
```

Run: `cd apps/web; npm install; npx playwright install chromium`

Expected: `package-lock.json` is created and installation exits with code 0.

- [ ] **Step 5: Verify the scaffold**

Run: `cd apps/web; npm run check; npm run build`

Expected: Astro reports no errors and writes `apps/web/dist/index.html`.

- [ ] **Step 6: Commit**

```bash
git add .gitignore apps/web
git commit -m "chore: scaffold Astro discovery site"
```

### Task 2: Define the Public Content Contract and Realistic Fixtures

**Files:**
- Create: `apps/web/src/lib/schema.ts`
- Create: `apps/web/src/data/fixtures.ts`
- Create: `apps/web/src/generated/content.json`
- Create: `apps/web/tests/unit/schema.test.ts`

**Interfaces:**
- Produces: `ContentItemSchema`, `CopyBlockSchema`, `PublicDatasetSchema`, `ContentItem`, and `PublicDataset`.
- Produces: `fixtureDataset` used until Feishu synchronization is enabled.

- [ ] **Step 1: Write the failing schema test**

```ts
import { describe, expect, it } from "vitest";
import { PublicDatasetSchema } from "../../src/lib/schema";

describe("PublicDatasetSchema", () => {
  it("rejects forbidden and draft publication values", () => {
    const result = PublicDatasetSchema.safeParse({ generatedAt: "2026-07-13T00:00:00.000Z", items: [{ status: "Draft" }] });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `cd apps/web; npm test -- tests/unit/schema.test.ts`

Expected: FAIL because `src/lib/schema.ts` does not exist.

- [ ] **Step 3: Implement the domain schemas**

```ts
import { z } from "zod";

export const CopyBlockSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  type: z.enum(["Prompt", "Command", "Path", "Configuration", "Code"]),
  language: z.string().min(1),
  content: z.string().min(1),
  order: z.number().int().nonnegative(),
  note: z.string().optional()
});

export const ContentItemSchema = z.object({
  id: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(1),
  type: z.enum(["Case", "Inspiration", "Collaboration", "Tool", "Skill", "AI Signal", "Getting Started"]),
  category: z.string().min(1),
  summary: z.string().min(1),
  recommendationReason: z.string().min(1),
  coverImage: z.string().min(1),
  tags: z.array(z.string()),
  audience: z.array(z.string()),
  scenario: z.string().min(1),
  originalUrl: z.string().url().optional(),
  feishuDocumentUrl: z.string().url().optional(),
  sourceName: z.string().min(1),
  featured: z.boolean(),
  sortWeight: z.number(),
  publishedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  copyBlocks: z.array(CopyBlockSchema)
});

export const PublicDatasetSchema = z.object({
  generatedAt: z.string().datetime(),
  items: z.array(ContentItemSchema)
});

export type CopyBlock = z.infer<typeof CopyBlockSchema>;
export type ContentItem = z.infer<typeof ContentItemSchema>;
export type PublicDataset = z.infer<typeof PublicDatasetSchema>;
```

- [ ] **Step 4: Add at least eight realistic fixture records**

Create records covering all homepage surfaces: Feishu Bridge case, storyboarding video workflow, Codex Skills roundup, AGENTS.md configuration, an AI HOT signal, a GitHub project, a collaboration method, and a getting-started dependency checklist. Use existing local screenshots copied into `apps/web/public/images/fixtures/`; do not use generic decorative placeholders.

```ts
import type { PublicDataset } from "../lib/schema";

export const fixtureDataset: PublicDataset = {
  generatedAt: "2026-07-13T00:00:00.000Z",
  items: [
    {
      id: "case-feishu-bridge",
      slug: "feishu-bridge-team-entry",
      title: "用飞书把 Codex 变成团队可调用的工作入口",
      type: "Case",
      category: "协作方式",
      summary: "Bot、Bridge、公开文档与任务如何形成低门槛的团队入口。",
      recommendationReason: "适合需要让非技术同事直接调用 Codex 能力的团队。",
      coverImage: "/images/fixtures/feishu-bridge.png",
      tags: ["Codex", "飞书", "Bridge"],
      audience: ["团队负责人", "运营"],
      scenario: "团队 AI 协作",
      sourceName: "团队脱敏案例",
      featured: true,
      sortWeight: 100,
      publishedAt: "2026-07-13T00:00:00.000Z",
      updatedAt: "2026-07-13T00:00:00.000Z",
      copyBlocks: []
    }
  ]
};
```

- [ ] **Step 5: Generate and validate the initial JSON**

Serialize `fixtureDataset` to `src/generated/content.json` and add a test asserting every fixture passes `PublicDatasetSchema.parse`.

Run: `cd apps/web; npm test -- tests/unit/schema.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/schema.ts apps/web/src/data apps/web/src/generated apps/web/public/images/fixtures apps/web/tests/unit/schema.test.ts
git commit -m "feat: define public content contract"
```

### Task 3: Implement Search, Filtering, Sorting, and Route Helpers

**Files:**
- Create: `apps/web/src/lib/content-query.ts`
- Create: `apps/web/src/lib/content.ts`
- Create: `apps/web/tests/unit/content-query.test.ts`

**Interfaces:**
- Consumes: `ContentItem` and `PublicDataset` from `src/lib/schema.ts`.
- Produces: `queryContent(items, options)`, `getFeatured(items)`, `getRecent(items, limit)`, `getBySlug(items, slug)`, and `getRelated(items, item, limit)`.

- [ ] **Step 1: Write failing query tests**

```ts
import { describe, expect, it } from "vitest";
import { fixtureDataset } from "../../src/data/fixtures";
import { queryContent } from "../../src/lib/content-query";

describe("queryContent", () => {
  it("matches Chinese text across title, summary, tags, and source", () => {
    const result = queryContent(fixtureDataset.items, { query: "飞书", category: "全部", sort: "featured" });
    expect(result.map((item) => item.slug)).toContain("feishu-bridge-team-entry");
  });

  it("sorts featured results by weight then update time", () => {
    const result = queryContent(fixtureDataset.items, { query: "", category: "全部", sort: "featured" });
    expect(result[0].sortWeight).toBeGreaterThanOrEqual(result[1].sortWeight);
  });
});
```

- [ ] **Step 2: Verify the tests fail**

Run: `cd apps/web; npm test -- tests/unit/content-query.test.ts`

Expected: FAIL because `queryContent` is missing.

- [ ] **Step 3: Implement normalized search and deterministic sorting**

```ts
import type { ContentItem } from "./schema";

export type QueryOptions = { query: string; category: string; sort: "featured" | "latest" };

const normalize = (value: string) => value.trim().toLocaleLowerCase("zh-CN");

export function queryContent(items: ContentItem[], options: QueryOptions): ContentItem[] {
  const needle = normalize(options.query);
  return items
    .filter((item) => options.category === "全部" || item.category === options.category)
    .filter((item) => {
      if (!needle) return true;
      return normalize([item.title, item.summary, item.recommendationReason, item.sourceName, ...item.tags].join(" ")).includes(needle);
    })
    .toSorted((a, b) => options.sort === "latest"
      ? Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
      : b.sortWeight - a.sortWeight || Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}
```

- [ ] **Step 4: Add route helpers with tests for missing and related content**

```ts
export function getBySlug(items: ContentItem[], slug: string): ContentItem | undefined {
  return items.find((item) => item.slug === slug);
}

export function getRelated(items: ContentItem[], current: ContentItem, limit = 3): ContentItem[] {
  return items
    .filter((item) => item.id !== current.id)
    .map((item) => ({ item, score: item.tags.filter((tag) => current.tags.includes(tag)).length + Number(item.category === current.category) }))
    .filter(({ score }) => score > 0)
    .toSorted((a, b) => b.score - a.score || b.item.sortWeight - a.item.sortWeight)
    .slice(0, limit)
    .map(({ item }) => item);
}
```

Run: `cd apps/web; npm test -- tests/unit/content-query.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib apps/web/tests/unit/content-query.test.ts
git commit -m "feat: add content discovery queries"
```

### Task 4: Build the Visual System, Shared Layout, and Navigation

**Files:**
- Create: `apps/web/src/styles/global.css`
- Create: `apps/web/src/layouts/BaseLayout.astro`
- Create: `apps/web/src/components/Header.astro`
- Create: `apps/web/src/components/Footer.astro`
- Modify: `apps/web/src/pages/index.astro`
- Create: `apps/web/tests/e2e/home.spec.ts`

**Interfaces:**
- Produces: `<BaseLayout title description>` used by every page.
- Produces: shared `.container`, `.section`, `.button-primary`, `.button-secondary`, `.tag`, and grid primitives.

- [ ] **Step 1: Write a failing structural end-to-end test**

```ts
import { expect, test } from "@playwright/test";

test("homepage exposes navigation and a single main landmark", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("banner")).toBeVisible();
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "发现" })).toBeVisible();
});
```

- [ ] **Step 2: Verify the test fails**

Run: `cd apps/web; npm run test:e2e -- tests/e2e/home.spec.ts`

Expected: FAIL because the shared header is absent.

- [ ] **Step 3: Implement tokens and responsive layout primitives**

```css
:root {
  --ink: #061b31;
  --slate: #64748d;
  --steel: #50617a;
  --canvas: #ffffff;
  --mist: #f8fafd;
  --frost: #e5edf5;
  --indigo: #533afd;
  --indigo-hover: #7389ff;
  --lavender: #b9b9f9;
  --wash: #e8e9ff;
  --max-width: 1320px;
  font-family: Inter, "Noto Sans SC", system-ui, sans-serif;
  color: var(--ink);
  background: var(--canvas);
  letter-spacing: 0;
}

* { box-sizing: border-box; }
body { margin: 0; min-width: 320px; font-size: 16px; line-height: 1.45; }
a { color: inherit; }
.container { width: min(calc(100% - 48px), var(--max-width)); margin-inline: auto; }
.section { padding-block: 80px; border-top: 1px solid var(--frost); }
.button-primary, .button-secondary { min-height: 44px; border-radius: 4px; padding: 0 18px; display: inline-flex; align-items: center; gap: 8px; }
.button-primary { background: var(--indigo); color: white; border: 1px solid var(--indigo); }
.button-secondary { background: white; color: var(--indigo); border: 1px solid var(--lavender); }
@media (max-width: 720px) { .container { width: min(calc(100% - 32px), var(--max-width)); } .section { padding-block: 56px; } }
```

- [ ] **Step 4: Implement the base layout, header, and footer**

`Header.astro` must use text navigation, a familiar search icon button with tooltip, and a compact submit-content command. Mobile navigation must not overlap or resize the header.

```astro
---
import Header from "../components/Header.astro";
import Footer from "../components/Footer.astro";
import "../styles/global.css";
const { title, description } = Astro.props;
---
<!doctype html>
<html lang="zh-CN">
  <head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width" /><title>{title}</title><meta name="description" content={description} /></head>
  <body><Header /><main><slot /></main><Footer /></body>
</html>
```

- [ ] **Step 5: Run accessibility structure and build checks**

Run: `cd apps/web; npm run check; npm run test:e2e -- tests/e2e/home.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/styles apps/web/src/layouts apps/web/src/components/Header.astro apps/web/src/components/Footer.astro apps/web/src/pages/index.astro apps/web/tests/e2e/home.spec.ts
git commit -m "feat: add discovery site visual foundation"
```

### Task 5: Build the Discovery Homepage

**Files:**
- Create: `apps/web/src/components/FeaturedSpotlight.astro`
- Create: `apps/web/src/components/ContentCard.astro`
- Create: `apps/web/src/components/AISignals.astro`
- Create: `apps/web/src/components/ReadyToUse.astro`
- Modify: `apps/web/src/pages/index.astro`
- Modify: `apps/web/tests/e2e/home.spec.ts`

**Interfaces:**
- Consumes: `ContentItem[]` loaded through `src/lib/content.ts`.
- Produces: homepage sections for spotlight, category discovery, featured cards, AI signals, ready-to-use content, and recent updates.

- [ ] **Step 1: Extend the homepage test with approved content hierarchy**

```ts
test("homepage prioritizes discovery rather than a rigid course", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("AI");
  await expect(page.getByRole("heading", { name: "值得一试" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "AI 风向" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "随手可用" })).toBeVisible();
  await expect(page.getByText("学习进度")).toHaveCount(0);
});
```

- [ ] **Step 2: Verify the extended test fails**

Run: `cd apps/web; npm run test:e2e -- tests/e2e/home.spec.ts`

Expected: FAIL because the sections do not exist.

- [ ] **Step 3: Implement the featured spotlight and repeated content card**

The spotlight uses an actual content image as a full-width background with an opaque contrast layer, fixed desktop/mobile heading sizes, and a hint of the next section in the initial viewport. `ContentCard.astro` uses a stable `16 / 10` cover aspect ratio, 4px radius, no shadow, and a fixed metadata row.

```astro
---
import type { ContentItem } from "../lib/schema";
const { item } = Astro.props as { item: ContentItem };
---
<article class="content-card">
  <a href={`/content/${item.slug}`} aria-label={item.title}>
    <img src={item.coverImage} alt="" width="640" height="400" loading="lazy" />
    <div class="content-card__body"><span class="tag">{item.category}</span><h3>{item.title}</h3><p>{item.summary}</p></div>
  </a>
</article>
```

- [ ] **Step 4: Compose the homepage with bounded item counts**

Display one spotlight, four to six featured cards, three to five AI signals, three ready-to-use resources, and six recent updates. Do not render every record on the homepage.

- [ ] **Step 5: Verify desktop and mobile layouts**

Run: `cd apps/web; npm run check; npm run test:e2e -- tests/e2e/home.spec.ts --project=desktop; npm run test:e2e -- tests/e2e/home.spec.ts --project=mobile`

Expected: PASS with no horizontal scroll and all headings visible.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components apps/web/src/pages/index.astro apps/web/tests/e2e/home.spec.ts
git commit -m "feat: build discovery-first homepage"
```

### Task 6: Add Searchable and Filterable Discovery Listing

**Files:**
- Create: `apps/web/src/components/DiscoveryExplorer.tsx`
- Create: `apps/web/src/pages/discover.astro`
- Create: `apps/web/tests/e2e/discover.spec.ts`

**Interfaces:**
- Consumes: serialized `ContentItem[]` and `queryContent` behavior.
- Produces: client-side search, category chips, and featured/latest segmented sorting.

- [ ] **Step 1: Write failing listing interactions**

```ts
import { expect, test } from "@playwright/test";

test("search, category, and sorting update the visible results", async ({ page }) => {
  await page.goto("/discover");
  await page.getByRole("searchbox", { name: "搜索内容" }).fill("飞书");
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.getByRole("button", { name: "最新" }).click();
  await expect(page.getByRole("button", { name: "最新" })).toHaveAttribute("aria-pressed", "true");
});
```

- [ ] **Step 2: Verify failure**

Run: `cd apps/web; npm run test:e2e -- tests/e2e/discover.spec.ts`

Expected: FAIL because `/discover` does not exist.

- [ ] **Step 3: Implement the React explorer**

Use one state object `{ query, category, sort }`, derive results with `useMemo`, and announce result count in an `aria-live="polite"` region. Buttons use stable labels and `aria-pressed`; category and sort changes must not move the control bar.

```tsx
export function DiscoveryExplorer({ items }: { items: ContentItem[] }) {
  const [options, setOptions] = useState<QueryOptions>({ query: "", category: "全部", sort: "featured" });
  const results = useMemo(() => queryContent(items, options), [items, options]);
  return <section>{/* search, filters, stable grid, empty state */}</section>;
}
```

- [ ] **Step 4: Add the Astro route and hydrate only the explorer**

```astro
---
import BaseLayout from "../layouts/BaseLayout.astro";
import { DiscoveryExplorer } from "../components/DiscoveryExplorer";
import { loadDataset } from "../lib/content";
const { items } = loadDataset();
---
<BaseLayout title="发现 | VIBEWORK" description="发现 AI 工作灵感、协作方式、案例和工具。">
  <DiscoveryExplorer client:load items={items} />
</BaseLayout>
```

- [ ] **Step 5: Verify interactions and empty state**

Run: `cd apps/web; npm run check; npm run test:e2e -- tests/e2e/discover.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/DiscoveryExplorer.tsx apps/web/src/pages/discover.astro apps/web/tests/e2e/discover.spec.ts
git commit -m "feat: add searchable discovery listing"
```

### Task 7: Build Content Detail Pages, Feishu Cards, and Copy Actions

**Files:**
- Create: `apps/web/src/components/CopyBlock.tsx`
- Create: `apps/web/src/components/FeishuDocumentCard.astro`
- Create: `apps/web/src/pages/content/[slug].astro`
- Create: `apps/web/src/pages/updates.astro`
- Create: `apps/web/tests/e2e/detail.spec.ts`

**Interfaces:**
- Consumes: `getBySlug`, `getRelated`, and `ContentItem.copyBlocks`.
- Produces: statically generated detail routes and accessible copy behavior.

- [ ] **Step 1: Write failing detail-page tests**

```ts
test("detail page copies a command without shifting the control", async ({ page }) => {
  await page.goto("/content/codex-agents-template");
  const button = page.getByRole("button", { name: "复制 团队 AGENTS.md 模板" });
  const before = await button.boundingBox();
  await button.click();
  await expect(button).toHaveAccessibleName("已复制 团队 AGENTS.md 模板");
  expect(await button.boundingBox()).toEqual(before);
});

test("Feishu document card opens the explicit public source", async ({ page }) => {
  await page.goto("/content/feishu-bridge-team-entry");
  await expect(page.getByRole("link", { name: /打开飞书原文/ })).toHaveAttribute("href", /^https:\/\//);
});
```

- [ ] **Step 2: Verify failure**

Run: `cd apps/web; npm run test:e2e -- tests/e2e/detail.spec.ts`

Expected: FAIL because the detail routes and controls do not exist.

- [ ] **Step 3: Implement copy behavior with fixed dimensions**

```tsx
export function CopyBlockView({ block }: { block: CopyBlock }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(block.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }
  const state = copied ? "已复制" : "复制";
  return <section><header><h2>{block.title}</h2><button aria-label={`${state} ${block.title}`} onClick={copy}>⧉</button></header><pre><code>{block.content}</code></pre></section>;
}
```

- [ ] **Step 4: Generate detail routes and related content**

Use `getStaticPaths()` over the validated public dataset. Return a 404 only for paths absent from the generated dataset; never fetch a record from Feishu at request time.

- [ ] **Step 5: Implement the Feishu document preview and updates route**

The preview uses maintained title, summary, cover, tags, and URL. The updates route sorts by `updatedAt` and groups records by date without introducing a separate changelog database.

- [ ] **Step 6: Verify and commit**

Run: `cd apps/web; npm run check; npm run test:e2e -- tests/e2e/detail.spec.ts`

Expected: PASS.

```bash
git add apps/web/src/components/CopyBlock.tsx apps/web/src/components/FeishuDocumentCard.astro apps/web/src/pages/content apps/web/src/pages/updates.astro apps/web/tests/e2e/detail.spec.ts
git commit -m "feat: add content details and copy actions"
```

### Task 8: Implement Feishu Authentication, Base Reads, and Record Mapping

**Files:**
- Create: `apps/web/scripts/config.ts`
- Create: `apps/web/scripts/feishu/client.ts`
- Create: `apps/web/scripts/feishu/fields.ts`
- Create: `apps/web/scripts/feishu/map-records.ts`
- Create: `apps/web/tests/unit/map-records.test.ts`

**Interfaces:**
- Produces: `loadSyncConfig(env)`, `FeishuClient.listRecords(tableId)`, `FeishuClient.createRecord(tableId, fields)`, and `mapPublishedContent(records, copyRecords)`.
- Produces: typed raw record shape `{ record_id: string; fields: Record<string, unknown> }`.

- [ ] **Step 1: Write failing mapping tests with Chinese Base field names**

```ts
it("publishes only approved public records", () => {
  const records = [
    record({ 标题: "公开案例", 发布状态: "已发布", 公开级别: "公开" }),
    record({ 标题: "草稿", 发布状态: "草稿", 公开级别: "公开" }),
    record({ 标题: "禁止", 发布状态: "已发布", 公开级别: "禁止发布" })
  ];
  expect(mapPublishedContent(records, []).map((item) => item.title)).toEqual(["公开案例"]);
});
```

- [ ] **Step 2: Verify failure**

Run: `cd apps/web; npm test -- tests/unit/map-records.test.ts`

Expected: FAIL because the mapper is missing.

- [ ] **Step 3: Define exact environment and field contracts**

```ts
export const SyncConfigSchema = z.object({
  FEISHU_APP_ID: z.string().min(1),
  FEISHU_APP_SECRET: z.string().min(1),
  FEISHU_BASE_APP_TOKEN: z.string().min(1),
  FEISHU_CONTENT_TABLE_ID: z.string().min(1),
  FEISHU_COPY_BLOCKS_TABLE_ID: z.string().min(1),
  FEISHU_INBOX_TABLE_ID: z.string().min(1),
  AI_BASE_URL: z.string().url(),
  AI_API_KEY: z.string().min(1),
  AI_MODEL: z.string().min(1)
});
```

`fields.ts` must define every Chinese Base field name once. Mapping code imports constants instead of repeating strings.

- [ ] **Step 4: Implement the native-fetch Feishu client**

Acquire `tenant_access_token` from `/open-apis/auth/v3/tenant_access_token/internal`, cache it for the process, paginate `/open-apis/bitable/v1/apps/{appToken}/tables/{tableId}/records`, and throw typed errors for non-zero Feishu response codes. Do not log request headers or secrets.

- [ ] **Step 5: Implement and verify mapping**

Map only allowlisted fields, join copy blocks by linked record id, normalize Feishu attachment values into source asset URLs, and validate the result with `ContentItemSchema`.

Run: `cd apps/web; npm test -- tests/unit/map-records.test.ts`

Expected: PASS for approved records and explicit rejection messages for missing required fields.

- [ ] **Step 6: Commit**

```bash
git add apps/web/scripts/config.ts apps/web/scripts/feishu apps/web/tests/unit/map-records.test.ts
git commit -m "feat: add Feishu content adapter"
```

### Task 9: Build the Public Dataset and Asset Pipeline

**Files:**
- Create: `apps/web/scripts/publish/assets.ts`
- Create: `apps/web/scripts/publish/build-dataset.ts`
- Create: `apps/web/tests/unit/build-dataset.test.ts`

**Interfaces:**
- Consumes: mapped `ContentItem[]` and remote attachment URLs.
- Produces: `buildPublicDataset(items, options): Promise<PublicDataset>` and local cover paths under `public/images/content/`.

- [ ] **Step 1: Write failing allowlist and asset-fallback tests**

```ts
it("does not serialize raw fields or private publication metadata", async () => {
  const dataset = await buildPublicDataset([mappedItem], { downloadAsset: fakeDownload });
  const serialized = JSON.stringify(dataset);
  expect(serialized).not.toContain("app_secret");
  expect(serialized).not.toContain("Raw Content");
});

it("uses a type fallback when cover download fails", async () => {
  const dataset = await buildPublicDataset([mappedItem], { downloadAsset: async () => { throw new Error("network"); } });
  expect(dataset.items[0].coverImage).toBe("/images/fallback-case.webp");
});
```

- [ ] **Step 2: Verify failure**

Run: `cd apps/web; npm test -- tests/unit/build-dataset.test.ts`

Expected: FAIL because the publisher is missing.

- [ ] **Step 3: Implement bounded asset retrieval**

Only accept `https:` sources, enforce a 10-second timeout, reject responses larger than 8 MB, accept `image/jpeg`, `image/png`, and `image/webp`, hash the content for a stable filename, and write only inside `apps/web/public/images/content`.

- [ ] **Step 4: Implement dataset validation and atomic output**

Write to `src/generated/content.tmp.json`, parse it back with `PublicDatasetSchema`, then rename it to `content.json`. If validation fails, delete the temporary file and leave the existing generated dataset untouched.

- [ ] **Step 5: Verify tests and inspect serialized keys**

Run: `cd apps/web; npm test -- tests/unit/build-dataset.test.ts`

Expected: PASS and no private fields in serialized output.

- [ ] **Step 6: Commit**

```bash
git add apps/web/scripts/publish apps/web/tests/unit/build-dataset.test.ts apps/web/public/images/fallback-*.webp
git commit -m "feat: add safe public dataset pipeline"
```

### Task 10: Implement Inbox Source Detection and Metadata Retrieval

**Files:**
- Create: `apps/web/scripts/inbox/detect-source.ts`
- Create: `apps/web/scripts/inbox/fetch-metadata.ts`
- Create: `apps/web/tests/unit/detect-source.test.ts`

**Interfaces:**
- Produces: `detectSource(raw): DetectedSource` and `fetchPublicMetadata(source): Promise<SourceMetadata>`.
- `DetectedSource.kind` is one of `feishu`, `github`, `aihot`, `web`, `code`, `prompt`, or `text`.

- [ ] **Step 1: Write failing detection tests**

```ts
it.each([
  ["https://my.feishu.cn/docx/abc", "feishu"],
  ["https://github.com/owner/repo", "github"],
  ["https://aihot.virxact.com/article/123", "aihot"],
  ["npm install astro", "code"],
  ["请帮我分析这个工作流", "prompt"]
])("detects %s as %s", (raw, kind) => expect(detectSource(raw).kind).toBe(kind));
```

- [ ] **Step 2: Verify failure**

Run: `cd apps/web; npm test -- tests/unit/detect-source.test.ts`

Expected: FAIL because detection is missing.

- [ ] **Step 3: Implement deterministic source detection**

URL parsing takes precedence over text heuristics. GitHub, Feishu, and AI HOT use hostname checks; code uses bounded command/fence patterns; remaining interrogative or instruction-like text is a prompt; other input is text.

- [ ] **Step 4: Implement bounded public metadata retrieval**

Retrieve only public HTTP(S) pages with a 10-second timeout and 2 MB text limit. Parse HTML with `cheerio` and extract title, description, canonical URL, and the first suitable public image from metadata. Do not execute scripts, authenticate, inspect cookies, or bypass access controls.

- [ ] **Step 5: Verify tests and commit**

Run: `cd apps/web; npm test -- tests/unit/detect-source.test.ts`

Expected: PASS.

```bash
git add apps/web/scripts/inbox/detect-source.ts apps/web/scripts/inbox/fetch-metadata.ts apps/web/tests/unit/detect-source.test.ts
git commit -m "feat: detect and inspect inbox sources"
```

### Task 11: Add OpenAI-Compatible Draft Enrichment and Feishu Draft Writes

**Files:**
- Create: `apps/web/scripts/inbox/ai-enricher.ts`
- Create: `apps/web/scripts/inbox/process-inbox.ts`
- Create: `apps/web/tests/unit/ai-enricher.test.ts`

**Interfaces:**
- Consumes: `SourceMetadata`, editor note, `SyncConfig`, and `FeishuClient`.
- Produces: `enrichDraft(input): Promise<DraftProposal>` and `processPendingInbox(client, config): Promise<InboxProcessingSummary>`.

- [ ] **Step 1: Write failing structured-response tests**

```ts
it("rejects an AI response that attempts to publish", () => {
  const response = JSON.stringify({ title: "x", category: "行业前瞻", publicationStatus: "已发布" });
  expect(() => parseDraftProposal(response)).toThrow(/draft/i);
});

it("accepts a bounded review draft", async () => {
  const proposal = parseDraftProposal(validDraftJson);
  expect(proposal.publicationStatus).toBe("草稿");
  expect(proposal.summary.length).toBeLessThanOrEqual(180);
});
```

- [ ] **Step 2: Verify failure**

Run: `cd apps/web; npm test -- tests/unit/ai-enricher.test.ts`

Expected: FAIL because enrichment is missing.

- [ ] **Step 3: Define and enforce the AI output schema**

```ts
const DraftProposalSchema = z.object({
  title: z.string().min(1).max(80),
  summary: z.string().min(1).max(180),
  recommendationReason: z.string().min(1).max(160),
  contentType: z.enum(["案例", "灵感", "协作方式", "工具", "Skill", "AI 风向", "基础上手"]),
  category: z.string().min(1).max(20),
  tags: z.array(z.string().max(20)).max(8),
  publicationStatus: z.literal("草稿"),
  copyBlocks: z.array(z.object({ title: z.string(), type: z.string(), language: z.string(), content: z.string().max(12000) })).max(6)
});
```

- [ ] **Step 4: Implement the provider-neutral request**

POST to `${AI_BASE_URL}/chat/completions` with `Authorization: Bearer ${AI_API_KEY}`, the configured model, temperature `0.2`, and a response-format request for JSON when supported. Provide only the bounded metadata and editor note. Parse and validate every response before writing to Feishu.

- [ ] **Step 5: Implement inbox processing and draft creation**

For each Pending record: mark Processing, detect and fetch metadata, enrich, create a Content record with `发布状态=草稿`, create linked Copy Block records, then mark the inbox `待审核` with the draft record id. On failure, mark `失败` with a concise error and continue processing later records.

- [ ] **Step 6: Verify tests and commit**

Run: `cd apps/web; npm test -- tests/unit/ai-enricher.test.ts`

Expected: PASS and every accepted proposal has literal draft status.

```bash
git add apps/web/scripts/inbox/ai-enricher.ts apps/web/scripts/inbox/process-inbox.ts apps/web/tests/unit/ai-enricher.test.ts
git commit -m "feat: create review drafts from inspiration inbox"
```

### Task 12: Orchestrate Synchronization and Preserve the Last Good Build

**Files:**
- Create: `apps/web/scripts/sync-content.ts`
- Create: `apps/web/tests/unit/sync-content.test.ts`
- Modify: `apps/web/package.json`

**Interfaces:**
- Consumes: all Feishu, inbox, asset, and dataset modules.
- Produces: process exit code 0 only when inbox processing is isolated and the approved public dataset is valid.

- [ ] **Step 1: Write failing orchestration tests**

```ts
it("does not replace public JSON when Feishu read fails", async () => {
  await expect(runSync({ client: failingClient, output: memoryOutput })).rejects.toThrow("Feishu read failed");
  expect(memoryOutput.replaceCalls).toBe(0);
});

it("continues publication when one inbox item fails", async () => {
  const summary = await runSync({ client: clientWithOneBadInboxItem, output: memoryOutput });
  expect(summary.inbox.failed).toBe(1);
  expect(summary.published).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Verify failure**

Run: `cd apps/web; npm test -- tests/unit/sync-content.test.ts`

Expected: FAIL because orchestration is missing.

- [ ] **Step 3: Implement the two-phase command**

```ts
export async function runSync(deps: SyncDependencies): Promise<SyncSummary> {
  const inbox = await processPendingInboxSafely(deps);
  const [contentRecords, copyRecords] = await Promise.all([
    deps.client.listRecords(deps.config.FEISHU_CONTENT_TABLE_ID),
    deps.client.listRecords(deps.config.FEISHU_COPY_BLOCKS_TABLE_ID)
  ]);
  const mapped = mapPublishedContent(contentRecords, copyRecords);
  const dataset = await buildPublicDataset(mapped, deps.publisher);
  await deps.output.replaceAtomically(dataset);
  return { inbox, published: dataset.items.length };
}
```

- [ ] **Step 4: Add concise operational output**

Print counts for pending, processed, failed, skipped, and published records. Never print raw inbox content, document bodies, tokens, secrets, or authorization headers.

- [ ] **Step 5: Verify unit tests and production build after fixture sync**

Run: `cd apps/web; npm test; npm run build`

Expected: all unit tests pass and the generated dataset builds successfully.

- [ ] **Step 6: Commit**

```bash
git add apps/web/scripts/sync-content.ts apps/web/tests/unit/sync-content.test.ts apps/web/package.json
git commit -m "feat: orchestrate safe content synchronization"
```

### Task 13: Add CI, Scheduled Synchronization, and Operations Documentation

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/sync-content.yml`
- Create: `docs/content-operations.md`
- Create: `docs/deployment.md`

**Interfaces:**
- Produces: pull-request quality gates, six-hour synchronization, manual dispatch, and documented secret/configuration contracts.

- [ ] **Step 1: Add CI for tests and static build**

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: apps/web } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm, cache-dependency-path: apps/web/package-lock.json }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm test
      - run: npm run check
      - run: npm run build
      - run: npm run test:e2e
```

- [ ] **Step 2: Add six-hour and manual synchronization**

```yaml
name: Sync public content
on:
  schedule:
    - cron: "17 */6 * * *"
  workflow_dispatch:
jobs:
  sync:
    runs-on: ubuntu-latest
    permissions: { contents: write }
    defaults: { run: { working-directory: apps/web } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm, cache-dependency-path: apps/web/package-lock.json }
      - run: npm ci
      - run: npm run sync
        env:
          FEISHU_APP_ID: ${{ secrets.FEISHU_APP_ID }}
          FEISHU_APP_SECRET: ${{ secrets.FEISHU_APP_SECRET }}
          FEISHU_BASE_APP_TOKEN: ${{ secrets.FEISHU_BASE_APP_TOKEN }}
          FEISHU_CONTENT_TABLE_ID: ${{ secrets.FEISHU_CONTENT_TABLE_ID }}
          FEISHU_COPY_BLOCKS_TABLE_ID: ${{ secrets.FEISHU_COPY_BLOCKS_TABLE_ID }}
          FEISHU_INBOX_TABLE_ID: ${{ secrets.FEISHU_INBOX_TABLE_ID }}
          AI_BASE_URL: ${{ secrets.AI_BASE_URL }}
          AI_API_KEY: ${{ secrets.AI_API_KEY }}
          AI_MODEL: ${{ secrets.AI_MODEL }}
      - run: npm test
      - run: npm run build
      - name: Commit validated content
        working-directory: .
        run: |
          git config user.name "content-sync-bot"
          git config user.email "content-sync-bot@users.noreply.github.com"
          git add apps/web/src/generated/content.json apps/web/public/images/content
          git diff --cached --quiet || git commit -m "content: sync public Feishu records"
          git push
```

- [ ] **Step 3: Document the three Base tables and review workflow**

`docs/content-operations.md` must list exact Chinese field names, allowed option values, required fields, the inbox-to-draft flow, how to publish, how to unlist, and how to manually trigger synchronization.

- [ ] **Step 4: Document deployment and recovery**

`docs/deployment.md` must list every secret, Node 22 requirement, static output directory `apps/web/dist`, Cloudflare Pages build command `cd apps/web && npm ci && npm run build`, and recovery rule: redeploy the last successful commit when a content sync or deployment fails.

- [ ] **Step 5: Validate workflow syntax and commit**

Run: `cd apps/web; npm run check; npm test; npm run build`

Expected: PASS. Review both YAML files for valid indentation and exact secret names matching `SyncConfigSchema`.

```bash
git add .github/workflows docs/content-operations.md docs/deployment.md
git commit -m "ci: automate validation and content sync"
```

### Task 14: Complete Responsive, Accessibility, and Security Verification

**Files:**
- Modify: `apps/web/tests/e2e/home.spec.ts`
- Modify: `apps/web/tests/e2e/discover.spec.ts`
- Modify: `apps/web/tests/e2e/detail.spec.ts`
- Create: `apps/web/tests/e2e/security.spec.ts`
- Modify: `apps/web/src/styles/global.css`

**Interfaces:**
- Verifies: public build, desktop/mobile framing, text fit, keyboard controls, generated-data secrecy, and stable component dimensions.

- [ ] **Step 1: Add security-output tests**

```ts
test("public output does not expose credential or private field names", async ({ request }) => {
  const response = await request.get("/");
  const html = await response.text();
  for (const forbidden of ["FEISHU_APP_SECRET", "AI_API_KEY", "Raw Content", "禁止发布"]) {
    expect(html).not.toContain(forbidden);
  }
});
```

- [ ] **Step 2: Add keyboard and text-fit tests**

Tab through header controls, search, category filters, sort controls, copy buttons, and external links. For one deliberately long mixed Chinese/English fixture title, assert the card bounding box does not intersect the following card and `document.documentElement.scrollWidth === document.documentElement.clientWidth`.

- [ ] **Step 3: Add screenshot checkpoints**

Capture full-page screenshots for `/`, `/discover`, and one detail page in desktop and mobile projects. Inspect that the hero is nonblank, the next section is visible, images load, text does not overlap, controls remain stable, and no card contains another card.

- [ ] **Step 4: Fix only verified layout defects**

Make narrowly scoped CSS changes for defects found by the screenshots. Do not redesign approved visual direction or add new features.

- [ ] **Step 5: Run the complete release gate**

Run: `cd apps/web; npm test; npm run check; npm run build; npm run test:e2e`

Expected: all unit, component, desktop, mobile, accessibility, and security-output tests pass.

- [ ] **Step 6: Inspect the final diff and commit**

Run: `git status --short; git diff --stat; git log --oneline -15`

Expected: only planned files are modified; no credentials, `.env`, test reports, or generated temporary files are tracked.

```bash
git add apps/web/tests apps/web/src/styles/global.css
git commit -m "test: verify responsive public release"
```

## Final Release Checklist

- [ ] `npm test` passes in `apps/web`.
- [ ] `npm run check` passes in `apps/web`.
- [ ] `npm run build` produces `apps/web/dist`.
- [ ] `npm run test:e2e` passes for desktop and mobile.
- [ ] Generated public JSON passes `PublicDatasetSchema`.
- [ ] Draft, forbidden, raw inbox, and secret fields are absent from the build.
- [ ] A manual GitHub Actions sync can produce and commit a validated dataset.
- [ ] A failed sync cannot overwrite the last valid dataset or trigger deployment.
- [ ] The site opens locally and the user receives the running development URL.
