import { basename, extname } from "node:path";
import { ContentItemSchema, type ContentItem, type CopyBlock } from "../../src/lib/schema";
import { BASE_FIELDS, BASE_VALUES } from "./fields";
import type { RawFeishuRecord } from "./client";

export type { RawFeishuRecord } from "./client";

const CONTENT = BASE_FIELDS.content;
const COPY = BASE_FIELDS.copyBlock;
const PUBLIC_LEVELS = BASE_VALUES.content.publicLevels;
const PUBLISHABLE_PUBLIC_LEVELS = [PUBLIC_LEVELS.public, PUBLIC_LEVELS.desensitized] as const;

const OUTPUT_TO_BASE_FIELD: Partial<Record<keyof ContentItem, string>> = {
  slug: CONTENT.slug,
  title: CONTENT.title,
  type: CONTENT.type,
  category: CONTENT.category,
  summary: CONTENT.summary,
  recommendationReason: CONTENT.recommendationReason,
  coverImage: CONTENT.coverImage,
  tags: CONTENT.tags,
  audience: CONTENT.audience,
  scenario: CONTENT.scenario,
  originalUrl: CONTENT.originalUrl,
  feishuDocumentUrl: CONTENT.feishuDocumentUrl,
  sourceName: CONTENT.sourceName,
  featured: CONTENT.featured,
  sortWeight: CONTENT.sortWeight,
  publishedAt: CONTENT.publishedAt,
  updatedAt: CONTENT.updatedAt,
  copyBlocks: COPY.relatedContent,
};

export function mapPublishedContent(
  records: RawFeishuRecord[],
  copyRecords: RawFeishuRecord[],
): ContentItem[] {
  const publishedRecords = records.filter(({ fields }) => (
    fields[CONTENT.publicationStatus] === "已发布"
    && PUBLISHABLE_PUBLIC_LEVELS.includes(
      fields[CONTENT.publicLevel] as typeof PUBLISHABLE_PUBLIC_LEVELS[number],
    )
  ));
  const publishedIds = new Set(publishedRecords.map(({ record_id }) => record_id));
  const copiesByContentId = groupCopyBlocks(copyRecords, publishedIds);

  return publishedRecords
    .map((record) => mapContentRecord(record, copiesByContentId.get(record.record_id) ?? []));
}

export function normalizeAttachmentSourceUrl(value: unknown): string {
  const attachment = Array.isArray(value) ? value[0] : value;
  if (typeof attachment !== "object" || attachment === null || Array.isArray(attachment)) {
    throw new Error("附件必须是结构化对象");
  }

  const source = attachment as Record<string, unknown>;
  const rawUrl = typeof source.url === "string"
    ? source.url
    : typeof source.tmp_url === "string"
      ? source.tmp_url
      : undefined;
  if (!rawUrl) throw new Error("附件缺少 URL");

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("附件 URL 无效");
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("附件 URL 必须是无凭据的 HTTPS 地址");
  }
  return url.toString();
}

function mapContentRecord(record: RawFeishuRecord, copyBlocks: CopyBlock[]): ContentItem {
  const fields = record.fields;
  let coverSource: string;
  try {
    coverSource = normalizeAttachmentSourceUrl(requireValue(record, CONTENT.coverImage));
  } catch (error) {
    throw fieldError(record.record_id, CONTENT.coverImage, error);
  }

  const candidate = {
    id: record.record_id,
    slug: requireString(record, CONTENT.slug),
    title: requireString(record, CONTENT.title),
    type: requireString(record, CONTENT.type),
    category: requireString(record, CONTENT.category),
    summary: requireString(record, CONTENT.summary),
    recommendationReason: requireString(record, CONTENT.recommendationReason),
    coverImage: targetAssetPath(record.record_id, fields[CONTENT.coverImage], coverSource),
    tags: stringList(fields[CONTENT.tags], record.record_id, CONTENT.tags),
    audience: stringList(fields[CONTENT.audience], record.record_id, CONTENT.audience),
    scenario: requireString(record, CONTENT.scenario),
    originalUrl: optionalHttpsUrl(fields[CONTENT.originalUrl], record.record_id, CONTENT.originalUrl),
    feishuDocumentUrl: optionalHttpsUrl(
      fields[CONTENT.feishuDocumentUrl],
      record.record_id,
      CONTENT.feishuDocumentUrl,
    ),
    sourceName: requireString(record, CONTENT.sourceName),
    featured: requireBoolean(record, CONTENT.featured),
    sortWeight: requireNumber(record, CONTENT.sortWeight),
    publishedAt: requireDate(record, CONTENT.publishedAt),
    updatedAt: requireDate(record, CONTENT.updatedAt),
    copyBlocks,
  };

  const result = ContentItemSchema.safeParse(candidate);
  if (!result.success) {
    const issue = result.error.issues[0];
    const outputField = String(issue?.path[0] ?? "record");
    const baseField = OUTPUT_TO_BASE_FIELD[outputField as keyof ContentItem] ?? outputField;
    throw new Error(`记录 ${record.record_id} 的字段 ${baseField} 校验失败: ${issue?.message ?? "未知错误"}`);
  }
  return result.data;
}

