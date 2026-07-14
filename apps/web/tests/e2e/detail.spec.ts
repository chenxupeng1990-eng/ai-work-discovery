import { expect, test } from "@playwright/test";
import { generatedDataset } from "../fixtures/generated-dataset";
import { expectFocusVisible, tabUntil } from "./release-assertions";

const dataset = generatedDataset;
const agentsItem = dataset.items.find((item) => item.slug === "agents-md-team-configuration")!;
const bridgeItem = dataset.items.find((item) => item.slug === "feishu-bridge-team-entry")!;

test("all public dataset items have static detail routes and unknown slugs return 404", async ({ request }) => {
  expect(dataset.items).toHaveLength(10);

  for (const item of dataset.items) {
    const response = await request.get(`/content/${item.slug}`);
    expect(response.status(), item.slug).toBe(200);
  }

  const missing = await request.get("/content/not-a-real-content-slug");
  expect(missing.status()).toBe(404);
});

test("detail page renders maintained fields and preserves the original source", async ({ page }) => {
  await page.goto(`/content/${agentsItem.slug}`);

  await expect(page.getByRole("heading", { level: 1, name: agentsItem.title })).toBeVisible();
  await expect(page.getByRole("img", { name: `${agentsItem.title}封面` })).toHaveAttribute("src", agentsItem.coverImage);
  await expect(page.getByText(agentsItem.type, { exact: true })).toBeVisible();
  await expect(page.getByText(agentsItem.category, { exact: true })).toBeVisible();
  await expect(page.locator(".detail-hero__summary")).toHaveText(agentsItem.summary);
  await expect(page.getByText(agentsItem.recommendationReason, { exact: true })).toBeVisible();
  await expect(page.getByText(agentsItem.scenario, { exact: true })).toBeVisible();
  for (const audience of agentsItem.audience) await expect(page.getByText(audience, { exact: true })).toBeVisible();
  for (const tag of agentsItem.tags) await expect(page.getByText(tag, { exact: true }).first()).toBeVisible();

  const sourceLinks = page.locator("[data-source-actions] a");
  await expect(sourceLinks).toHaveCount(1);
  await expect(sourceLinks.first()).toHaveAttribute("href", agentsItem.originalUrl!);
  for (const link of await sourceLinks.all()) {
    await expect(link).toHaveAttribute("target", "_blank");
    expect((await link.getAttribute("rel"))?.split(/\s+/)).toEqual(
      expect.arrayContaining(["noopener", "noreferrer"]),
    );
  }

  await expect(page.getByText(agentsItem.id)).toHaveCount(0);
  await expect(page.getByText(String(agentsItem.sortWeight), { exact: true })).toHaveCount(0);
});

test("Feishu document card is omitted without an explicitly public URL", async ({ page }) => {
  await page.goto(`/content/${agentsItem.slug}`);

  await expect(page.locator("[data-feishu-document-card]")).toHaveCount(0);
  await expect(page.getByRole("link", { name: `打开原始来源：${agentsItem.sourceName}` })).toHaveAttribute(
    "href",
    agentsItem.originalUrl!,
  );
});

test("copy block reports success without shifting its button", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/content/codex-environment-dependency-checklist");

  const button = page.getByRole("button", { name: "复制 基础依赖检查" });
  await expect(button).toBeEnabled();
  await button.scrollIntoViewIfNeeded();
  const before = await button.boundingBox();
  await button.click();

  await expect(button).toHaveAccessibleName("已复制 基础依赖检查");
  await expect(page.getByRole("status")).toHaveText("已复制 基础依赖检查");
  expect(await button.boundingBox()).toEqual(before);
});

test("copy block reports clipboard failure without claiming success and can retry", async ({ page }) => {
  await page.goto("/content/codex-environment-dependency-checklist");

  const button = page.getByRole("button", { name: "复制 基础依赖检查" });
  await expect(button).toBeEnabled();
  await page.evaluate(() => {
    let attempts = 0;
    Object.defineProperty(navigator.clipboard, "writeText", {
      configurable: true,
      value: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("denied");
      },
    });
  });
  await button.click();
  await expect(page.getByRole("alert")).toHaveText("复制失败，请重试");
  await expect(button).toHaveAccessibleName("复制 基础依赖检查");
  await expect(button).toBeEnabled();

  await button.click();
  await expect(button).toHaveAccessibleName("已复制 基础依赖检查");
});

test("homepage and discovery cards navigate to internal detail pages", async ({ page }) => {
  await page.goto("/");
  const homeLink = page.locator('[data-content-card] a[href^="/content/"]').first();
  const homeTitle = await homeLink.getByRole("heading").textContent();
  const homeHref = await homeLink.getAttribute("href");
  await page.goto(homeHref!);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(homeTitle!);

  await page.goto("/discover");
  await expect(page.locator("astro-island:not([ssr])")).toHaveCount(1);
  const discoveryLink = page.locator('.discovery-card a[href^="/content/"]').first();
  const discoveryTitle = await discoveryLink.getByRole("heading").textContent();
  const discoveryHref = await discoveryLink.getAttribute("href");
  await page.goto(discoveryHref!);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(discoveryTitle!);
});

test("detail page excludes itself from related content and never overflows horizontally", async ({ page }) => {
  await page.goto(`/content/${bridgeItem.slug}`);

  const related = page.locator("[data-related-content] [data-content-card]");
  const expected = dataset.items.filter((item) => item.id !== bridgeItem.id && (
    item.category === bridgeItem.category || item.tags.some((tag) => bridgeItem.tags.includes(tag))
  ));
  expect(await related.count()).toBeGreaterThan(0);
  expect(await related.count()).toBeLessThanOrEqual(expected.length);
  await expect(related.filter({ hasText: bridgeItem.title })).toHaveCount(0);

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport!.width);
});

test("updates groups all items by date in descending updatedAt order", async ({ page }) => {
  await page.goto("/updates");

  const expectedItems = [...dataset.items].sort((left, right) =>
    Date.parse(right.updatedAt) - Date.parse(left.updatedAt) || left.slug.localeCompare(right.slug),
  );
  const expectedDates = [...new Set(expectedItems.map((item) => item.updatedAt.slice(0, 10)))];
  const groups = page.locator("[data-update-group]");
  await expect(groups).toHaveCount(expectedDates.length);
  expect(await groups.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-date")))).toEqual(expectedDates);

  const hrefs = await page.locator("[data-update-item] a").evaluateAll((links) =>
    links.map((link) => link.getAttribute("href")),
  );
  expect(hrefs).toEqual(expectedItems.map((item) => `/content/${item.slug}`));
});

test("copy and original source actions operate from the keyboard", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`/content/${agentsItem.slug}`);

  const copy = page.locator(".copy-block__button").first();
  await tabUntil(copy);
  await expectFocusVisible(copy);
  await page.keyboard.press("Enter");
  await expect(copy).toHaveAccessibleName(/^已复制 /);

  const external = page.getByRole("link", { name: `打开原始来源：${agentsItem.sourceName}` });
  await tabUntil(external);
  await expectFocusVisible(external);
  await external.evaluate((element) => {
    element.addEventListener("click", (event) => {
      event.preventDefault();
      document.documentElement.dataset.keyboardExternalHref = (event.currentTarget as HTMLAnchorElement).href;
    }, { once: true });
  });
  await page.keyboard.press("Enter");
  await expect.poll(() => page.locator("html").getAttribute("data-keyboard-external-href"))
    .toBe(agentsItem.originalUrl!);
});
