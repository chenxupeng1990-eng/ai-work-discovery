import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Locator } from "@playwright/test";
import { CATEGORY_DEFINITIONS } from "../../src/lib/categories";
import { selectHeroItems } from "../../src/lib/home-content";
import { generatedDataset } from "../fixtures/generated-dataset";
import {
  expectCardsAreSeparate,
  expectCardTextFits,
  expectControlsInBounds,
  expectFocusVisible,
  expectImagesLoaded,
  expectNoHorizontalOverflow,
  tabUntil,
} from "./release-assertions";

const screenshotDirectory = resolve("../../.superpowers/sdd/task-14-screenshots");
const detailRoute = `/content/${generatedDataset.items[0]!.slug}`;
const heroItems = selectHeroItems(generatedDataset.items);
const homepageItems = [...generatedDataset.items]
  .sort((left, right) => (
    Number(right.featured) - Number(left.featured)
    || Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
    || right.sortWeight - left.sortWeight
    || left.slug.localeCompare(right.slug)
    || left.id.localeCompare(right.id)
  ))
  .slice(0, 10);
const homepageSource = readFileSync(new URL("../../src/pages/index.astro", import.meta.url), "utf8");
const categoryRoutes = [
  "/category/inspiration",
  "/category/productivity",
  "/category/team-practice",
  "/category/frontier-signals",
] as const;

async function expectElementsNotToOverlap(elements: ReadonlyArray<readonly [string, Locator]>) {
  const boxes = await Promise.all(elements.map(async ([name, element]) => {
    const box = await element.boundingBox();
    expect(box, `${name} should have a visible bounding box`).not.toBeNull();
    return [name, box!] as const;
  }));

  for (const [index, [firstName, firstBox]] of boxes.entries()) {
    for (const [secondName, secondBox] of boxes.slice(index + 1)) {
      const overlaps = firstBox.x < secondBox.x + secondBox.width
        && secondBox.x < firstBox.x + firstBox.width
        && firstBox.y < secondBox.y + secondBox.height
        && secondBox.y < firstBox.y + firstBox.height;
      expect(overlaps, `${firstName} overlaps ${secondName}`).toBe(false);
    }
  }
}

