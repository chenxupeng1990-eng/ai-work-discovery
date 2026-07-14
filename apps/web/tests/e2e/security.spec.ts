import { expect, test } from "@playwright/test";
import { findForbiddenPublicContent } from "../../scripts/public-release-patterns";
import { CATEGORY_DEFINITIONS } from "../../src/lib/categories";
import { generatedDataset } from "../fixtures/generated-dataset";

const publicRoutes = [
  "/",
  "/discover",
  "/updates",
  ...CATEGORY_DEFINITIONS.map((category) => `/category/${category.slug}`),
  ...generatedDataset.items.map((item) => `/content/${item.slug}`),
];

test("every public route responds without private release markers", async ({ request }) => {
  expect(publicRoutes).toHaveLength(3 + CATEGORY_DEFINITIONS.length + generatedDataset.items.length);

  for (const route of publicRoutes) {
    const response = await request.get(route);
    expect(response.status(), route).toBe(200);
    const body = await response.text();
    expect(findForbiddenPublicContent(body), route).toEqual([]);
  }
});
