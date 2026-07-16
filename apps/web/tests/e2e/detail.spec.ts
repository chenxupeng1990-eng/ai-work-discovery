import { expect, test } from "@playwright/test";
import { generatedDataset } from "../fixtures/generated-dataset";
import { expectFocusVisible, tabUntil } from "./release-assertions";

const dataset = generatedDataset;
const sourceItem = dataset.items.find((item) => item.originalUrl && item.copyBlocks.length > 0)!;
const sourceOnlyItem = dataset.items.find((item) => item.originalUrl && !item.feishuDocumentUrl)!;
const copyBlock = [...sourceItem.copyBlocks].sort((left, right) => left.order - right.order)[0]!;
const relatedItem = dataset.items.find((item) => dataset.items.some((candidate) => (
  candidate.id !== item.id
  && (candidate.category === item.category || candidate.tags.some((tag) => item.tags.includes(tag)))
)))!;

test("all public dataset items have static detail routes and unknown slugs return 404", async ({ request }) => {
  expect(dataset.items.length).toBeGreaterThan(0);

  for (const item of dataset.items) {
    const response = await request.get(`/content/${item.slug}`);
    expect(response.status(), item.slug).toBe(200);
  }

  const missing = await request.get("/content/not-a-real-content-slug");
  expect(missing.status()).toBe(404);
});

test("detail page renders maintained fields and preserves the original source", async ({ page }) => {
  await page.goto(`/content/${sourceItem.slug}`);

  const detailHero = page.locator(".detail-hero");
  await expect(page.getByRole("heading", { level: 1, name: sourceItem.title })).toBeVisible();
  await expect(page.getByRole("img", { name: `${sourceItem.title}封面` })).toHaveAttribute("src", sourceItem.coverImage);
  await expect(detailHero.getByText(sourceItem.type, { exact: true })).toBeVisible();
  await expect(detailHero.getByText(sourceItem.category, { exact: true })).toBeVisible();
  await expect(page.locator(".detail-hero__summary")).toHaveText(sourceItem.summary);
  await expect(page.locator(".detail-hero__outcome")).toContainText(sourceItem.takeaway);
  await expect(page.locator(".detail-hero__scenario")).toContainText(sourceItem.scenario);
  await expect(page.getByText(sourceItem.recommendationReason, { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "它能帮你解决什么" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "这些工作场景最适合" })).toBeVisible();
  for (const audience of sourceItem.audience) await expect(page.getByText(audience, { exact: true })).toBeVisible();
  for (const tag of sourceItem.tags) await expect(page.getByText(tag, { exact: true }).first()).toBeVisible();

  const sourceLinks = page.locator("[data-source-actions] a");
  const expectedSourceUrls = [sourceItem.feishuDocumentUrl, sourceItem.originalUrl].filter(Boolean);
  await expect(sourceLinks).toHaveCount(expectedSourceUrls.length);
  expect(await sourceLinks.evaluateAll((links) => links.map((link) => link.getAttribute("href"))))
    .toEqual(expect.arrayContaining(expectedSourceUrls));
  for (const link of await sourceLinks.all()) {
    await expect(link).toHaveAttribute("target", "_blank");
    expect((await link.getAttribute("rel"))?.split(/\s+/)).toEqual(
      expect.arrayContaining(["noopener", "noreferrer"]),
    );
  }

  await expect(page.getByText(sourceItem.id)).toHaveCount(0);
  await expect(page.getByText(String(sourceItem.sortWeight), { exact: true })).toHaveCount(0);
});

test("Feishu document card is omitted without an explicitly public URL", async ({ page }) => {
  await page.goto(`/content/${sourceOnlyItem.slug}`);

  await expect(page.locator("[data-feishu-document-card]")).toHaveCount(0);
  await expect(page.getByRole("link", { name: `打开原始来源：${sourceOnlyItem.sourceName}` })).toHaveAttribute(
    "href",
    sourceOnlyItem.originalUrl!,
  );
});

test("copy block reports success without shifting its button", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`/content/${sourceItem.slug}`);

  const button = page.locator(".copy-block__button");
  await expect(button).toHaveCount(1);
  await expect(button).toHaveAccessibleName(`复制 ${copyBlock.title}`);
  await expect(button).toBeEnabled();
  await button.scrollIntoViewIfNeeded();
  const before = await button.boundingBox();
  await button.click();

  await expect(button).toHaveAccessibleName(`已复制 ${copyBlock.title}`);
  await expect(page.getByRole("status")).toHaveText(`已复制 ${copyBlock.title}`);
  expect(await button.boundingBox()).toEqual(before);
});

test("copy block reports clipboard failure without claiming success and can retry", async ({ page }) => {
  await page.goto(`/content/${sourceItem.slug}`);

  const button = page.locator(".copy-block__button");
  await expect(button).toHaveCount(1);
  await expect(button).toHaveAccessibleName(`复制 ${copyBlock.title}`);
  await expect(button).toBeEnabled();
  await page.evaluate(() => {
    let attempts = 0;
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: () => false,
    });
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
  await expect(button).toHaveAccessibleName(`复制 ${copyBlock.title}`);
  await expect(button).toBeEnabled();

  await button.click();
  await expect(button).toHaveAccessibleName(`已复制 ${copyBlock.title}`);
});

test("homepage cards navigate to details while Codex methods stay independent", async ({ page }) => {
  await page.goto("/");
  const homeCard = page.locator('[data-home-section="discovery"] [data-discovery-card]').first();
  const homeTitle = await homeCard.getByRole("heading").textContent();
  const homeLink = homeCard.getByRole("link", { name: homeTitle!, exact: true });
  const homeHref = await homeLink.getAttribute("href");
  await page.goto(homeHref!);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(homeTitle!);

  await page.goto("/discover");
  await expect(page.locator("astro-island:not([ssr])")).toHaveCount(1);
  await expect(page.locator("[data-method-card]")).toHaveCount(12);
  await expect(page.locator('[data-method-card] a[href^="/content/"]')).toHaveCount(0);
});

test("detail page excludes itself from related content and never overflows horizontally", async ({ page }) => {
  await page.goto(`/content/${relatedItem.slug}`);

  const related = page.locator("[data-related-content] [data-content-card]");
  const expected = dataset.items.filter((item) => item.id !== relatedItem.id && (
    item.category === relatedItem.category || item.tags.some((tag) => relatedItem.tags.includes(tag))
  ));
  expect(await related.count()).toBeGreaterThan(0);
  expect(await related.count()).toBeLessThanOrEqual(expected.length);
  await expect(related.filter({ hasText: relatedItem.title })).toHaveCount(0);

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
  await page.goto(`/content/${sourceItem.slug}`);

  const copy = page.locator(".copy-block__button").first();
  await tabUntil(copy);
  await expectFocusVisible(copy);
  await page.keyboard.press("Enter");
  await expect(copy).toHaveAccessibleName(/^已复制 /);

  const external = page.getByRole("link", { name: `打开原始来源：${sourceItem.sourceName}` });
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
    .toBe(sourceItem.originalUrl!);
});