async function expectHeroCoverMeetsReleaseRequirements(image: Locator) {
  await image.scrollIntoViewIfNeeded();
  await expect(image).toHaveAttribute("src", /^\/images\/content\//);
  await expect.poll(() => image.evaluate((element) => (
    (element as HTMLImageElement).complete
    && (element as HTMLImageElement).naturalWidth > 0
  ))).toBe(true);

  const { naturalHeight, naturalWidth } = await image.evaluate((element) => ({
    naturalHeight: (element as HTMLImageElement).naturalHeight,
    naturalWidth: (element as HTMLImageElement).naturalWidth,
  }));
  expect(naturalWidth).toBeGreaterThanOrEqual(1536);
  expect(naturalHeight).toBeGreaterThanOrEqual(960);
  expect(naturalWidth / naturalHeight).toBeGreaterThanOrEqual(1.57);
  expect(naturalWidth / naturalHeight).toBeLessThanOrEqual(1.63);
}

test("public routes share the QIFEI brand asset and copy", async ({ page }) => {
  const routes = [
    { route: "/", title: "QIFEI AI 工作灵感与实践 | QIFEI AI Work Discovery", description: undefined },
    { route: "/discover", title: "发现 | QIFEI AI Work Discovery", description: undefined },
    { route: "/updates", title: "最近更新 | QIFEI AI Work Discovery", description: undefined },
    {
      route: detailRoute,
      title: `${generatedDataset.items[0]!.title} | QIFEI AI Work Discovery`,
      description: undefined,
    },
    ...CATEGORY_DEFINITIONS.map((category, index) => ({
      route: categoryRoutes[index]!,
      title: `${category.track} | QIFEI AI Work Discovery`,
      description: category.description,
    })),
  ];

  for (const { route, title, description } of routes) {
    await page.goto(route);
    await expect(page).toHaveTitle(title);
    if (description) {
      await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", description);
    }
    await expect(page.locator(".brand")).toHaveAccessibleName("QIFEI AI Work Discovery 首页");
    await expect(page.locator(".brand img")).toHaveAttribute("src", "/images/brand/qifei-logo-white.png");
    await expect(page.locator(".brand-full")).toHaveText("QIFEI AI Work Discovery");
    await expect(page.getByRole("contentinfo")).toContainText("QIFEI AI Work Discovery");
  }
});

test("homepage source keeps a visible fallback when no hero items are available", () => {
  expect(homepageSource).toMatch(
    /\{heroItems\.length > 0\s*\?\s*<HeroCarousel items=\{heroItems\} client:load \/>\s*:\s*\(\s*<section class="home-empty" data-home-empty="true">/,
  );
  expect(homepageSource).toContain("<h1>QIFEI AI Work Discovery</h1>");
  expect(homepageSource).toContain("<p>暂无已发布内容</p>");
});

test("homepage exposes shared navigation and one main landmark", async ({ page }) => {
  await page.goto("/");

  const expectedNavigation = [
    ["发现", "/discover"],
    ["灵感实验", "/category/inspiration"],
    ["工作提效", "/category/productivity"],
    ["团队实践", "/category/team-practice"],
    ["前沿信号", "/category/frontier-signals"],
    ["最近更新", "/updates"],
  ] as const;
  const navigation = page.locator('nav[aria-label="主导航"]');

  await expect(page.getByRole("banner")).toBeVisible();
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(navigation.locator("a")).toHaveCount(expectedNavigation.length);
  for (const [label, href] of expectedNavigation) {
    await expect(navigation.locator("a", { hasText: label })).toHaveAttribute("href", href);
  }
  await expect(page.getByRole("link", { name: "搜索" })).toHaveAttribute("href", "/discover");
  await expect(page.locator('a[href="/updates"]')).toHaveCount(2);
  await expect(page.getByRole("button", { name: "提交内容" })).toHaveAttribute("aria-disabled", "true");
  await expect(page.locator('a[href="#discover"], a[href="#ready"], a[href="#submit"]')).toHaveCount(0);
  await expect(page.getByRole("contentinfo")).toBeVisible();
});

test("homepage category links use stable routes and show dataset counts", async ({ page }) => {
  await page.goto("/");

  const links = page.getByRole("navigation", { name: "发现方向" }).getByRole("link");
  await expect(links).toHaveCount(4);
  for (const category of CATEGORY_DEFINITIONS) {
    const expectedCount = generatedDataset.items.filter(
      (item) => item.recommendationTrack === category.track,
    ).length;
    const link = links.filter({ hasText: category.track });
    await expect(link).toHaveAttribute("href", `/category/${category.slug}`);
    await expect(link).toContainText(`${expectedCount} 项`);
  }
});

test("homepage contains only the hero, category links, and at most ten featured cards", async ({ page }) => {
  await page.goto("/");

  const hero = page.getByRole("region", { name: "精选内容" });
  await expect(hero.getByRole("heading", { level: 1, name: heroItems[0]!.title })).toBeVisible();
  await expect(hero.locator(".hero-carousel__slide.is-active .hero-carousel__brand")).toHaveText(
    "QIFEI AI Work Discovery",
  );
  await expect(hero.getByText("QIFEI AI Work Discovery", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "现在值得尝试" })).toBeVisible();
  await expect(page.getByText("学习进度")).toHaveCount(0);

  await expect(page.locator('[data-home-section="featured"] [data-content-card]')).toHaveCount(
    homepageItems.length,
  );
  await expect(page.locator('[data-home-section="worth-trying"]')).toHaveCount(0);
  await expect(page.locator('[data-home-section="ai-signals"]')).toHaveCount(0);
  await expect(page.locator('[data-home-section="ready-to-use"]')).toHaveCount(0);
  await expect(page.locator('[data-home-section="recent"]')).toHaveCount(0);

  const cardImages = page.locator('[data-home-section="featured"] [data-home-content-image]');
  await expect(cardImages).toHaveCount(homepageItems.length);
  for (const image of await cardImages.all()) {
    await expect(image).toHaveAttribute("src", /^\/images\/content\/[a-zA-Z0-9_-]+\/.+\.png$/);
    await expect(image).toHaveAttribute("width", /\d+/);
    await expect(image).toHaveAttribute("height", /\d+/);
    await image.scrollIntoViewIfNeeded();
    await expect(image).toHaveJSProperty("complete", true);
    const box = await image.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width / box!.height).toBeGreaterThanOrEqual(1.58);
    expect(box!.width / box!.height).toBeLessThanOrEqual(1.62);
  }

  const featuredHrefs = await page
    .locator('[data-home-section="featured"] [data-content-card] a[data-home-content-link]')
    .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  expect(featuredHrefs).toEqual(homepageItems.map((item) => `/content/${item.slug}`));

  const viewMore = page.locator('[data-home-section="featured"] a[href="/discover"]');
  if (generatedDataset.items.length > 10) {
    await expect(viewMore).toHaveCount(1);
    await expect(viewMore).toHaveText("查看更多");
  } else {
    await expect(viewMore).toHaveCount(0);
  }

  const contentLinks = page.locator('[data-home-content-link]');
  for (const link of await contentLinks.all()) {
    const href = await link.getAttribute("href");
    expect(href).toMatch(/^\/content\/[a-z0-9-]+$/);
    await expect(link).not.toHaveAttribute("target");
  }
});

test("all category routes render only their mapped items and a stable empty state", async ({ page, request }) => {
  expect(categoryRoutes).toEqual(CATEGORY_DEFINITIONS.map((category) => `/category/${category.slug}`));

  for (const [index, category] of CATEGORY_DEFINITIONS.entries()) {
    const route = categoryRoutes[index]!;
    const expectedItems = generatedDataset.items.filter(
      (item) => item.recommendationTrack === category.track,
    );
    expect((await request.get(route)).status(), route).toBe(200);

    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1, name: category.track })).toBeVisible();
    await expect(page.locator("[data-content-card]")).toHaveCount(expectedItems.length);
    const renderedHrefs = await page.locator("[data-content-card] a").evaluateAll((links) => (
      links.map((link) => link.getAttribute("href"))
    ));
    expect(renderedHrefs).toEqual(expectedItems.map((item) => `/content/${item.slug}`));
    for (const href of renderedHrefs) {
      const renderedItem = generatedDataset.items.find((item) => `/content/${item.slug}` === href);
      expect(renderedItem, href ?? "missing href").toBeDefined();
      expect(renderedItem!.recommendationTrack).toBe(category.track);
    }

    const emptyState = page.locator('[data-category-empty="true"]');
    if (expectedItems.length === 0) {
      await expect(emptyState).toContainText("该分类暂无内容");
    } else {
      await expect(emptyState).toHaveCount(0);
    }
  }
});

