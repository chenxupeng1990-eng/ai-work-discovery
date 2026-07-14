# QIFEI Carousel, Category Pages, and Covers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Brand the site as QIFEI AI Work Discovery, add an accessible featured-content Hero carousel, replace all public covers with one coherent generated-image system, and move complete category browsing to static second-level pages while limiting the homepage grid to 10 items.

**Architecture:** Keep Astro responsible for static routing and server-rendered fallback content, and use one React island only for carousel interaction. Centralize category metadata and homepage selection in pure TypeScript helpers so homepage, Header, category pages, and tests share one contract. Generated covers remain controlled local assets at the current record-based paths.

**Tech Stack:** Astro static output, React 19 island, TypeScript strict mode, Zod public schema, Vitest + Testing Library, Playwright, built-in ImageGen.

## Global Constraints

- The public brand text is exactly `QIFEI AI Work Discovery`.
- The Hero contains at most 4 featured slides and advances every 6 seconds only when motion is allowed and the user is not interacting.
- The homepage latest-featured grid contains at most 10 items.
- Category routes are `/category/inspiration`, `/category/productivity`, `/category/team-practice`, and `/category/frontier-signals`.
- Covers are `16:10`, at least `1536x960`, local-only, and contain no generated title, Logo, UI text, or watermark.
- Do not change Feishu Base fields, Inbox review policy, or `/discover` search behavior.
- Preserve letter-spacing `0`, existing Chinese font stack, and current public-content security rules.

---

## File Structure

- Create `apps/web/src/lib/categories.ts`: category names, stable slugs, descriptions, and accent metadata.
- Create `apps/web/src/lib/home-content.ts`: deterministic selection of carousel and homepage items.
- Create `apps/web/src/components/HeroCarousel.tsx`: accessible carousel state and interaction.
- Create `apps/web/src/components/CategoryLinks.astro`: category links and item counts.
- Create `apps/web/src/components/FeaturedGrid.astro`: bounded homepage content grid and more link.
- Create `apps/web/src/pages/category/[slug].astro`: static category routes and empty states.
- Modify `apps/web/src/pages/index.astro`: compose only Hero, categories, and latest-featured grid.
- Modify `apps/web/src/components/Header.astro`, `Footer.astro`, and page titles: QIFEI branding.
- Add `apps/web/public/images/brand/qifei-logo-white.png`: supplied Logo asset.
- Replace 12 files under `apps/web/public/images/content/<record-id>/<record-id>.png`: generated covers.
- Create `apps/web/tests/unit/categories.test.ts`, `home-content.test.ts`, and `hero-carousel.test.tsx`.
- Modify `apps/web/tests/e2e/home.spec.ts` and `security.spec.ts`: new routes, carousel, branding, and image checks.

---

### Task 1: Category Contract and Homepage Selection

**Files:**
- Create: `apps/web/src/lib/categories.ts`
- Create: `apps/web/src/lib/home-content.ts`
- Create: `apps/web/tests/unit/categories.test.ts`
- Create: `apps/web/tests/unit/home-content.test.ts`

**Interfaces:**
- Produces: `CATEGORY_DEFINITIONS`, `categoryForSlug(slug)`, `slugForTrack(track)`, `itemsForCategory(items, slug)`.
- Produces: `selectHeroItems(items, limit = 4)` and `selectHomepageItems(items, limit = 10)`.
- Consumes: `ContentItem` and `RECOMMENDATION_TRACKS` from `src/lib/schema.ts`.

- [ ] **Step 1: Write failing category tests**

```ts
import { describe, expect, it } from "vitest";
import { CATEGORY_DEFINITIONS, categoryForSlug, slugForTrack } from "../../src/lib/categories";

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
});
```

- [ ] **Step 2: Run the category test and verify the missing-module failure**

Run: `npm test -- --run tests/unit/categories.test.ts`

Expected: FAIL because `src/lib/categories.ts` does not exist.

- [ ] **Step 3: Implement the category contract**

