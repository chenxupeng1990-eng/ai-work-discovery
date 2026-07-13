import { expect, type Locator, type Page } from "@playwright/test";

const CARD_SELECTOR = [
  "[data-content-card]",
  ".discovery-card",
  "[data-feishu-document-card]",
  ".copy-block",
].join(",");

export async function expectNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))).toEqual(expect.objectContaining({
    clientWidth: page.viewportSize()!.width,
    scrollWidth: page.viewportSize()!.width,
  }));
}

export async function expectImagesLoaded(page: Page) {
  const images = page.locator("img:visible");
  for (const image of await images.all()) {
    await image.scrollIntoViewIfNeeded();
    await expect(image).toHaveJSProperty("complete", true);
    expect(await image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
}

export async function expectControlsInBounds(page: Page) {
  const viewport = page.viewportSize()!;
  const controls = page.locator("a:visible, button:visible, input:visible, select:visible, textarea:visible");
  for (const control of await controls.all()) {
    await control.scrollIntoViewIfNeeded();
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(-0.5);
    expect(box!.y).toBeGreaterThanOrEqual(-0.5);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 0.5);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 0.5);
  }
}

export async function expectCardsAreSeparate(page: Page) {
  const cards = page.locator(CARD_SELECTOR);
  const boxes = (await Promise.all((await cards.all()).map((card) => card.boundingBox())))
    .filter((box): box is NonNullable<typeof box> => box !== null);

  await expect(cards.locator(CARD_SELECTOR)).toHaveCount(0);
  for (let left = 0; left < boxes.length; left += 1) {
    for (let right = left + 1; right < boxes.length; right += 1) {
      const a = boxes[left];
      const b = boxes[right];
      const overlaps = a.x < b.x + b.width
        && a.x + a.width > b.x
        && a.y < b.y + b.height
        && a.y + a.height > b.y;
      expect(overlaps).toBe(false);
    }
  }
}

export async function expectCardTextFits(page: Page) {
  const cards = page.locator(CARD_SELECTOR);
  for (const card of await cards.all()) {
    const cardBox = await card.boundingBox();
    if (!cardBox) continue;
    const text = card.locator("h1:visible, h2:visible, h3:visible, p:visible, button:visible, a:visible");
    for (const element of await text.all()) {
      const box = await element.boundingBox();
      if (!box) continue;
      expect(box.x).toBeGreaterThanOrEqual(cardBox.x - 0.5);
      expect(box.x + box.width).toBeLessThanOrEqual(cardBox.x + cardBox.width + 0.5);
      expect(box.y).toBeGreaterThanOrEqual(cardBox.y - 0.5);
      expect(box.y + box.height).toBeLessThanOrEqual(cardBox.y + cardBox.height + 0.5);
    }
  }
}

export async function expectFocusVisible(locator: Locator) {
  await expect(locator).toBeFocused();
  expect(await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) >= 2;
  })).toBe(true);
}
