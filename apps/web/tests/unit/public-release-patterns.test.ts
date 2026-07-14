import { describe, expect, it } from "vitest";
import { PRIVATE_BASE_FIELD_NAMES } from "../../scripts/feishu/fields";
import { findForbiddenPublicContent } from "../../scripts/public-release-patterns";
import { listTrackedPublicTextArtifacts } from "../../scripts/verify-public";

const privateFields = Object.values(PRIVATE_BASE_FIELD_NAMES).flatMap((group) => Object.entries(group));

const fieldLeaks = privateFields.flatMap(([key, label]) => [
  [`field: ${label}`, JSON.stringify({ [key]: "private" })],
  [`field: ${label}`, `{ ${key}: "private" }`],
  [`field: ${label}`, String.raw`const payload = "{\"${key}\":\"private\"}";`],
  [`field: ${label}`, `<dt>${label}</dt>`],
] as const);

const statusValues = ["草稿", "禁止发布", "待处理", "处理中", "待审核", "失败"] as const;
const statusKeys = ["发布状态", "publicationStatus", "处理状态", "processingStatus", "公开级别", "publicLevel"] as const;
const statusAttributes = ["data-publication-status", "data-processing-status", "data-public-level"] as const;

const statusLeaks = statusValues.flatMap((status) => [
  ...statusKeys.map((key) => [`status: ${status}`, JSON.stringify({ [key]: status })] as const),
  ...statusAttributes.map((attribute) => [`status: ${status}`, `<div ${attribute}="${status}"></div>`] as const),
]);

const secretLeaks = [
  ["secret: FEISHU_APP_ID", "window.feishu_app_id = 'leaked'"],
  ["secret: FEISHU_APP_SECRET", "FEISHU_APP_SECRET=leaked"],
  ["secret: FEISHU_BASE_APP_TOKEN", "feishu_base_app_token=leaked"],
  ["secret: FEISHU_CONTENT_TABLE_ID", "FEISHU_CONTENT_TABLE_ID=leaked"],
  ["secret: FEISHU_COPY_BLOCKS_TABLE_ID", "FEISHU_COPY_BLOCKS_TABLE_ID=leaked"],
  ["secret: FEISHU_INBOX_TABLE_ID", "FEISHU_INBOX_TABLE_ID=leaked"],
  ["secret: AI_BASE_URL", "AI_BASE_URL=https://private.example"],
  ["secret: AI_API_KEY", "const value = 'Ai_Api_Key'"],
  ["secret: AI_MODEL", "ai_model=private"],
  ["secret: Authorization", "authorization: Bearer leaked"],
  ["secret: .env", "assets/.ENV.production"],
] as const;

describe("findForbiddenPublicContent", () => {
  it.each(fieldLeaks)("reports %s from %s", (label, content) => {
    expect(findForbiddenPublicContent(content).map((match) => match.label)).toContain(label);
  });

  it.each(statusLeaks)("reports %s from %s", (label, content) => {
    expect(findForbiddenPublicContent(content).map((match) => match.label)).toContain(label);
  });

  it.each(secretLeaks)("reports %s", (label, content) => {
    expect(findForbiddenPublicContent(content).map((match) => match.label)).toContain(label);
  });

  it.each([
    "Draft",
    "drafting the rollout plan",
    "Drafting is part of the editorial workflow.",
    '{"title":"失败"}',
    '{"summary":"草稿"}',
    '{"content":"待处理"}',
    '<span class="status">处理中</span>',
    '<strong data-state="待审核">待审核</strong>',
    "这是一篇失败复盘，记录公开经验。",
    '<p>项目处理中学到的经验</p>',
    '{"title":"公开标题","summary":"公开摘要","content":"公开 copy content"}',
    "FEISHU_APP_IDEA",
    "preauthorization notes",
  ])("does not report legitimate public text: %s", (content) => {
    expect(findForbiddenPublicContent(content)).toEqual([]);
  });
});

describe("listTrackedPublicTextArtifacts", () => {
  it("uses the Git index and only returns text artifacts from public data roots", async () => {
    const files = await listTrackedPublicTextArtifacts();

    expect(files).toContain("apps/web/src/generated/content.json");
    expect(files).not.toContain("apps/web/scripts/feishu/fields.ts");
    expect(files.every((file) => file.startsWith("apps/web/src/generated/") || file.startsWith("apps/web/public/"))).toBe(true);
  });
});