```ts
import type { ContentItem } from "./schema";

type RecommendationTrack = ContentItem["recommendationTrack"];

export const CATEGORY_DEFINITIONS = [
  { slug: "inspiration", track: "灵感实验", description: "打开新思路，快速验证值得继续探索的 AI 用法。", accent: "cyan" },
  { slug: "productivity", track: "工作提效", description: "进入真实工作流，减少重复劳动并提高交付质量。", accent: "blue" },
  { slug: "team-practice", track: "团队实践", description: "把个人技巧变成团队可复用、可协作的工作方法。", accent: "teal" },
  { slug: "frontier-signals", track: "前沿信号", description: "观察正在形成的新工具、新能力和行业变化。", accent: "violet" },
] as const satisfies readonly {
  slug: string;
  track: RecommendationTrack;
  description: string;
  accent: "cyan" | "blue" | "teal" | "violet";
}[];

export type CategorySlug = typeof CATEGORY_DEFINITIONS[number]["slug"];

export const categoryForSlug = (slug: string) => CATEGORY_DEFINITIONS.find((item) => item.slug === slug);
export const slugForTrack = (track: RecommendationTrack) => CATEGORY_DEFINITIONS.find((item) => item.track === track)!.slug;
export const itemsForCategory = (items: readonly ContentItem[], slug: CategorySlug) => {
  const category = categoryForSlug(slug)!;
  return items.filter((item) => item.recommendationTrack === category.track);
};
```

- [ ] **Step 4: Write failing selection tests**

Use a local `item(id, overrides)` fixture and assert:

```ts
expect(selectHeroItems(input).map(({ id }) => id)).toEqual(["featured-new", "featured-old", "recent", "older"]);
expect(selectHomepageItems(input, 2)).toHaveLength(2);
expect(selectHeroItems(input, 0)).toEqual([]);
expect(input.map(({ id }) => id)).toEqual(originalOrder);
```

The fixture must include featured and non-featured items with different `updatedAt`, `sortWeight`, and `slug` values so every tie-break is exercised.

- [ ] **Step 5: Run the selection test and verify the missing-module failure**

Run: `npm test -- --run tests/unit/home-content.test.ts`

Expected: FAIL because `src/lib/home-content.ts` does not exist.

- [ ] **Step 6: Implement deterministic selection**

```ts
import type { ContentItem } from "./schema";

const compareHomePriority = (left: ContentItem, right: ContentItem) => (
  Number(right.featured) - Number(left.featured)
  || Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
  || right.sortWeight - left.sortWeight
  || left.slug.localeCompare(right.slug)
  || left.id.localeCompare(right.id)
);

const select = (items: readonly ContentItem[], limit: number) => (
  limit <= 0 ? [] : [...items].sort(compareHomePriority).slice(0, limit)
);

export const selectHeroItems = (items: readonly ContentItem[], limit = 4) => select(items, limit);
export const selectHomepageItems = (items: readonly ContentItem[], limit = 10) => select(items, limit);
```

- [ ] **Step 7: Run focused tests and commit**

Run: `npm test -- --run tests/unit/categories.test.ts tests/unit/home-content.test.ts`

Expected: PASS.

```bash
git add apps/web/src/lib/categories.ts apps/web/src/lib/home-content.ts apps/web/tests/unit/categories.test.ts apps/web/tests/unit/home-content.test.ts
git commit -m "feat: define QIFEI content categories"
```

---

### Task 2: QIFEI Brand Asset and Shared Chrome

**Files:**
- Create: `apps/web/public/images/brand/qifei-logo-white.png`
- Modify: `apps/web/src/components/Header.astro`
- Modify: `apps/web/src/components/Footer.astro`
- Modify: `apps/web/src/pages/index.astro`
- Modify: `apps/web/src/pages/discover.astro`
- Modify: `apps/web/src/pages/updates.astro`
- Modify: `apps/web/src/pages/content/[slug].astro`

**Interfaces:**
- Produces: one local Logo URL `/images/brand/qifei-logo-white.png` and consistent public brand text.
- Consumes: the user-supplied transparent PNG at `C:/Users/Qifei/Desktop/1757486786531-0.8910077609965528-祈飞logo@2x(1).png`.

