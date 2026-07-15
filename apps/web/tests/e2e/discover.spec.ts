import { expect, test, type Page } from "@playwright/test";
import {
  CODEX_METHOD_CATEGORIES,
  codexMethods,
  queryCodexMethods,
} from "../../src/data/codex-methods";
import { expectFocusVisible, expectNoHorizontalOverflow, tabUntil } from "./release-assertions";

const cards = (page: Page) => page.locator("[data-method-card]");
const waitForMethods = async (page: Page) => {
  await expect(page.locator("astro-island:not([ssr])")).toHaveCount(1);
};

test("Codex methods page renders the static collection and compact status hero", async ({ page }) => {
  await page.goto("/discover");

  await expect(page).toHaveTitle("Codex 方法合集 | QIFEI AI Work Discovery");
  await expect(page.getByRole("heading", { name: "Codex 方法合集" })).toBeVisible();
  await expect(page.getByText(`${codexMethods.length} 个方法`, { exact: true })).toBeVisible();
  await expect(page.getByText("每周人工复核", { exact: true })).toBeVisible();
  await expect(cards(page)).toHaveCount(12);
  await expect(cards(page).locator("img")).toHaveCount(0);
});

test("header exposes Codex methods and the search shortcut focuses method search", async ({ page }, testInfo) => {
  await page.goto("/");

  const methodLink = testInfo.project.name === "desktop"
    ? page.getByRole("navigation", { name: "主导航" }).getByRole("link", { name: "Codex 方法" })
    : page.locator('#mobile-navigation a[href="/discover"]');
  await expect(methodLink).toHaveAttribute("href", "/discover");
  await expect(methodLink).toHaveText("Codex 方法");
  const shortcut = page.getByRole("link", { name: "搜索 Codex 方法" });
  await expect(shortcut).toHaveAttribute("href", "/discover?focus=search");
  await shortcut.click();
  await expect(page).toHaveURL("/discover");
  await expect(page.getByRole("searchbox", { name: "搜索 Codex 方法" })).toBeFocused();
});

test("method search covers problem, outcome, prompt, category, and source", async ({ page }) => {
  await page.goto("/discover");
  await waitForMethods(page);
  const search = page.getByRole("searchbox", { name: "搜索 Codex 方法" });

  for (const query of ["磁盘", "结构化草稿", "关键动作", "Kostas"] as const) {
    await search.fill(query);
    const expected = queryCodexMethods(codexMethods, query, "全部");
    await expect(cards(page)).toHaveCount(expected.length);
    await expect(cards(page).getByRole("heading")).toHaveText(expected.map(({ title }) => title));
    await expect(page.getByRole("status", { name: "方法结果数量" })).toHaveText(
      `找到 ${expected.length} 个方法`,
    );
  }
});

test("category and query filters combine and persist in the URL", async ({ page }) => {
  await page.goto("/discover");
  await waitForMethods(page);
  const category = page.getByRole("button", { name: "开发与测试", exact: true });
  await category.click();
  await page.getByRole("searchbox", { name: "搜索 Codex 方法" }).fill("审查");

  const expected = queryCodexMethods(codexMethods, "审查", "开发与测试");
  await expect(cards(page)).toHaveCount(expected.length);
  await expect(page).toHaveURL(/category=%E5%BC%80%E5%8F%91%E4%B8%8E%E6%B5%8B%E8%AF%95/);
  await expect(page).toHaveURL(/q=%E5%AE%A1%E6%9F%A5/);
  await page.reload();
  await expect(category).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("searchbox", { name: "搜索 Codex 方法" })).toHaveValue("审查");
  await expect(cards(page)).toHaveCount(expected.length);
});

test("empty method search can be reset", async ({ page }) => {
  await page.goto("/discover");
  await waitForMethods(page);
  await page.getByRole("searchbox", { name: "搜索 Codex 方法" }).fill("不存在的方法-987654");

  await expect(page.getByRole("heading", { name: "没有找到匹配的方法" })).toBeVisible();
  await expect(page.getByRole("status", { name: "方法结果数量" })).toHaveText("找到 0 个方法");
  await page.getByRole("button", { name: "清除筛选" }).click();
  await expect(cards(page)).toHaveCount(codexMethods.length);
  await expect(page.getByRole("searchbox", { name: "搜索 Codex 方法" })).toBeFocused();
});

