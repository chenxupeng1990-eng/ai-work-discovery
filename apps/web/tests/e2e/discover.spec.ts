import { expect, test, type Page } from "@playwright/test";
import { queryContent } from "../../src/lib/content-query";
import { DISCOVERY_TRACKS, recommendContent } from "../../src/lib/discovery-recommendation";
import { generatedDataset } from "../fixtures/generated-dataset";
import { expectFocusVisible, tabUntil } from "./release-assertions";

const waitForExplorer = async (page: Page) => {
  await expect(page.locator("astro-island:not([ssr])")).toHaveCount(1);
};

const listingCards = (page: Page) => page.locator("[data-discovery-card]");
const normalizeNewlines = (value: string) => value.replace(/\r\n/g, "\n");
const populatedTrack = DISCOVERY_TRACKS.find((track) => (
  generatedDataset.items.some((item) => item.recommendationTrack === track)
))!;

test("header search is a valid discovery navigation", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("link", { name: "搜索" })).toHaveAttribute("href", "/discover");
});

test("search filters Chinese content and announces the result count", async ({ page }) => {
  await page.goto("/discover");
  await waitForExplorer(page);

  await page.getByRole("searchbox", { name: "搜索内容" }).fill("飞书");

  const expected = queryContent(generatedDataset.items, {
    query: "飞书",
    category: "全部",
    sort: "featured",
  });
  await expect(listingCards(page)).toHaveCount(expected.length);
  await expect(listingCards(page).getByRole("heading")).toHaveText(expected.map((item) => item.title));
  await expect(page.getByRole("status", { name: "搜索结果数量" })).toHaveText(`找到 ${expected.length} 项内容`);
});

test("search matches copy block titles but not copy block bodies", async ({ page }) => {
  await page.goto("/discover");
  await waitForExplorer(page);

  const item = generatedDataset.items.find((candidate) => candidate.copyBlocks.length > 0)!;
  const block = [...item.copyBlocks].sort((left, right) => left.order - right.order)[0]!;
  const bodyOnlyQuery = block.content.split(/\r?\n/).find((line) => (
    line.trim().length >= 12
    && queryContent(generatedDataset.items, { query: line.trim(), category: "全部", sort: "featured" }).length === 0
  ))!;
  const search = page.getByRole("searchbox", { name: "搜索内容" });
  await search.fill(block.title);
  await expect(listingCards(page)).toHaveCount(1);
  await expect(listingCards(page)).toContainText(item.title);

  await search.fill(bodyOnlyQuery);
  await expect(listingCards(page)).toHaveCount(0);
});