- [ ] **Step 1: Copy the approved Logo without transforming the source**

Run from the repository root:

```powershell
New-Item -ItemType Directory -Force apps/web/public/images/brand | Out-Null
Copy-Item -LiteralPath 'C:/Users/Qifei/Desktop/1757486786531-0.8910077609965528-祈飞logo@2x(1).png' -Destination 'apps/web/public/images/brand/qifei-logo-white.png'
```

Verify with `view_image` that transparency, mark, and Chinese wordmark are preserved.

- [ ] **Step 2: Replace the Header brand element**

Use a dark circular/square mark surface only where needed for contrast; keep the brand text separate and readable:

```astro
<a class="brand" href="/" aria-label="QIFEI AI Work Discovery 首页">
  <span class="brand-mark"><img src="/images/brand/qifei-logo-white.png" alt="" width="100" height="52" /></span>
  <span class="brand-full">QIFEI AI Work Discovery</span>
</a>
```

Set the image to `object-fit: contain`, keep Header height stable, and collapse the wordmark text only at the existing mobile breakpoint if required to avoid overlap.

- [ ] **Step 3: Update page titles and Footer copy**

Use these exact forms:

```astro
title="QIFEI AI 工作灵感与实践 | QIFEI AI Work Discovery"
title="发现 | QIFEI AI Work Discovery"
title="最近更新 | QIFEI AI Work Discovery"
title={`${item.title} | QIFEI AI Work Discovery`}
```

Footer visible brand text becomes `QIFEI AI Work Discovery`.

- [ ] **Step 4: Verify and commit**

Run: `npm run check && npm run build`

Expected: zero Astro diagnostics and successful static build.

```bash
git add apps/web/public/images/brand apps/web/src/components/Header.astro apps/web/src/components/Footer.astro apps/web/src/pages
git commit -m "feat: apply QIFEI discovery branding"
```

---

### Task 3: Accessible Featured Hero Carousel

**Files:**
- Create: `apps/web/src/components/HeroCarousel.tsx`
- Create: `apps/web/tests/unit/hero-carousel.test.tsx`
- Modify: `apps/web/src/pages/index.astro`

**Interfaces:**
- Consumes: `items: ContentItem[]` from `selectHeroItems(publicDataset.items)`.
- Produces: a React component whose first slide is fully rendered before hydration and whose active CTA is `/content/<slug>`.

- [ ] **Step 1: Write failing carousel interaction tests**

```tsx
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HeroCarousel } from "../../src/components/HeroCarousel";

describe("HeroCarousel", () => {
  afterEach(() => vi.useRealTimers());

  it("renders the active content and supports manual navigation", () => {
    render(<HeroCarousel items={[first, second]} />);
    expect(screen.getByRole("heading", { name: first.title })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "下一项精选" }));
    expect(screen.getByRole("heading", { name: second.title })).toBeVisible();
    expect(screen.getByRole("link", { name: "查看内容" })).toHaveAttribute("href", `/content/${second.slug}`);
  });

  it("advances after six seconds and pauses while hovered", () => {
    vi.useFakeTimers();
    render(<HeroCarousel items={[first, second]} />);
    act(() => vi.advanceTimersByTime(6000));
    expect(screen.getByRole("heading", { name: second.title })).toBeVisible();
    fireEvent.mouseEnter(screen.getByRole("region", { name: "精选内容" }));
    act(() => vi.advanceTimersByTime(6000));
    expect(screen.getByRole("heading", { name: second.title })).toBeVisible();
  });
});
```

Add tests for previous navigation, dot navigation, ArrowLeft/ArrowRight, focus pause, visibility pause, one-item input, empty input, and `prefers-reduced-motion`.

- [ ] **Step 2: Run the test and verify the missing-component failure**

Run: `npm test -- --run tests/unit/hero-carousel.test.tsx`

Expected: FAIL because `HeroCarousel.tsx` does not exist.