test("featured grid uses three, two, and one responsive columns without clipping Chinese text", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Responsive grid checkpoints run once in the desktop project.");

  for (const [width, columns] of [[1440, 3], [900, 2], [390, 1]] as const) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    const grid = page.locator(".featured-grid");
    expect((await grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length))).toBe(columns);
    await expectNoHorizontalOverflow(page);
    await expectCardTextFits(page);
  }
});

test("homepage carousel hydrates and supports manual navigation", async ({ page }) => {
  await page.goto("/");
  const hero = page.getByRole("region", { name: "精选内容" });

  await hero.getByRole("button", { name: "下一项精选" }).click();
  await expect(hero.getByRole("heading", { name: heroItems[1]!.title })).toBeVisible();

  await hero.getByRole("button", { name: `转到第 1 项：${heroItems[0]!.title}` }).click();
  await expect(hero.getByRole("heading", { name: heroItems[0]!.title })).toBeVisible();

  await hero.focus();
  await page.keyboard.press("ArrowRight");
  await expect(hero.getByRole("heading", { name: heroItems[1]!.title })).toBeVisible();
});

test("homepage carousel verifies every slide at each release viewport", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Release viewport checkpoints run once in the desktop project.");

  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 1024, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");

    const hero = page.getByRole("region", { name: "精选内容" });
    const next = hero.getByRole("button", { name: "下一项精选" });
    await expect(hero).toBeVisible();
    await expect(next).toBeVisible();
    await expect(page.locator('[data-home-section="featured"] [data-content-card]')).toHaveCount(
      Math.min(10, generatedDataset.items.length),
    );

    const dots = hero.getByRole("group", { name: "选择精选内容" }).getByRole("button");
    await expect(dots).toHaveCount(heroItems.length);
    await hero.hover();
    await dots.first().focus();
    await expect(dots.first()).toBeFocused();

    for (const [index, item] of heroItems.entries()) {
      const dot = dots.nth(index);
      await dot.click();
      await expect(dot).toHaveAttribute("aria-current", "true");

      const activeSlide = hero.locator(".hero-carousel__slide.is-active");
      await expect(activeSlide).toHaveCount(1);
      await expect(activeSlide).toHaveAttribute("aria-label", `${index + 1} / ${heroItems.length}`);

      const title = activeSlide.getByRole("heading", { level: 1, name: item.title, exact: true });
      const cta = activeSlide.locator(".hero-carousel__cta");
      const cover = activeSlide.locator(".hero-carousel__cover");
      await expect(title).toBeVisible();
      await expect(cta).toBeVisible();
      await expect(cta).toHaveAttribute("href", `/content/${item.slug}`);
      await expectHeroCoverMeetsReleaseRequirements(cover);

      const checkpoint = `${viewport.width}x${viewport.height} slide ${index + 1}`;
      await expectElementsNotToOverlap([
        [`${checkpoint} logo`, activeSlide.locator(".hero-carousel__brand")],
        [`${checkpoint} title`, title],
        [`${checkpoint} CTA`, cta],
        [`${checkpoint} dots`, hero.locator(".hero-carousel__dots")],
        [`${checkpoint} arrows`, hero.locator(".hero-carousel__arrows")],
      ]);
    }

    const contentImages = page.locator("img[data-home-content-image]");
    for (const image of await contentImages.all()) {
      await image.scrollIntoViewIfNeeded();
      await expect(image).toHaveAttribute("src", /^\/images\/content\//);
      await expect(image).toHaveJSProperty("complete", true);
      const { naturalHeight, naturalWidth } = await image.evaluate((element) => ({
        naturalHeight: (element as HTMLImageElement).naturalHeight,
        naturalWidth: (element as HTMLImageElement).naturalWidth,
      }));
      expect(naturalWidth).toBeGreaterThanOrEqual(1536);
      expect(naturalHeight).toBeGreaterThanOrEqual(960);
      expect(naturalWidth / naturalHeight).toBeGreaterThanOrEqual(1.57);
      expect(naturalWidth / naturalHeight).toBeLessThanOrEqual(1.63);
    }
  }
});

