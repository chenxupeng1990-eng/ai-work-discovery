import { expect, test, type Locator, type Page } from "@playwright/test";
import { recommendContent } from "../../src/lib/discovery-recommendation";
import { generatedDataset } from "../fixtures/generated-dataset";
import { expectFocusVisible } from "./release-assertions";

const waitForPicker = async (page: Page, picker: Locator) => {
  await expect(page.locator("astro-island").filter({ has: picker })).toHaveCount(0);
  await expect(picker.locator("[data-quick-results]")).toBeVisible();
};

test("preference picker reranks recommendations and supports keyboard input", async ({ page }) => {
  await page.goto("/");
  const picker = page.getByRole("region", { name: "先挑 3 项适合现在尝试的内容" });
  await waitForPicker(page, picker);
  const time = picker.getByRole("group", { name: "多久见效" }).getByRole("button", { name: "半天" });
  await time.focus();
  await expectFocusVisible(time);
  await page.keyboard.press("Space");
  await picker.getByRole("group", { name: "主要目标" }).getByRole("button", { name: "团队实践" }).click();
  await picker.getByRole("group", { name: "想拿走什么" }).getByRole("button", { name: "团队案例" }).click();
  await picker.getByRole("group", { name: "接受的门槛" }).getByRole("button", { name: "需要开发" }).click();

  const expected = recommendContent(generatedDataset.items, {
    timeToValue: "半天",
    goal: "团队实践",
    format: "团队案例",
    adoptionLevel: "需要开发",
  }, 3);
  await expect(time).toHaveAttribute("aria-pressed", "true");
  await expect(picker.locator(".starter-result:visible").getByRole("heading")).toHaveText(
    expected.map((item) => item.title),
  );
});

test("quick-match panel uses the Chinese glass visual contract", async ({ page }) => {
  await page.goto("/");
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
  expect(styles.gridColumns).toHaveLength(width > 1180 ? 4 : width > 720 ? 2 : 1);
});

test("quick-match recommendations do not clip text at the middle breakpoint", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 1000 });
  await page.goto("/");
  const clippedText = await page.locator(
    ".starter-result:visible > p, .starter-result:visible .starter-result__takeaway",
  ).evaluateAll((elements) => elements.filter((element) => (
    element.scrollHeight > element.clientHeight + 1
  )).length);
  expect(clippedText).toBe(0);
});

test("mobile recommendation links stay inside their headings", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const escapedLinks = await page.locator(".starter-result:visible h3").evaluateAll((headings) => headings.filter((heading) => {
    const headingBox = heading.getBoundingClientRect();
    const linkBox = heading.querySelector("a")!.getBoundingClientRect();
    return linkBox.bottom > headingBox.bottom + 1;
  }).length);
  expect(escapedLinks).toBe(0);
});