- [ ] **Step 3: Implement the minimal carousel state machine**

Implement these state and timing rules exactly:

```tsx
const [activeIndex, setActiveIndex] = useState(0);
const [paused, setPaused] = useState(false);
const motionAllowed = useReducedMotionPreference();

useEffect(() => {
  if (!motionAllowed || paused || items.length < 2) return;
  const timer = window.setInterval(() => {
    setActiveIndex((current) => (current + 1) % items.length);
  }, 6000);
  return () => window.clearInterval(timer);
}, [items.length, motionAllowed, paused]);
```

Render every slide for stable layout but apply `aria-hidden`, `inert`, opacity, and pointer-event state to inactive slides. The region must use `aria-roledescription="carousel"`, `aria-label="精选内容"`, and an offscreen `aria-live="polite"` status such as `第 2 项，共 4 项`.

The Hero visual is full-width and unframed. Use the cover as a full-bleed background with a dark directional overlay for legibility; do not place the primary Hero in a card. Include the white QIFEI Logo, exact brand text, metadata, title, recommendation reason, CTA, arrows, and dots. Keep a hint of the category section visible at 1440x1000 and 390x844.

- [ ] **Step 4: Mount the island with a server-rendered fallback**

```astro
---
import { HeroCarousel } from "../components/HeroCarousel";
import { selectHeroItems } from "../lib/home-content";
const heroItems = selectHeroItems(publicDataset.items);
---

{heroItems.length > 0
  ? <HeroCarousel items={heroItems} client:load />
  : <section class="home-empty"><h1>QIFEI AI Work Discovery</h1><p>暂无已发布内容</p></section>}
```

- [ ] **Step 5: Run focused tests, check, and commit**

Run: `npm test -- --run tests/unit/hero-carousel.test.tsx && npm run check`

Expected: PASS and zero diagnostics.

```bash
git add apps/web/src/components/HeroCarousel.tsx apps/web/tests/unit/hero-carousel.test.tsx apps/web/src/pages/index.astro
git commit -m "feat: add featured content carousel"
```

---

### Task 4: Bounded Homepage and Category Second-Level Pages

**Files:**
- Create: `apps/web/src/components/CategoryLinks.astro`
- Create: `apps/web/src/components/FeaturedGrid.astro`
- Create: `apps/web/src/pages/category/[slug].astro`
- Modify: `apps/web/src/pages/index.astro`
- Modify: `apps/web/src/components/Header.astro`
- Modify: `apps/web/tests/e2e/home.spec.ts`
- Modify: `apps/web/tests/e2e/security.spec.ts`

**Interfaces:**
- Consumes: `CATEGORY_DEFINITIONS`, `itemsForCategory`, `selectHomepageItems`, `ContentCard`, and `publicDataset.items`.
- Produces: four static category routes and a homepage with no more than 10 grid cards.

- [ ] **Step 1: Write failing route and homepage E2E assertions**

Add data-driven tests:

```ts
const categoryRoutes = [
  "/category/inspiration",
  "/category/productivity",
  "/category/team-practice",
  "/category/frontier-signals",
];

await expect(page.getByText("QIFEI AI Work Discovery", { exact: true }).first()).toBeVisible();
await expect(page.locator('[data-home-section="featured"] [data-content-card]')).toHaveCount(
  Math.min(10, generatedDataset.items.length),
);
for (const route of categoryRoutes) expect((await request.get(route)).status()).toBe(200);
```

For every category route, compute expected items from `generatedDataset` and assert every rendered card has that track. Assert the frontier-signals page renders a stable empty state when its count is zero.

- [ ] **Step 2: Run E2E and verify failures**

Run: `npx playwright test tests/e2e/home.spec.ts tests/e2e/security.spec.ts`

Expected: FAIL because category routes and new homepage selectors do not exist.

- [ ] **Step 3: Implement `CategoryLinks.astro`**

Render the four definitions, each with `href=/category/<slug>`, visible Chinese name, description, and count derived from the supplied items. Use a full-width section with a four-column desktop grid and one-column mobile list; do not nest cards.

