import { describe, expect, it } from "vitest";
import { ContentItemSchema } from "../../src/lib/schema";
import {
  mapPublishedContent,
  normalizeAttachmentSourceUrl,
  type RawFeishuRecord,
} from "../../scripts/feishu/map-records";

const record = (
  record_id: string,
  fields: Record<string, unknown>,
): RawFeishuRecord => ({ record_id, fields });

const publishedFields = (overrides: Record<string, unknown> = {}) => ({
  标题: "公开案例",
  Slug: "public-case",
  内容类型: "Case",
  分类: "团队案例",
  摘要: "公开摘要",
  推荐理由: "值得团队复用",
  封面图片: [{ name: "cover.png", url: "https://example.com/assets/cover.png" }],
  标签: ["Codex", "飞书"],
  适用人群: ["研发", "运营"],
  适用场景: "团队协作",
  原始链接: { link: "https://example.com/case", text: "来源" },
  飞书文档链接: "https://example.feishu.cn/wiki/public",
  来源名称: "公开来源",
  首页精选: true,
  排序权重: 20,
  发布时间: 1783900800000,
  更新时间: "2026-07-13T12:00:00.000Z",
  发布状态: "已发布",
  公开级别: "公开",
  内部备注: "不得发布",
  来源收件箱记录ID: "inbox-internal-only",
  ...overrides,
});

describe("mapPublishedContent", () => {
  it("只发布已发布且公开的记录", () => {
    const records = [
      record("rec-public", publishedFields()),
      record("rec-draft", publishedFields({ 标题: "草稿", 发布状态: "草稿" })),
      record("rec-forbidden", publishedFields({ 标题: "禁止", 公开级别: "禁止发布" })),
      record("rec-desensitized", publishedFields({ 标题: "脱敏", 公开级别: "脱敏案例" })),
    ];

    expect(mapPublishedContent(records, []).map((item) => item.title)).toEqual(["公开案例"]);
  });

  it("缺少必填字段时报告 record id 和中文字段名", () => {
    const records = [record("rec-missing", publishedFields({ 标题: undefined }))];

    expect(() => mapPublishedContent(records, [])).toThrow(/rec-missing.*标题|标题.*rec-missing/);
  });

  it("按 linked record id 连接 copy blocks 并按显示顺序排序", () => {
    const copyRecords = [
      record("copy-late", {
        关联内容: [{ record_id: "rec-public" }],
        区块标题: "第二步",
        区块类型: "Command",
        语言: "shell",
        内容: "npm test",
        显示顺序: 20,
      }),
      record("copy-other", {
        关联内容: ["rec-other"],
        区块标题: "其他内容",
        区块类型: "Prompt",
        语言: "text",
        内容: "不会连接",
        显示顺序: 0,
      }),
      record("copy-first", {
        关联内容: ["rec-public"],
        区块标题: "第一步",
        区块类型: "Configuration",
        语言: "json",
        内容: "{}",
        显示顺序: 10,
        备注: "先配置",
      }),
    ];

    const [item] = mapPublishedContent([record("rec-public", publishedFields())], copyRecords);

    expect(item.copyBlocks.map(({ id, title, order }) => ({ id, title, order }))).toEqual([
      { id: "copy-first", title: "第一步", order: 10 },
      { id: "copy-late", title: "第二步", order: 20 },
    ]);
  });

  it("忽略只关联草稿或未知内容的损坏 copy block", () => {
    const copyRecords = [record("copy-draft", {
      关联内容: ["rec-draft"],
      区块标题: "不完整草稿区块",
    })];
    const records = [
      record("rec-public", publishedFields()),
      record("rec-draft", publishedFields({ 发布状态: "草稿" })),
    ];

    expect(mapPublishedContent(records, copyRecords)).toHaveLength(1);
  });

  it.each([
    [[{ url: "https://example.com/a.png" }], "https://example.com/a.png"],
    [[{ tmp_url: "https://example.com/b.webp" }], "https://example.com/b.webp"],
    [{ url: "https://example.com/c.jpg" }, "https://example.com/c.jpg"],
  ])("结构化解析附件形态 %#", (value, expected) => {
    expect(normalizeAttachmentSourceUrl(value)).toBe(expected);
  });

  it.each([
    "https://example.com/injected.png",
    [{ url: "javascript:alert(1)" }],
    [{ url: "http://example.com/insecure.png" }],
    [{ url: "https://user:password@example.com/private.png" }],
  ])("拒绝不受控附件值 %#", (value) => {
    expect(() => normalizeAttachmentSourceUrl(value)).toThrow(/附件/);
  });

  it("忽略未知字段且不泄露发布和内部字段", () => {
    const [item] = mapPublishedContent([record("rec-public", publishedFields())], []);
    const serialized = JSON.stringify(item);

    expect(Object.keys(item).sort()).toEqual([
      "audience", "category", "copyBlocks", "coverImage", "featured", "feishuDocumentUrl",
      "id", "originalUrl", "publishedAt", "recommendationReason", "scenario", "slug",
      "sortWeight", "sourceName", "summary", "tags", "title", "type", "updatedAt",
    ].sort());
    expect(serialized).not.toContain("内部备注");
    expect(serialized).not.toContain("发布状态");
    expect(serialized).not.toContain("inbox-internal-only");
    expect(serialized).not.toContain("来源收件箱记录ID");
    expect(ContentItemSchema.parse(item)).toEqual(item);
  });

  it("schema 校验失败时包含 record id 和字段上下文", () => {
    const records = [record("rec-schema", publishedFields({ Slug: "不是合法 slug" }))];

    expect(() => mapPublishedContent(records, [])).toThrow(/rec-schema.*Slug|Slug.*rec-schema/);
  });
});
