import { describe, expect, it } from "vitest";
import { findForbiddenPublicContent } from "../../scripts/public-release-patterns";

const leakingSamples = [
  ["field: 原始内容", '{"原始内容":"private"}'],
  ["field: 原始内容", '{"Raw Content":"private"}'],
  ["field: 原始内容", '{"rawContent":"private"}'],
  ["field: 发布状态", '{"发布状态":"已发布"}'],
  ["field: 发布状态", "{ publicationStatus: 'published' }"],
  ["field: 发布状态", '{"isDraft":false}'],
  ["field: 公开级别", '<dt>公开级别</dt><dd>公开</dd>'],
  ["field: 公开级别", '{"publicLevel":"公开"}'],
  ["field: 处理状态", '<span aria-label="处理状态">公开信息</span>'],
  ["field: 处理状态", '{"processingStatus":"done"}'],
  ["field: 关联草稿内容", '{"关联草稿内容":["rec-1"]}'],
  ["field: 关联草稿内容", '{\"relatedDraftContent\":[\"rec-1\"]}'],
  ["field: 来源收件箱记录ID", '{"来源收件箱记录ID":"rec-1"}'],
  ["field: 来源收件箱记录ID", '{"sourceInboxRecordId":"rec-1"}'],
  ["field: 来源收件箱复制块键", '<label>来源收件箱复制块键</label>'],
  ["field: 来源收件箱复制块键", '{"sourceInboxCopyBlockKey":"rec-1:0"}'],
  ["status: 草稿", '{"status":"草稿"}'],
  ["status: 草稿", String.raw`const payload = "{\"status\":\"草稿\"}";`],
  ["status: 禁止发布", '<div data-status="禁止发布"></div>'],
  ["status: 待处理", '<span class="status">待处理</span>'],
  ["status: 处理中", '{"processing":"处理中"}'],
  ["status: 待审核", '<strong data-state="待审核">待审核</strong>'],
  ["status: 失败", '<span class="status-label">失败</span>'],
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
  it.each(leakingSamples)("reports %s", (label, content) => {
    expect(findForbiddenPublicContent(content).map((match) => match.label)).toContain(label);
  });

  it.each([
    "Draft",
    "drafting the rollout plan",
    "Drafting is part of the editorial workflow.",
    "这是一篇失败复盘，记录公开经验。",
    '{"title":"失败复盘"}',
    '<p>项目处理中学到的经验</p>',
    "FEISHU_APP_IDEA",
    "preauthorization notes",
  ])("does not report legitimate public text: %s", (content) => {
    expect(findForbiddenPublicContent(content)).toEqual([]);
  });
});