test("homepage keeps the next section visible and avoids horizontal overflow", async ({ page }) => {
  await page.goto("/");

  const nextSection = page.locator('[data-home-section="categories"]');
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(await nextSection.evaluate((element) => element.getBoundingClientRect().top)).toBeLessThan(viewport!.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport!.width);
});

test("mobile navigation opens without resizing the header or overflowing", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Mobile navigation behavior only applies to the mobile project.");

  await page.goto("/");

  const header = page.getByRole("banner");
  const menu = page.locator("[data-mobile-menu-button]");
  const navigation = page.getByRole("navigation", { name: "移动端主导航" });
  const initialHeight = await header.evaluate((element) => element.getBoundingClientRect().height);

  await expect(menu).toHaveAttribute("aria-controls", "mobile-navigation");
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toHaveAccessibleName("打开导航");
  await expect(navigation).toBeHidden();
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await expect(menu).toHaveAccessibleName("关闭导航");
  await expect(navigation).toBeVisible();
  await expect(navigation.getByRole("link")).toHaveCount(6);
  expect(await header.evaluate((element) => element.getBoundingClientRect().height)).toBe(initialHeight);

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport!.width);
});

test("320px header keeps its controls inside the viewport", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "320px header geometry only applies to the mobile project.");
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/");

  const viewport = page.viewportSize()!;
  const header = page.getByRole("banner");
  expect(await header.evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);

  for (const control of [
    page.locator(".brand img"),
    page.getByRole("link", { name: "搜索" }),
    page.locator("[data-mobile-menu-button]"),
  ]) {
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
  }
});

