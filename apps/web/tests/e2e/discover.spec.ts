import { expect, test, type Page } from "@playwright/test";

const waitForExplorer = async (page: Page) => {
  await expect(page.locator("astro-island:not([ssr])")).toHaveCount(1);
};

test("header search is a valid discovery navigation", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("link", { name: "搜索" })).toHaveAttribute("href", "/discover");
});

test("search filters Chinese content and announces the result count", async ({ page }) => {
  await page.goto("/discover");
  await waitForExplorer(page);

  await page.getByRole("searchbox", { name: "搜索内容" }).fill("飞书");

  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("article")).toContainText("用飞书桥把 Codex 变成团队可调用的工作入口");
  await expect(page.getByRole("status", { name: "搜索结果数量" })).toHaveText("找到 1 项内容");
});

test("category chips filter results without moving the control bar", async ({ page }) => {
  await page.goto("/discover");
  await waitForExplorer(page);

  const controls = page.locator("[data-discovery-controls]");
  const before = await controls.boundingBox();
  const category = page.getByRole("button", { name: "产品信号", exact: true });

  await category.click();

  await expect(category).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("article")).toContainText("OpenAI 发布 Agent 构建工具");
  const after = await controls.boundingBox();
  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(after!.x).toBe(before!.x);
  expect(after!.y).toBe(before!.y);
  expect(after!.width).toBe(before!.width);
});

test("featured and latest sorting expose stable pressed state", async ({ page }) => {
  await page.goto("/discover");
  await waitForExplorer(page);

  const featured = page.getByRole("button", { name: "精选", exact: true });
  const latest = page.getByRole("button", { name: "最新", exact: true });

  await expect(featured).toHaveAttribute("aria-pressed", "true");
  await expect(latest).toHaveAttribute("aria-pressed", "false");
  await latest.click();
  await expect(featured).toHaveAttribute("aria-pressed", "false");
  await expect(latest).toHaveAttribute("aria-pressed", "true");
});

test("empty search renders a complete resettable state", async ({ page }) => {
  await page.goto("/discover");
  await waitForExplorer(page);

  await page.getByRole("searchbox", { name: "搜索内容" }).fill("不存在的检索词-987654");

  await expect(page.getByRole("heading", { name: "没有找到匹配内容" })).toBeVisible();
  await expect(page.getByText("试试缩短关键词，或清除筛选查看全部内容。")).toBeVisible();
  await expect(page.getByRole("status", { name: "搜索结果数量" })).toHaveText("找到 0 项内容");
  await page.getByRole("button", { name: "清除筛选" }).click();
  await expect(page.getByRole("article")).toHaveCount(10);
  await expect(page.getByRole("button", { name: "全部", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "精选", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("listing cards keep valid detail hrefs and fixed image geometry", async ({ page }) => {
  await page.goto("/discover");
  await waitForExplorer(page);

  const cards = page.getByRole("article");
  await expect(cards).toHaveCount(10);
  for (const card of await cards.all()) {
    const link = card.getByRole("link");
    await expect(link).toHaveAttribute("href", /^\/content\/[a-z0-9]+(?:-[a-z0-9]+)*$/);

    const image = card.getByRole("img");
    const box = await image.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width / box!.height).toBeGreaterThanOrEqual(1.58);
    expect(box!.width / box!.height).toBeLessThanOrEqual(1.62);
  }

  await expect(page.locator('[href^="#"]')).toHaveCount(0);
});

test("discovery page avoids horizontal overflow and overlapping cards", async ({ page }) => {
  await page.goto("/discover");
  await waitForExplorer(page);

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport!.width);

  const cards = page.getByRole("article");
  if (await cards.count() > 1) {
    const first = await cards.nth(0).boundingBox();
    const second = await cards.nth(1).boundingBox();
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    const overlaps = first!.x < second!.x + second!.width
      && first!.x + first!.width > second!.x
      && first!.y < second!.y + second!.height
      && first!.y + first!.height > second!.y;
    expect(overlaps).toBe(false);
  }
});
