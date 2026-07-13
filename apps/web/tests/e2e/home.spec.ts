import { expect, test } from "@playwright/test";
import { fixtureDataset } from "../../src/data/fixtures";

test("homepage exposes shared navigation and one main landmark", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("banner")).toBeVisible();
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "发现", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "搜索" })).toHaveAttribute("href", "/discover");
  await expect(page.locator('a[href="/cases"], a[href="/collaboration"], a[href="/resources"], a[href="/signals"]')).toHaveCount(0);
  await expect(page.locator('a[href="/updates"]')).toHaveCount(2);
  await expect(page.getByRole("button", { name: "提交内容" })).toBeDisabled();
  await expect(page.locator('a[href="#discover"], a[href="#ready"], a[href="#submit"]')).toHaveCount(0);
  await expect(page.getByRole("contentinfo")).toBeVisible();
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

  const expectedSignalUrls = fixtureDataset.items
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
  const menu = page.getByRole("button", { name: "打开导航" });
  const navigation = page.getByRole("navigation", { name: "移动端主导航" });
  const initialHeight = await header.evaluate((element) => element.getBoundingClientRect().height);

  await expect(menu).toHaveAttribute("aria-controls", "mobile-navigation");
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(navigation).toBeHidden();
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await expect(navigation).toBeVisible();
  expect(await header.evaluate((element) => element.getBoundingClientRect().height)).toBe(initialHeight);

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport!.width);
});