test("header controls support Tab, Enter, focus visibility, and mobile menu dismissal", async ({ page }, testInfo) => {
  await page.goto("/");

  const search = page.getByRole("link", { name: "搜索" });
  await tabUntil(search);
  await expectFocusVisible(search);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/discover\/?$/);

  await page.goto("/");
  const updates = testInfo.project.name === "desktop"
    ? page.getByRole("navigation", { name: "主导航" }).getByRole("link", { name: "最近更新" })
    : page.getByRole("link", { name: "发现", exact: true }).first();
  await tabUntil(updates);
  await expectFocusVisible(updates);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(testInfo.project.name === "desktop" ? /\/updates\/?$/ : /\/discover\/?$/);

  await page.goto("/");
  const submit = page.getByRole("button", { name: "提交内容" });
  await tabUntil(submit);
  await expectFocusVisible(submit);
  const beforeSubmit = page.url();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(beforeSubmit);

  if (testInfo.project.name === "mobile") {
    const menu = page.locator("[data-mobile-menu-button]");
    await tabUntil(menu);
    await expectFocusVisible(menu);
    await page.keyboard.press("Enter");
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    await expect(menu).toHaveAccessibleName("关闭导航");
    await expect(page.getByRole("navigation", { name: "移动端主导航" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await expect(menu).toHaveAccessibleName("打开导航");
    await expect(page.getByRole("navigation", { name: "移动端主导航" })).toBeHidden();
    await expect(menu).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Enter");
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await expect(menu).toHaveAccessibleName("打开导航");
    await expect(page.getByRole("navigation", { name: "移动端主导航" })).toBeHidden();
  }
});

for (const checkpoint of [
  { name: "home", route: "/" },
  { name: "discover", route: "/discover" },
  { name: "updates", route: "/updates" },
  { name: "detail", route: detailRoute },
]) {
  test(`${checkpoint.name} release framing and screenshot`, async ({ page }, testInfo) => {
    await page.goto(checkpoint.route);
    await expectNoHorizontalOverflow(page);
    await expectImagesLoaded(page);
    await expectControlsInBounds(page);
    await expectCardsAreSeparate(page);
    await expectCardTextFits(page);

    if (checkpoint.route === "/") {
      const hero = page.locator("main").locator("section").first();
      const heroBox = await hero.boundingBox();
      expect(heroBox).not.toBeNull();
      expect(heroBox!.width * heroBox!.height).toBeGreaterThan(100_000);
      const nextSectionTop = await page.locator('[data-home-section="categories"]').evaluate(
        (element) => element.getBoundingClientRect().top,
      );
      expect(nextSectionTop).toBeLessThan(page.viewportSize()!.height);
    }

    await mkdir(screenshotDirectory, { recursive: true });
    await page.screenshot({
      fullPage: true,
      path: resolve(screenshotDirectory, `${checkpoint.name}-${testInfo.project.name}.png`),
    });
  });
}

test("390x844 release pages keep exact document width", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Narrow mobile checkpoint only applies to mobile.");
  await page.setViewportSize({ width: 390, height: 844 });

  for (const route of ["/", "/discover", "/updates", detailRoute]) {
    await page.goto(route);
    await expectNoHorizontalOverflow(page);
    await expectControlsInBounds(page);
    await expectCardsAreSeparate(page);
    await expectCardTextFits(page);

    if (route === "/") {
      const dots = page.locator(".hero-carousel__dots button");
      await expect(dots).toHaveCount(heroItems.length);
      for (const dot of await dots.all()) {
        const box = await dot.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
    }
  }
});
