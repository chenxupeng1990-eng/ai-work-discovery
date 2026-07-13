import { expect, test } from "@playwright/test";

test("homepage exposes shared navigation and one main landmark", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("banner")).toBeVisible();
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "发现", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "搜索" })).toBeVisible();
  await expect(page.getByRole("button", { name: "提交内容" })).toBeDisabled();
  await expect(page.locator('a[href="#discover"], a[href="#ready"], a[href="#submit"]')).toHaveCount(0);
  await expect(page.getByRole("contentinfo")).toBeVisible();
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