- [ ] **Step 4: Implement `FeaturedGrid.astro`**

```astro
---
import ContentCard from "./ContentCard.astro";
import type { ContentItem } from "../lib/schema";
const { items, hasMore } = Astro.props as { items: ContentItem[]; hasMore: boolean };
---

<section data-home-section="featured" aria-labelledby="featured-title">
  <div class="container">
    <header><p>最新精选</p><h2 id="featured-title">现在值得尝试</h2><span>{items.length} 项内容</span></header>
    <div class="featured-grid">{items.map((item) => <ContentCard item={item} />)}</div>
    {hasMore && <a class="button-secondary" href="/discover">查看更多</a>}
  </div>
</section>
```

The responsive grid is 3 columns on desktop, 2 on tablet, and 1 on mobile. Ensure the tenth card does not create an unbalanced fixed-height row.

- [ ] **Step 5: Implement the category route**

```astro
---
import BaseLayout from "../../layouts/BaseLayout.astro";
import ContentCard from "../../components/ContentCard.astro";
import { CATEGORY_DEFINITIONS, itemsForCategory } from "../../lib/categories";
import { publicDataset } from "../../lib/public-dataset";

export function getStaticPaths() {
  return CATEGORY_DEFINITIONS.map((category) => ({ params: { slug: category.slug }, props: { category } }));
}

const { category } = Astro.props;
const items = itemsForCategory(publicDataset.items, category.slug);
---
```

Render the category Hero, count, full content grid, empty state for zero items, and links to `/discover` and `/`.

- [ ] **Step 6: Simplify `index.astro`**

Remove imports and markup for `AISignals`, `ReadyToUse`, `FeaturedSpotlight`, and the old recent section. Compose only:

```astro
<HeroCarousel items={heroItems} client:load />
<CategoryLinks items={items} />
<FeaturedGrid items={homepageItems} hasMore={items.length > homepageItems.length} />
```

Change Header discovery-direction links to stable category routes while keeping `/discover` and `/updates` navigation.

- [ ] **Step 7: Run focused E2E and commit**

Run: `npm run build && npx playwright test tests/e2e/home.spec.ts tests/e2e/security.spec.ts`

Expected: all route, content-bound, branding, and responsive assertions pass.

```bash
git add apps/web/src/components/CategoryLinks.astro apps/web/src/components/FeaturedGrid.astro apps/web/src/pages/category apps/web/src/pages/index.astro apps/web/src/components/Header.astro apps/web/tests/e2e/home.spec.ts apps/web/tests/e2e/security.spec.ts
git commit -m "feat: add category discovery pages"
```

---

### Task 5: Generate and Replace All 12 Public Covers

**Files:**
- Replace: `apps/web/public/images/content/recvpkOJPUSQj9/recvpkOJPUSQj9.png`
- Replace: `apps/web/public/images/content/recvpkPmXg47kl/recvpkPmXg47kl.png`
- Replace: `apps/web/public/images/content/recvpkQUuE2XwZ/recvpkQUuE2XwZ.png`
- Replace: `apps/web/public/images/content/recvpkQwnq2SSL/recvpkQwnq2SSL.png`
- Replace: `apps/web/public/images/content/recvpkXZI0nwGd/recvpkXZI0nwGd.png`
- Replace: `apps/web/public/images/content/recvpl0DKg7J5i/recvpl0DKg7J5i.png`
- Replace: `apps/web/public/images/content/recvpl0Doh2epV/recvpl0Doh2epV.png`
- Replace: `apps/web/public/images/content/recvpl0E5evRKY/recvpl0E5evRKY.png`
- Replace: `apps/web/public/images/content/recvpl0EQNsUbm/recvpl0EQNsUbm.png`
- Replace: `apps/web/public/images/content/recvpl0EvpWN0x/recvpl0EvpWN0x.png`
- Replace: `apps/web/public/images/content/recvpl0FB56298/recvpl0FB56298.png`
- Replace: `apps/web/public/images/content/recvpl0FflYBSW/recvpl0FflYBSW.png`

