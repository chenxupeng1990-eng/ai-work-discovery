import { describe, expect, it } from "vitest";
import { ContentItemSchema } from "../../src/lib/schema";
import { BASE_FIELDS, BASE_VALUES } from "../../scripts/feishu/fields";
import {
  mapPublishedContent,
  normalizeAttachmentSourceUrl,
  type RawFeishuRecord,
} from "../../scripts/feishu/map-records";

const CONTENT = BASE_FIELDS.content;
const COPY = BASE_FIELDS.copyBlock;

const record = (
  record_id: string,
  fields: Record<string, unknown>,
): RawFeishuRecord => ({ record_id, fields });

const publishedFields = (overrides: Record<string, unknown> = {}) => ({
  [CONTENT.title]: "公开案例",
  [CONTENT.slug]: "public-case",
  [CONTENT.type]: "Case",
  [CONTENT.category]: "团队案例",
  [CONTENT.summary]: "公开摘要",
  [CONTENT.recommendationReason]: "值得团队复用",
  [CONTENT.recommendationTrack]: "工作提效",
  [CONTENT.timeToValue]: "1 小时",
  [CONTENT.adoptionLevel]: "直接使用",
  [CONTENT.networkRequirement]: "部分资源需要 VPN",
  [CONTENT.takeaway]: "完成一套可直接复用的团队案例模板。",
  [CONTENT.coverImage]: [{ name: "cover.png", url: "https://example.com/assets/cover.png" }],
  [CONTENT.tags]: ["Codex", "飞书"],
  [CONTENT.audience]: ["研发", "运营"],
  [CONTENT.scenario]: "团队协作",
  [CONTENT.originalUrl]: { link: "https://example.com/case", text: "来源" },
  [CONTENT.feishuDocumentUrl]: "https://example.feishu.cn/wiki/public",
  [CONTENT.sourceName]: "公开来源",
  [CONTENT.featured]: true,
  [CONTENT.sortWeight]: 20,
  [CONTENT.publishedAt]: 1783900800000,
  [CONTENT.updatedAt]: "2026-07-13T12:00:00.000Z",
  [CONTENT.publicationStatus]: "已发布",
  [CONTENT.publicLevel]: BASE_VALUES.content.publicLevels.public,
  内部备注: "不得发布",
  [CONTENT.sourceInboxRecordId]: "inbox-internal-only",
  ...overrides,
});

