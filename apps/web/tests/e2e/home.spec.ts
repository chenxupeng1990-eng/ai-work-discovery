import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
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

test("homepage exposes shared navigation and one main landmark", async ({ page }) => {
  await page.goto("/");

  const expectedNavigation = [
    ["发现", "/discover"],
    ["灵感实验", "/discover?track=灵感实验"],
    ["工作提效", "/discover?track=工作提效"],
    ["团队实践", "/discover?track=团队实践"],
    ["前沿信号", "/discover?track=前沿信号"],
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

test("homepage track links use tracks present in the public dataset and filter discovery", async ({ page }) => {
  await page.goto("/");

  const links = page.getByRole("navigation", { name: "发现方向" }).getByRole("link");
  await expect(links).toHaveCount(4);
  const actualTracks = new Set<string>(generatedDataset.items.map((item) => item.recommendationTrack));
  for (const link of await links.all()) {
    const href = await link.getAttribute("href");
    expect(href).toMatch(/^\/discover\?track=.+/);
    const track = new URL(href!, "https://example.test").searchParams.get("track");
    expect(actualTracks.has(track!)).toBe(true);
  }

  const targetTrack = "灵感实验";
  await page.getByRole("navigation", { name: "发现方向" }).getByRole("link", { name: targetTrack }).click();
  await expect(page.locator("[data-discovery-card]")).toHaveCount(
    generatedDataset.items.filter((item) => item.recommendationTrack === targetTrack).length,
  );
});

test("homepage prioritizes bounded discovery content over a rigid course", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "AI 工作灵感与实践" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "值得一试" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "AI 风向" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "随手可用" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "最近更新" })).toBeVisible();
  await expect(page.getByText("学习进度")).toHaveCount(0);

  await expect(page.locator('[data-home-section="spotlight"]')).toHaveCount(1);
  await expect(page.locator('[data-home-section="worth-trying"] [data-content-card]')).toHaveCount(5);
  const signalItems = page.locator('[data-home-section="ai-signals"] [data-signal-item]');
  const signalCount = await signalItems.count();
  expect(signalCount).toBeGreaterThanOrEqual(3);
  expect(signalCount).toBeLessThanOrEqual(5);
  await expect(page.locator('[data-home-section="ready-to-use"] [data-ready-item]')).toHaveCount(3);
  await expect(page.locator('[data-home-section="recent"] [data-recent-item]')).toHaveCount(6);

  const contentImages = page.locator('[data-home-content-image]');
  await expect(contentImages).toHaveCount(6);
  for (const image of await contentImages.all()) {
    await expect(image).toHaveAttribute("src", /^\/images\/fixtures\/.+\.png$/);
    await expect(image).toHaveAttribute("width", /\d+/);
    await expect(image).toHaveAttribute("height", /\d+/);
    await expect(image).toHaveJSProperty("complete", true);
  }

  const cardImages = page.locator('[data-content-card] [data-home-content-image]');
  await expect(cardImages).toHaveCount(5);
  for (const image of await cardImages.all()) {
    const box = await image.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width / box!.height).toBeGreaterThanOrEqual(1.58);
    expect(box!.width / box!.height).toBeLessThanOrEqual(1.62);
  }

  const contentLinks = page.locator('[data-home-content-link]');
  for (const link of await contentLinks.all()) {
    const href = await link.getAttribute("href");
    expect(href).toMatch(/^\/content\/[a-z0-9-]+$/);
    await expect(link).not.toHaveAttribute("target");
  }
});

test("AI signals section renders only AI Signal content", async ({ page }) => {
  await page.goto("/");

  const expectedSignalUrls = generatedDataset.items
    .filter((item) => item.type === "AI Signal")
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, 4)
    .map((item) => `/content/${item.slug}`);
  const renderedSignalUrls = await page
    .locator('[data-home-section="ai-signals"] [data-signal-item] a')
    .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  expect(renderedSignalUrls).toEqual(expectedSignalUrls);
});

test("homepage keeps the next section visible and avoids horizontal overflow", async ({ page }) => {
  await page.goto("/");

  const nextSection = page.locator('[data-home-section="worth-trying"]');
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
  { name: "detail", route: "/content/codex-environment-dependency-checklist" },
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
      const nextSectionTop = await page.locator('[data-home-section="worth-trying"]').evaluate(
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

  for (const route of ["/", "/discover", "/updates", "/content/codex-environment-dependency-checklist"]) {
    await page.goto(route);
    await expectNoHorizontalOverflow(page);
    await expectControlsInBounds(page);
    await expectCardsAreSeparate(page);
    await expectCardTextFits(page);
  }
});