**Interfaces:**
- Consumes: the record title, recommendation track, and content type from `src/generated/content.json`.
- Produces: 12 local `16:10` covers with shared material, lighting, lens, and safe-area rules.

- [ ] **Step 1: Lock the shared ImageGen prompt prefix**

Use this exact prefix for every separate built-in ImageGen call:

```text
Use case: stylized-concept
Asset type: 16:10 editorial cover for QIFEI AI Work Discovery
Primary request: Create a premium Apple-like editorial 3D still with one sculptural glass-and-metal object that communicates the specified AI work concept.
Scene/backdrop: deep neutral spatial stage, subtle floor reflection, large clean negative space, no decorative blobs
Style/medium: photoreal 3D product visualization, precision-machined metal, frosted and optical glass, restrained premium technology editorial
Composition/framing: 16:10 landscape, subject inside the central 70% safe area, readable at card-thumbnail size, safe for mild mobile cropping
Lighting/mood: soft studio key light, controlled rim light, realistic caustics, high material fidelity
Constraints: no words, no letters, no numbers, no logo, no UI screenshot, no watermark, no people, no cyberpunk grid
```

- [ ] **Step 2: Generate one separate image per record with these exact suffixes**

| Record | Prompt suffix |
| --- | --- |
| `recvpkOJPUSQj9` | Work-efficiency blue system; a luminous entry portal connects a compact terminal block to a translucent document lattice; Getting Started stair-step geometry. |
| `recvpkPmXg47kl` | Work-efficiency graphite and ice-blue system; a precision conveyor transforms a small idea sphere through script, audio, and video modules into one polished frame; Tool instrument geometry. |
| `recvpkQUuE2XwZ` | Work-efficiency graphite and ice-blue system; a transparent design-rule prism snaps scattered visual fragments into one aligned composition; Skill modular geometry. |
| `recvpkQwnq2SSL` | Work-efficiency graphite and ice-blue system; a clear target core is held by concentric scope rings and a visible stop gate; Skill modular geometry. |
| `recvpkXZI0nwGd` | Team-practice teal and warm-white system; a security scanner aperture examines a plug-in module before it joins a shared network; Tool instrument geometry. |
| `recvpl0DKg7J5i` | Team-practice teal and warm-white system; three meeting-wave ribbons converge into two precise decision and task nodes; Case path geometry. |
| `recvpl0Doh2epV` | Team-practice teal and warm-white system; a tangled library lattice reorganizes into four clear navigable branches around a shared hub; Case path geometry. |
| `recvpl0E5evRKY` | Work-efficiency graphite and ice-blue system; a modular timeline rail repeats title, scene, and motion blocks into finished video frames; Case path geometry. |
| `recvpl0EQNsUbm` | Work-efficiency graphite and ice-blue system; a compact image-generation module projects a clean visual plane from one command token; Skill modular geometry. |
| `recvpl0EvpWN0x` | Work-efficiency graphite and ice-blue system; aligned caption bars flow into storyboard panes along a single controlled path; Skill modular geometry. |
| `recvpl0FB56298` | Inspiration electric-cyan system; an open research orbit passes through script, asset, and edit stations before forming one cinematic frame; Tool exploratory geometry. |
| `recvpl0FflYBSW` | Team-practice teal and warm-white system; five connected work nodes form one continuous shared loop with a verified result core; Collaboration network geometry. |

Use one built-in ImageGen call per record. Do not use one contact sheet and crop it.

- [ ] **Step 3: Normalize each selected image to the controlled 16:10 output**

Copy the selected result from the local path returned by each built-in ImageGen call to the matching record path listed in this task. Overwriting is explicitly required by the approved design. Because built-in ImageGen landscape output may be `1536x1024`, normalize each selected output with the installed `sharp` dependency after visually confirming the central safe area. The first record uses this command from `apps/web`; repeat it immediately after each generation with the returned source path and the corresponding exact destination from the file list:

