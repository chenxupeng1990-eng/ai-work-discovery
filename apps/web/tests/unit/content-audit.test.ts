import { describe, expect, it } from "vitest";
import type { RawFeishuRecord } from "../../scripts/feishu/client";
import { BASE_FIELDS } from "../../scripts/feishu/fields";
import {
  ContentAuditError,
  ContentAuditProposalSchema,
  assertReleaseAudits,
} from "../../scripts/audit/content-audit";

const CONTENT = BASE_FIELDS.content;
const NOW = new Date("2026-07-14T08:00:00.000Z");
const AUDIT_FIELDS = [
  CONTENT.valueVerdict,
  CONTENT.freshnessVerdict,
  CONTENT.factualVerdict,
  CONTENT.auditDecision,
  CONTENT.auditNote,
  CONTENT.auditedAt,
  CONTENT.nextReviewAt,
] as const;
const AUDIT_TIMESTAMP_FIELDS = [CONTENT.auditedAt, CONTENT.nextReviewAt] as const;
const VALID_AUDITED_AT = Date.parse("2026-07-14T07:00:00.000Z");
const VALID_NEXT_REVIEW_AT = Date.parse("2026-07-21T08:00:00.000Z");
const INVALID_FEISHU_DATETIMES = [
  ["seconds", Math.floor(VALID_NEXT_REVIEW_AT / 1_000)],
  ["zero", 0],
  ["negative", -1],
  ["fractional", VALID_NEXT_REVIEW_AT + 0.5],
  ["NaN", Number.NaN],
  ["Infinity", Number.POSITIVE_INFINITY],
  ["unsafe integer", Number.MAX_SAFE_INTEGER + 1],
  ["date overflow", 8_640_000_000_000_001],
] as const;

function record(record_id: string, fields: Record<string, unknown>): RawFeishuRecord {
  return { record_id, fields };
}

function approvedPublishedRecord(overrides: Record<string, unknown> = {}): RawFeishuRecord {
  return record("rec-published", {
    [CONTENT.publicationStatus]: "已发布",
    [CONTENT.valueVerdict]: "高价值",
    [CONTENT.freshnessVerdict]: "当前有效",
    [CONTENT.factualVerdict]: "符合当前实际",
    [CONTENT.auditDecision]: "通过",
    [CONTENT.auditNote]: "已按当前官方来源完成核验。",
    [CONTENT.auditedAt]: "2026-07-14T07:00:00.000Z",
    [CONTENT.nextReviewAt]: "2026-07-21T08:00:00.000Z",
    ...overrides,
  });
}

describe("ContentAuditProposalSchema", () => {
  it("accepts a complete approved audit proposal", () => {
    expect(ContentAuditProposalSchema.parse({
      valueVerdict: "可保留",
      freshnessVerdict: "当前有效",
      factualVerdict: "符合当前实际",
      auditDecision: "通过",
      auditNote: "已按当前官方来源完成核验。",
      auditedAt: "2026-07-14T07:00:00.000Z",
      nextReviewAt: "2026-08-14T08:00:00.000Z",
    })).toMatchObject({ auditDecision: "通过" });
  });
  it.each(["", " \t\n", "a".repeat(501)])("rejects invalid audit notes", (auditNote) => {
    expect(ContentAuditProposalSchema.shape.auditNote.safeParse(auditNote).success).toBe(false);
  });
});

describe("assertReleaseAudits", () => {
  it("permits only complete current approved published records", () => {
    expect(() => assertReleaseAudits([approvedPublishedRecord()], NOW)).not.toThrow();
  });

  it("accepts Feishu Base datetime fields returned as millisecond timestamps", () => {
    expect(() => assertReleaseAudits([approvedPublishedRecord({
      [CONTENT.auditedAt]: VALID_AUDITED_AT,
      [CONTENT.nextReviewAt]: VALID_NEXT_REVIEW_AT,
    })], NOW)).not.toThrow();
  });

  it.each(AUDIT_FIELDS)("blocks a published record missing %s", (fieldName) => {
    const fields = approvedPublishedRecord().fields;
    delete fields[fieldName];

    expect(() => assertReleaseAudits([record("rec-published", fields)], NOW))
      .toThrow(ContentAuditError);
  });

  it.each([
    ["expired freshness", { [CONTENT.freshnessVerdict]: "已过时" }],
    ["unverifiable freshness", { [CONTENT.freshnessVerdict]: "无法确认" }],
    ["unverifiable facts", { [CONTENT.factualVerdict]: "无法确认" }],
    ["non-passing decision", { [CONTENT.auditDecision]: "待审核" }],
    ["invalid audited timestamp", { [CONTENT.auditedAt]: "not-a-date" }],
    ["invalid next review timestamp", { [CONTENT.nextReviewAt]: "not-a-date" }],
    ["future audited timestamp", { [CONTENT.auditedAt]: "2026-07-14T09:00:00.000Z" }],
    ["due next review timestamp", { [CONTENT.nextReviewAt]: NOW.toISOString() }],
    ["next review before audit", {
      [CONTENT.auditedAt]: "2026-07-15T09:00:00.000Z",
      [CONTENT.nextReviewAt]: "2026-07-15T08:00:00.000Z",
    }],
  ])("blocks a published record with %s", (_label, overrides) => {
    expect(() => assertReleaseAudits([approvedPublishedRecord(overrides)], NOW))
      .toThrow(ContentAuditError);
  });

  it.each(AUDIT_TIMESTAMP_FIELDS.flatMap((fieldName) =>
    INVALID_FEISHU_DATETIMES.map(([label, value]) => [fieldName, label, value] as const)
  ))("blocks a published record with invalid %s value (%s)", (fieldName, _label, value) => {
    expect(() => assertReleaseAudits([approvedPublishedRecord({ [fieldName]: value })], NOW))
      .toThrow(ContentAuditError);
  });

  it("ignores draft and removed records without audit fields", () => {
    expect(() => assertReleaseAudits([
      approvedPublishedRecord({ [CONTENT.publicationStatus]: "草稿" }),
      record("rec-removed", { [CONTENT.publicationStatus]: "已下架" }),
    ], NOW)).not.toThrow();
  });

  it("reports only failed record ids without audit values or URLs", () => {
    const unsafeUrl = "https://user:password@example.com/private";
    let thrown: unknown;

    try {
      assertReleaseAudits([
        approvedPublishedRecord({
          [CONTENT.auditNote]: unsafeUrl,
          [CONTENT.nextReviewAt]: unsafeUrl,
        }),
        record("rec-second", {
          [CONTENT.publicationStatus]: "已发布",
          [CONTENT.auditNote]: unsafeUrl,
        }),
      ], NOW);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ContentAuditError);
    expect((thrown as ContentAuditError).recordIds).toEqual(["rec-published", "rec-second"]);
    expect((thrown as Error).message).toBe("rec-published,rec-second");
    expect((thrown as Error).message).not.toContain(unsafeUrl);
  });
});
