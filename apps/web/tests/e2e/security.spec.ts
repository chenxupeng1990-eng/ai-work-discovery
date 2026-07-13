import { expect, test } from "@playwright/test";
import { generatedDataset } from "../fixtures/generated-dataset";

const forbiddenMarkers = [
  "FEISHU_APP_ID",
  "FEISHU_APP_SECRET",
  "FEISHU_BASE_APP_TOKEN",
  "FEISHU_CONTENT_TABLE_ID",
  "FEISHU_COPY_BLOCKS_TABLE_ID",
  "FEISHU_INBOX_TABLE_ID",
  "AI_BASE_URL",
  "AI_API_KEY",
  "AI_MODEL",
  "Authorization",
  "Raw Content",
  ".env",
  "draft",
  "草稿",
  "禁止发布",
  "来源收件箱记录ID",
  "来源收件箱复制块键",
  "待处理",
  "处理中",
  "sourceInboxRecordId",
  "sourceInboxCopyBlockKey",
  "processingStatus",
  "rawContent",
  "isDraft",
] as const;

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
    for (const forbidden of forbiddenMarkers) {
      expect(body, `${route} contains ${forbidden}`).not.toContain(forbidden);
    }
  }
});