```powershell
$source = (Get-ChildItem "$env:USERPROFILE/.codex/generated_images" -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
node -e "const sharp=require('sharp');sharp(process.argv[1]).resize(1536,960,{fit:'cover',position:'centre'}).png().toFile(process.argv[2])" $source "public/images/content/recvpkOJPUSQj9/recvpkOJPUSQj9.png"
```

Run the command separately for all 12 verified source/destination pairs. Do not crop an image whose subject leaves the central 70% safe area; regenerate that source instead.

- [ ] **Step 4: Validate every image**

Use `view_image` on all 12 final files, then run:

```powershell
node -e "const sharp=require('sharp');const fs=require('fs');const path=require('path');(async()=>{const root='public/images/content';for(const id of fs.readdirSync(root)){const file=path.join(root,id,id+'.png');const m=await sharp(file).metadata();if(!m.width||!m.height||m.width<1536||m.height<960||Math.abs(m.width/m.height-1.6)>0.03)throw new Error(file+' invalid '+m.width+'x'+m.height);console.log(file,m.width+'x'+m.height)}})()"
```

Expected: all 12 files print dimensions at least `1536x960` and no command failure. Reject and regenerate any image containing text artifacts, logos, watermarks, cropped subjects, or style drift.

- [ ] **Step 5: Build and commit generated assets**

Run: `npm run build`

Expected: all 12 detail routes and image references build successfully.

```bash
git add apps/web/public/images/content
git commit -m "assets: unify generated content covers"
```

---

### Task 6: Full Responsive, Accessibility, and Release Verification

**Files:**
- Modify: `apps/web/tests/e2e/home.spec.ts`
- Modify: `apps/web/tests/e2e/release-assertions.ts` only if a new carousel-specific reusable assertion removes real duplication.
- Update: `.superpowers/sdd/task-14-screenshots/*.png` only if these screenshots are already tracked; otherwise keep them untracked verification output.

**Interfaces:**
- Consumes: completed public site and generated dataset.
- Produces: passing desktop/mobile E2E evidence and clean Git state.

- [ ] **Step 1: Add final carousel and image E2E assertions**

Assert:

```ts
await expect(page.getByRole("region", { name: "精选内容" })).toBeVisible();
await expect(page.getByRole("button", { name: "下一项精选" })).toBeVisible();
await expect(page.locator('[data-home-section="featured"] [data-content-card]')).toHaveCount(
  Math.min(10, generatedDataset.items.length),
);
```

For every visible content image, assert `src` starts with `/images/content/`, `naturalWidth >= 1536`, `naturalHeight >= 960`, and ratio is between `1.57` and `1.63`. Assert no Hero title, CTA, dots, arrows, or Logo overlap at 1440x1000, 1024x1000, and 390x844.

- [ ] **Step 2: Run the complete verification suite**

Run in this order:

```powershell
npm test -- --run
npm run check
npm run build
npm run verify:public
npm run test:e2e
```

Expected: all unit tests pass; Astro reports 0 errors, warnings, and hints; build succeeds; public verification finds no forbidden markers; desktop/mobile E2E passes with only deliberate project-condition skips.

- [ ] **Step 3: Capture and inspect final screenshots**

Run the existing release screenshot tests and inspect desktop/mobile homepage, one populated category, empty frontier category, discover, and one detail page. Check:

- QIFEI branding is visible immediately.
- The next homepage section is visible in the first viewport.
- All covers share materials and lighting while category accents remain distinguishable.
- No generated text artifacts are visible.
- No horizontal overflow, clipped Chinese copy, nested cards, or overlapping carousel controls.

- [ ] **Step 4: Review the final diff and commit any verification-only test changes**

Run:

```powershell
git diff --check
git status --short
git diff --stat
```

If Task 6 changed tests, commit them:

```bash
git add apps/web/tests/e2e
git commit -m "test: verify QIFEI discovery experience"
```

- [ ] **Step 5: Push the reviewed branch**

```bash
git push origin feature/ai-work-discovery
```

Expected: local HEAD and `origin/feature/ai-work-discovery` resolve to the same commit.
