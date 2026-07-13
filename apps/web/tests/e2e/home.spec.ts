import { expect, test } from "@playwright/test";

test("homepage exposes shared navigation and one main landmark", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("banner")).toBeVisible();
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "发现", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "搜索" })).toBeVisible();
  await expect(page.getByRole("link", { name: "提交内容" })).toBeVisible();
  await expect(page.getByRole("contentinfo")).toBeVisible();
});

test("mobile navigation opens without resizing the header or overflowing", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Mobile navigation behavior only applies to the mobile project.");

  await page.goto("/");

  const header = page.getByRole("banner");
  const menu = page.getByRole("button", { name: "打开导航" });
  const initialHeight = await header.evaluate((element) => element.getBoundingClientRect().height);

  await menu.click();
  await expect(page.getByRole("navigation", { name: "移动端主导航" })).toBeVisible();
  await expect(header).toHaveCSS("height", `${initialHeight}px`);
  await expect(page.locator("html")).toHaveJSProperty("scrollWidth", await page.locator("html").evaluate((element) => element.clientWidth));
});