function groupCopyBlocks(
  records: RawFeishuRecord[],
  publishedIds: ReadonlySet<string>,
): Map<string, CopyBlock[]> {
  const grouped = new Map<string, CopyBlock[]>();
  for (const record of records) {
    const linkedIds = linkedRecordIds(record.fields[COPY.relatedContent])
      .filter((recordId) => publishedIds.has(recordId));
    if (linkedIds.length === 0) continue;
    const block = mapCopyBlock(record);
    for (const linkedId of linkedIds) {
      const blocks = grouped.get(linkedId) ?? [];
      blocks.push(block);
      grouped.set(linkedId, blocks);
    }
  }
  for (const blocks of grouped.values()) {
    blocks.sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  }
  return grouped;
}

function mapCopyBlock(record: RawFeishuRecord): CopyBlock {
  return {
    id: record.record_id,
    title: requireString(record, COPY.title),
    type: requireString(record, COPY.type) as CopyBlock["type"],
    language: requireString(record, COPY.language),
    content: requireString(record, COPY.content),
    order: requireNumber(record, COPY.order),
    note: optionalString(record.fields[COPY.note], record.record_id, COPY.note),
  };
}

function linkedRecordIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === "string" && entry) return [entry];
    if (typeof entry === "object" && entry !== null && !Array.isArray(entry)) {
      const recordId = (entry as Record<string, unknown>).record_id;
      return typeof recordId === "string" && recordId ? [recordId] : [];
    }
    return [];
  });
}

function requireValue(record: RawFeishuRecord, field: string): unknown {
  const value = record.fields[field];
  if (value === undefined || value === null || value === "") {
    throw fieldError(record.record_id, field, "缺少必填值");
  }
  return value;
}

function requireString(record: RawFeishuRecord, field: string): string {
  const value = requireValue(record, field);
  if (typeof value !== "string" || !value.trim()) throw fieldError(record.record_id, field, "必须是字符串");
  return value.trim();
}

function optionalString(value: unknown, recordId: string, field: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw fieldError(recordId, field, "必须是字符串");
  return value.trim() || undefined;
}

function requireBoolean(record: RawFeishuRecord, field: string): boolean {
  const value = requireValue(record, field);
  if (typeof value !== "boolean") throw fieldError(record.record_id, field, "必须是布尔值");
  return value;
}

function requireNumber(record: RawFeishuRecord, field: string): number {
  const value = requireValue(record, field);
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw fieldError(record.record_id, field, "必须是有限数字");
  }
  return value;
}

function requireDate(record: RawFeishuRecord, field: string): string {
  const value = requireValue(record, field);
  const date = typeof value === "number" || typeof value === "string" ? new Date(value) : undefined;
  if (!date || Number.isNaN(date.getTime())) throw fieldError(record.record_id, field, "必须是有效日期");
  return date.toISOString();
}

function stringList(value: unknown, recordId: string, field: string): string[] {
  if (!Array.isArray(value)) throw fieldError(recordId, field, "必须是字符串数组");
  return value.map((entry) => {
    if (typeof entry === "string" && entry.trim()) return entry.trim();
    if (typeof entry === "object" && entry !== null && !Array.isArray(entry)) {
      const name = (entry as Record<string, unknown>).name;
      if (typeof name === "string" && name.trim()) return name.trim();
    }
    throw fieldError(recordId, field, "包含无效选项");
  });
}

function optionalHttpsUrl(value: unknown, recordId: string, field: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const raw = typeof value === "string"
    ? value
    : typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>).link
      : undefined;
  if (typeof raw !== "string") throw fieldError(recordId, field, "必须是链接");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw fieldError(recordId, field, "链接无效");
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw fieldError(recordId, field, "必须是无凭据的 HTTPS 链接");
  }
  return url.toString();
}

function targetAssetPath(recordId: string, attachmentValue: unknown, sourceUrl: string): string {
  const attachment = Array.isArray(attachmentValue) ? attachmentValue[0] : attachmentValue;
  const source = attachment as Record<string, unknown>;
  const sourceName = typeof source.name === "string" ? source.name : basename(new URL(sourceUrl).pathname);
  const extension = extname(sourceName).toLowerCase();
  const safeExtension = /^\.(?:avif|gif|jpe?g|png|webp)$/.test(extension) ? extension : ".webp";
  const stem = basename(sourceName, extension)
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "cover";
  const safeRecordId = recordId.replace(/[^A-Za-z0-9._-]+/g, "-") || "record";
  return `/images/content/${safeRecordId}/${stem}${safeExtension}`;
}

function fieldError(recordId: string, field: string, reason: unknown): Error {
  const message = reason instanceof Error ? reason.message : String(reason);
  return new Error(`记录 ${recordId} 的字段 ${field} 无效: ${message}`);
}