test("method prompt copies exactly and keeps the button dimensions stable", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/discover");
  await waitForMethods(page);
  const method = codexMethods[0]!;
  const card = cards(page).filter({ hasText: method.title });
  const copy = card.getByRole("button", { name: `复制 ${method.title}` });
  const before = await copy.boundingBox();
  await copy.click();

  await expect(card.getByRole("button", { name: `已复制 ${method.title}` })).toHaveText("已复制");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(method.prompt);
  const after = await card.getByRole("button", { name: `已复制 ${method.title}` }).boundingBox();
  expect(after?.width).toBe(before?.width);
  expect(after?.height).toBe(before?.height);
});

test("method prompt reports clipboard failure and supports retry", async ({ page }) => {
  await page.goto("/discover");
  await waitForMethods(page);
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
  const method = codexMethods[0]!;
  const card = cards(page).filter({ hasText: method.title });
  await card.getByRole("button", { name: `复制 ${method.title}` }).click();
  await expect(card.getByRole("alert")).toHaveText(`复制失败，请重试：${method.title}`);
  await card.getByRole("button", { name: `重新复制 ${method.title}` }).click();
  await expect(card.getByRole("status")).toHaveText(`已复制给 Codex：${method.title}`);
});

test("all method sources are HTTPS external links with provenance labels", async ({ page }) => {
  await page.goto("/discover");
  const sourceLinks = page.locator(".method-card__sources a");
  expect(await sourceLinks.count()).toBeGreaterThanOrEqual(codexMethods.length);

  for (const link of await sourceLinks.all()) {
    await expect(link).toHaveAttribute("href", /^https:\/\//);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noreferrer");
    await expect(link).toContainText(/^(公开案例|能力依据)/);
  }
});

test("method cards keep fixed information rows on desktop", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Three-column alignment applies to desktop.");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/discover");
  const firstRow = cards(page).locator(":scope");
  expect(await firstRow.count()).toBeGreaterThanOrEqual(3);
  const metrics = await cards(page).evaluateAll((elements) => elements.slice(0, 3).map((card) => {
    const top = (selector: string) => card.querySelector(selector)!.getBoundingClientRect().top;
    return {
      outcome: top(".method-card__outcome"),
      prompt: top(".method-card__prompt"),
      conditions: top(".method-card__conditions"),
      sources: top(".method-card__sources"),
    };
  }));
  for (const key of ["outcome", "prompt", "conditions", "sources"] as const) {
    const values = metrics.map((item) => item[key]);
    expect(Math.max(...values) - Math.min(...values), `${key} rows should align`).toBeLessThanOrEqual(1);
  }
});

test("methods page uses three, two, and one columns without overflow", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Responsive matrix runs once.");
  for (const [width, expectedColumns] of [[1440, 3], [900, 2], [390, 1]] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/discover");
    const columns = await page.locator(".methods-grid").evaluate((grid) => (
      getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length
    ));
    expect(columns).toBe(expectedColumns);
    await expectNoHorizontalOverflow(page);
  }
});

test("method search and category controls are keyboard operable", async ({ page }) => {
  await page.goto("/discover");
  await waitForMethods(page);
  const search = page.getByRole("searchbox", { name: "搜索 Codex 方法" });
  await tabUntil(search);
  await expectFocusVisible(search);
  await search.fill("飞书");
  await expect(cards(page)).toHaveCount(queryCodexMethods(codexMethods, "飞书", "全部").length);

  await search.fill("");
  const category = page.getByRole("button", { name: CODEX_METHOD_CATEGORIES[0], exact: true });
  await tabUntil(category);
  await expectFocusVisible(category);
  await page.keyboard.press("Space");
  await expect(category).toHaveAttribute("aria-pressed", "true");
});
