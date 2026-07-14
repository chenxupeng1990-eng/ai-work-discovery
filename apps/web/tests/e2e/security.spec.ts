import { expect, test } from "@playwright/test";
import { findForbiddenPublicContent } from "../../scripts/public-release-patterns";
import { generatedDataset } from "../fixtures/generated-dataset";

const publicRoutes = [
  "/",
  "/discover",
  "/updates",
  ...generatedDataset.items.map((item) => `/content/${item.slug}`),
];

test("every public route responds without private release markers", async ({ request }) => {
  expect(publicRoutes).toHaveLength(13);

  for (const route of publicRoutes) {
    const response = await request.get(route);
    expect(response.status(), route).toBe(200);
    const body = await response.text();
    expect(findForbiddenPublicContent(body), route).toEqual([]);
  }
});