describe("mapPublishedContent", () => {
  it("publishes only public and desensitized records", () => {
    const records = [
      record("rec-public", publishedFields()),
      record("rec-draft", publishedFields({
        [CONTENT.title]: "草稿",
        [CONTENT.publicationStatus]: "草稿",
      })),
      record("rec-forbidden", publishedFields({
        [CONTENT.title]: "禁止",
        [CONTENT.publicLevel]: BASE_VALUES.content.publicLevels.forbidden,
      })),
      record("rec-desensitized", publishedFields({
        [CONTENT.title]: "脱敏",
        [CONTENT.publicLevel]: BASE_VALUES.content.publicLevels.desensitized,
      })),
    ];

    expect(mapPublishedContent(records, []).map((item) => item.title)).toEqual(["公开案例", "脱敏"]);
  });

  it("reports missing required field names with record id", () => {
    const records = [record("rec-missing", publishedFields({ [CONTENT.title]: undefined }))];

    expect(() => mapPublishedContent(records, []))
      .toThrow(new RegExp(`rec-missing.*${CONTENT.title}|${CONTENT.title}.*rec-missing`));
  });

  it("links copy blocks by linked record id and sorts by display order", () => {
    const copyRecords = [
      record("copy-late", {
        [COPY.relatedContent]: [{ record_ids: ["rec-public"] }],
        [COPY.title]: "第二步",
        [COPY.type]: "Command",
        [COPY.language]: "shell",
        [COPY.content]: "npm test",
        [COPY.order]: 20,
      }),
      record("copy-other", {
        [COPY.relatedContent]: ["rec-other"],
        [COPY.title]: "其他内容",
        [COPY.type]: "Prompt",
        [COPY.language]: "text",
        [COPY.content]: "不会连接",
        [COPY.order]: 0,
      }),
      record("copy-first", {
        [COPY.relatedContent]: ["rec-public"],
        [COPY.title]: "第一步",
        [COPY.type]: "Configuration",
        [COPY.language]: "json",
        [COPY.content]: "{}",
        [COPY.order]: 10,
        [COPY.note]: "先配置",
      }),
    ];

    const [item] = mapPublishedContent([record("rec-public", publishedFields())], copyRecords);

    expect(item.copyBlocks.map(({ id, title, order }) => ({ id, title, order }))).toEqual([
      { id: "copy-first", title: "第一步", order: 10 },
      { id: "copy-late", title: "第二步", order: 20 },
    ]);
  });

  it("ignores copy blocks linked only to draft or unknown content", () => {
    const copyRecords = [record("copy-draft", {
      [COPY.relatedContent]: ["rec-draft"],
      [COPY.title]: "不会公开",
    })];
    const records = [
      record("rec-public", publishedFields()),
      record("rec-draft", publishedFields({ [CONTENT.publicationStatus]: "草稿" })),
    ];

    expect(mapPublishedContent(records, copyRecords)).toHaveLength(1);
  });

  it.each([
    [[{ url: "https://example.com/a.png" }], "https://example.com/a.png"],
    [[{ tmp_url: "https://example.com/b.webp" }], "https://example.com/b.webp"],
    [{ url: "https://example.com/c.jpg" }, "https://example.com/c.jpg"],
  ])("normalizes attachment source URL %#", (value, expected) => {
    expect(normalizeAttachmentSourceUrl(value)).toBe(expected);
  });

  it.each([
    "https://example.com/injected.png",
    [{ url: "javascript:alert(1)" }],
    [{ url: "http://example.com/insecure.png" }],
    [{ url: "https://user:password@example.com/private.png" }],
  ])("rejects unsafe attachment value %#", (value) => {
    expect(() => normalizeAttachmentSourceUrl(value)).toThrow(/附件/);
  });

  it("keeps only the public field allowlist", () => {
    const [item] = mapPublishedContent([record("rec-public", publishedFields())], [
      record("copy-public", {
        [COPY.relatedContent]: ["rec-public"],
        [COPY.title]: "公开区块",
        [COPY.type]: "Prompt",
        [COPY.language]: "text",
        [COPY.content]: "公开内容",
        [COPY.order]: 0,
        [COPY.sourceInboxCopyBlockKey]: "inbox-internal-only:0",
      }),
    ]);
    const serialized = JSON.stringify(item);

    expect(Object.keys(item).sort()).toEqual([
      "adoptionLevel", "audience", "category", "copyBlocks", "coverImage", "featured",
      "feishuDocumentUrl", "id", "networkRequirement", "originalUrl", "publishedAt", "recommendationReason",
      "recommendationTrack", "scenario", "slug", "sortWeight", "sourceName", "summary",
      "tags", "takeaway", "timeToValue", "title", "type", "updatedAt",
    ].sort());
    expect(serialized).not.toContain("内部备注");
    expect(serialized).not.toContain("发布状态");
    expect(serialized).not.toContain("inbox-internal-only");
    expect(serialized).not.toContain(CONTENT.sourceInboxRecordId);
    expect(serialized).not.toContain(COPY.sourceInboxCopyBlockKey);
    expect(serialized).not.toContain("inbox-internal-only:0");
    expect(ContentItemSchema.parse(item)).toEqual(item);
  });

  it("maps the public recommendation and network fields", () => {
    const [item] = mapPublishedContent([record("rec-public", publishedFields())], []);

    expect(item).toMatchObject({
      recommendationTrack: "工作提效",
      timeToValue: "1 小时",
      adoptionLevel: "直接使用",
      networkRequirement: "部分资源需要 VPN",
      takeaway: "完成一套可直接复用的团队案例模板。",
    });
  });

  it("accepts finite numeric strings returned by the Feishu number field API", () => {
    const [item] = mapPublishedContent([
      record("rec-public", publishedFields({ [CONTENT.sortWeight]: "12" })),
    ], []);

    expect(item?.sortWeight).toBe(12);
  });

  it("includes output field context when schema validation fails", () => {
    const records = [record("rec-schema", publishedFields({ [CONTENT.slug]: "not a valid slug" }))];

    expect(() => mapPublishedContent(records, []))
      .toThrow(new RegExp(`rec-schema.*${CONTENT.slug}|${CONTENT.slug}.*rec-schema`));
  });
});