test("track query initializes, updates, and rejects unknown tracks", async ({ page }) => {
  await page.goto("/discover?track=前沿信号");
  await waitForExplorer(page);

  await expect(page.getByRole("button", { name: "前沿信号", exact: true }).last()).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("group", { name: "主要目标" }).getByRole("button", { name: "前沿信号" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(listingCards(page)).toHaveCount(
    generatedDataset.items.filter((item) => item.recommendationTrack === "前沿信号").length,
  );

  await page.getByRole("button", { name: "团队实践", exact: true }).last().click();
  await expect(page).toHaveURL(/\/discover\?track=%E5%9B%A2%E9%98%9F%E5%AE%9E%E8%B7%B5$/);
  const recommendationBeforeReload = await page.locator(".starter-result").first().getByRole("heading").textContent();
  await page.reload();
  await waitForExplorer(page);
  await expect(page.locator(".starter-result").first().getByRole("heading")).toHaveText(
    recommendationBeforeReload!,
  );

  await page.goto("/discover?track=不存在");
  await expect(page.getByRole("button", { name: "全部", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(listingCards(page)).toHaveCount(generatedDataset.items.length);
  await expect(page).toHaveURL("/discover");
});

test("track chips filter results without resizing the control bar", async ({ page }) => {
  await page.goto("/discover");
  await waitForExplorer(page);

  const controls = page.locator("[data-discovery-controls]");
  await controls.scrollIntoViewIfNeeded();
  const before = await controls.boundingBox();
  const track = page.getByRole("button", { name: populatedTrack, exact: true }).last();

  await track.click();

  await expect(track).toHaveAttribute("aria-pressed", "true");
  await expect(listingCards(page)).toHaveCount(
    generatedDataset.items.filter((item) => item.recommendationTrack === populatedTrack).length,
  );
  const expectedTrackItem = generatedDataset.items.find((item) => item.recommendationTrack === populatedTrack)!;
  await expect(listingCards(page).filter({ hasText: expectedTrackItem.title })).toHaveCount(1);
  const after = await controls.boundingBox();
  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(after!.x).toBe(before!.x);
  expect(after!.width).toBe(before!.width);
  expect(after!.height).toBe(before!.height);
});

test("latest sorting changes the first result according to updatedAt", async ({ page }) => {
  await page.goto("/discover");
  await waitForExplorer(page);

  const featured = page.getByRole("button", { name: "精选", exact: true });
  const latest = page.getByRole("button", { name: "最新", exact: true });
  const cardHeadings = listingCards(page).getByRole("heading");
  const featuredFirst = await cardHeadings.first().textContent();
  const expectedFeaturedOrder = [...generatedDataset.items]
    .sort((left, right) => right.sortWeight - left.sortWeight
      || Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
      || left.slug.localeCompare(right.slug))
    .map((item) => item.title);
  const expectedLatestOrder = [...generatedDataset.items]
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
      || right.sortWeight - left.sortWeight
      || left.slug.localeCompare(right.slug))
    .map((item) => item.title);

  await expect(featured).toHaveAttribute("aria-pressed", "true");
  await expect(latest).toHaveAttribute("aria-pressed", "false");
  await expect(cardHeadings).toHaveText(expectedFeaturedOrder);
  expect(featuredFirst).toBe(expectedFeaturedOrder[0]);

  await latest.click();

  await expect(featured).toHaveAttribute("aria-pressed", "false");
  await expect(latest).toHaveAttribute("aria-pressed", "true");
  await expect(cardHeadings.first()).toHaveText(expectedLatestOrder[0]);
  await expect(cardHeadings).toHaveText(expectedLatestOrder);
  expect(featuredFirst).toBe(expectedFeaturedOrder[0]);
});

test("empty search renders a complete resettable state", async ({ page }) => {
  await page.goto("/discover");
  await waitForExplorer(page);

  await page.getByRole("searchbox", { name: "搜索内容" }).fill("不存在的检索词-987654");

  await expect(page.getByRole("heading", { name: "没有找到匹配内容" })).toBeVisible();
  await expect(page.getByText("试试缩短关键词，或清除筛选查看全部内容。")).toBeVisible();
  await expect(page.getByRole("status", { name: "搜索结果数量" })).toHaveText("找到 0 项内容");
  await page.getByRole("button", { name: "清除筛选" }).click();
  await expect(listingCards(page)).toHaveCount(generatedDataset.items.length);
  await expect(page.getByRole("button", { name: "全部", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "精选", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("listing cards link every item to its internal detail page", async ({ page }) => {
  await page.goto("/discover");
  await waitForExplorer(page);

  const cards = listingCards(page);
  await expect(cards).toHaveCount(generatedDataset.items.length);
  for (const item of generatedDataset.items) {
    const link = cards.filter({ hasText: item.title }).getByRole("link", { name: item.title, exact: true });
    await expect(link).toHaveAttribute("href", `/content/${item.slug}`);
    await expect(link).not.toHaveAttribute("target");
  }

  for (const card of await cards.all()) {

    const image = card.getByRole("img");
    const box = await image.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width / box!.height).toBeGreaterThanOrEqual(1.58);
    expect(box!.width / box!.height).toBeLessThanOrEqual(1.62);
  }

  await expect(page.locator('[href^="#"]')).toHaveCount(0);
  await expect(page.locator(".discovery-grid").locator("[data-discovery-card]")).toHaveCount(
    generatedDataset.items.length,
  );
});

test("listing card copies its first reusable block", async ({ page, context }) => {
  const item = generatedDataset.items.find((candidate) => candidate.copyBlocks.length > 0)!;
  const firstBlock = [...item.copyBlocks].sort((left, right) => left.order - right.order)[0]!;
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/discover");
  await waitForExplorer(page);

  const card = listingCards(page).filter({ hasText: item.title });
  const copy = card.getByRole("button", { name: `复制 ${item.title}` });
  await copy.focus();
  await expectFocusVisible(copy);
  await page.keyboard.press("Enter");

  await expect(card.getByRole("button", { name: `已复制 ${item.title}` })).toBeVisible();
  await expect.poll(async () => normalizeNewlines(await page.evaluate(() => navigator.clipboard.readText())))
    .toBe(normalizeNewlines(firstBlock.content));
});

test("listing card reports clipboard failure and supports retry", async ({ page }) => {
  const item = generatedDataset.items.find((candidate) => candidate.copyBlocks.length > 0)!;
  await page.goto("/discover");
  await waitForExplorer(page);
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

  const card = listingCards(page).filter({ hasText: item.title });
  await card.getByRole("button", { name: `复制 ${item.title}` }).click();
  await expect(card.getByRole("alert")).toHaveText(`复制失败，请重试：${item.title}`);
  const retry = card.getByRole("button", { name: `重试复制 ${item.title}` });
  await expect(retry).toBeEnabled();

  await retry.click();
  await expect(card.getByRole("status")).toHaveText(`已复制：${item.title}`);
});

test("preference picker reranks recommendations and supports keyboard input", async ({ page }) => {
  await page.goto("/discover");
  await waitForExplorer(page);

  const time = page.getByRole("group", { name: "多久见效" }).getByRole("button", { name: "半天" });
  await time.focus();
  await expectFocusVisible(time);
  await page.keyboard.press("Space");
  await page.getByRole("group", { name: "主要目标" }).getByRole("button", { name: "团队实践" }).click();
  await page.getByRole("group", { name: "想拿走什么" }).getByRole("button", { name: "团队案例" }).click();
  await page.getByRole("group", { name: "接受的门槛" }).getByRole("button", { name: "需要开发" }).click();

  const expected = recommendContent(generatedDataset.items, {
    timeToValue: "半天",
    goal: "团队实践",
    format: "团队案例",
    adoptionLevel: "需要开发",
  }, 3);
  await expect(time).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".starter-result").getByRole("heading")).toHaveText(
    expected.map((item) => item.title),
  );
});

test("quick-match panel uses the Chinese glass visual contract", async ({ page }) => {
  await page.goto("/discover");
  await waitForExplorer(page);

  const styles = await page.locator(".starter-picker").evaluate((panel) => {
    const panelStyle = getComputedStyle(panel);
    const headingStyle = getComputedStyle(panel.querySelector("h2")!);
    const controlsStyle = getComputedStyle(panel.querySelector(".starter-picker__controls")!);

    return {
      backdropFilter: panelStyle.backdropFilter,
      backgroundColor: panelStyle.backgroundColor,
      fontFamily: headingStyle.fontFamily,
      fontWeight: headingStyle.fontWeight,
      gridColumns: controlsStyle.gridTemplateColumns.split(" ").filter(Boolean),
      mutedColor: getComputedStyle(panel.querySelector(".preference-group legend")!).color,
    };
  });

  expect(styles.backdropFilter).toContain("blur(");
  expect(styles.backgroundColor).toBe("rgba(245, 245, 247, 0.72)");
  expect(styles.fontFamily).toContain("PingFang SC");
  expect(styles.fontWeight).toBe("500");
  expect(styles.mutedColor).toBe("rgb(112, 112, 112)");

  const width = page.viewportSize()!.width;
  const expectedColumns = width > 1180 ? 4 : width > 720 ? 2 : 1;
  expect(styles.gridColumns).toHaveLength(expectedColumns);

  const clippedGroups = await page.locator(".preference-group").evaluateAll((groups) => groups.filter((group) => {
    const groupBox = group.getBoundingClientRect();
    return [...group.querySelectorAll("button")].some((button) => {
      const buttonBox = button.getBoundingClientRect();
      return buttonBox.right > groupBox.right + 1;
    });
  }).length);
  expect(clippedGroups).toBe(0);
});

test("quick-match recommendations do not clip text at the middle breakpoint", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 1000 });
  await page.goto("/discover");
  await waitForExplorer(page);

  const clippedText = await page.locator(
    ".starter-result > p, .starter-result__takeaway",
  ).evaluateAll((elements) => elements.filter((element) => (
    element.scrollHeight > element.clientHeight + 1
  )).length);

  expect(clippedText).toBe(0);
});

test("mobile recommendation links stay inside their clamped headings", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/discover");
  await waitForExplorer(page);

  const escapedLinks = await page.locator(".starter-result h3").evaluateAll((headings) => headings.filter((heading) => {
    const headingBox = heading.getBoundingClientRect();
    const linkBox = heading.querySelector("a")!.getBoundingClientRect();
    return linkBox.bottom > headingBox.bottom + 1;
  }).length);

  expect(escapedLinks).toBe(0);
});

test("Chinese display typography keeps zero letter spacing", async ({ page }) => {
  await page.goto("/discover");
  await waitForExplorer(page);

  await expect.poll(() => page.locator("#discover-title").evaluate((heading) => (
    getComputedStyle(heading).letterSpacing
  ))).toMatch(/^(normal|0px)$/);
});

test("discovery page avoids horizontal overflow and overlapping cards", async ({ page }) => {
  await page.goto("/discover");
  await waitForExplorer(page);

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport!.width);

  const cards = listingCards(page);
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

test("discovery search, track, and sort controls operate from the keyboard", async ({ page }) => {
  await page.goto("/discover");
  await waitForExplorer(page);

  const search = page.getByRole("searchbox", { name: "搜索内容" });
  await tabUntil(search);
  await expectFocusVisible(search);
  await search.fill("飞书");
  await expect(listingCards(page)).toHaveCount(queryContent(generatedDataset.items, {
    query: "飞书",
    category: "全部",
    sort: "featured",
  }).length);

  await search.fill("");
  const track = page.getByRole("button", { name: "前沿信号", exact: true }).last();
  await tabUntil(track);
  await expectFocusVisible(track);
  await page.keyboard.press("Space");
  await expect(track).toHaveAttribute("aria-pressed", "true");

  const latest = page.getByRole("button", { name: "最新", exact: true });
  await tabUntil(latest);
  await expectFocusVisible(latest);
  await page.keyboard.press("Enter");
  await expect(latest).toHaveAttribute("aria-pressed", "true");
});
