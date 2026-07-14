import { z } from "zod";
import type { RawFeishuRecord } from "../feishu/client";
import { BASE_FIELDS } from "../feishu/fields";

const CONTENT = BASE_FIELDS.content;
const AuditTimestampSchema = z.iso.datetime({ offset: true });
const AuditNoteSchema = z.string().trim().min(1).max(500);
const MIN_MILLISECOND_TIMESTAMP = 1_000_000_000_000;

export const ContentAuditProposalSchema = z.object({
  valueVerdict: z.enum(["高价值", "可保留", "低价值"]),
  freshnessVerdict: z.enum(["当前有效", "需复核", "已过时", "无法确认"]),
  factualVerdict: z.enum(["符合当前实际", "存在偏差", "无法确认"]),
  auditDecision: z.enum(["通过", "更新后复核", "下架", "待审核"]),
  auditNote: AuditNoteSchema,
  auditedAt: AuditTimestampSchema,
  nextReviewAt: AuditTimestampSchema,
}).strict();

export class ContentAuditError extends Error {
  readonly recordIds: readonly string[];

  constructor(recordIds: readonly string[]) {
    super(recordIds.join(","));
    this.name = "ContentAuditError";
    this.recordIds = recordIds;
  }
}

export function assertReleaseAudits(records: readonly RawFeishuRecord[], now: Date): void {
  const invalidRecordIds = records
    .filter(({ fields }) => fields[CONTENT.publicationStatus] === "已发布")
    .filter((record) => !isApprovedReleaseAudit(record, now))
    .map(({ record_id }) => record_id);

  if (invalidRecordIds.length > 0) throw new ContentAuditError(invalidRecordIds);
}

function isApprovedReleaseAudit(record: RawFeishuRecord, now: Date): boolean {
  const fields = record.fields;
  const auditedAt = parseAuditTimestamp(fields[CONTENT.auditedAt]);
  const nextReviewAt = fields[CONTENT.nextReviewAt];
  const nextReviewTimestamp = parseAuditTimestamp(nextReviewAt);

  return (
    (fields[CONTENT.valueVerdict] === "高价值" || fields[CONTENT.valueVerdict] === "可保留")
    && fields[CONTENT.freshnessVerdict] === "当前有效"
    && fields[CONTENT.factualVerdict] === "符合当前实际"
    && fields[CONTENT.auditDecision] === "通过"
    && AuditNoteSchema.safeParse(fields[CONTENT.auditNote]).success
    && auditedAt !== null
    && nextReviewTimestamp !== null
    && nextReviewTimestamp > now.getTime()
  );
}

function parseAuditTimestamp(value: unknown): number | null {
  if (typeof value === "number") {
    if (
      !Number.isFinite(value)
      || !Number.isSafeInteger(value)
      || value < MIN_MILLISECOND_TIMESTAMP
    ) return null;

    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  if (typeof value !== "string" || !AuditTimestampSchema.safeParse(value).success) return null;

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}
