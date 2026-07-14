import { PRIVATE_BASE_FIELD_NAMES } from "./feishu/fields";

export interface ForbiddenPublicPattern {
  label: string;
  pattern: RegExp;
}

export interface ForbiddenPublicMatch {
  label: string;
  value: string;
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function fieldPattern(key: string, label: string): ForbiddenPublicPattern {
  const names = [key, label].map(escapeRegExp).join("|");
  const objectKey = `(?:["'](?:${names})["']|(?<![\\p{L}\\p{N}_$])(?:${names})(?![\\p{L}\\p{N}_$]))\\s*:`;
  const htmlAttribute = `(?:aria-label|data-label)\\s*=\\s*["']\\s*(?:${names})\\s*["']`;
  const htmlLabel = `<(?:label|dt|th|legend|span|strong)\\b[^>]*>\\s*(?:${names})\\s*</(?:label|dt|th|legend|span|strong)>`;
  return { label: `field: ${label}`, pattern: new RegExp(`${objectKey}|${htmlAttribute}|${htmlLabel}`, "iu") };
}

const STATUS_FIELD_NAMES = ["发布状态", "publicationStatus", "处理状态", "processingStatus", "公开级别", "publicLevel"] as const;
const STATUS_DATA_ATTRIBUTES = ["data-publication-status", "data-processing-status", "data-public-level"] as const;

function statusPattern(status: string): ForbiddenPublicPattern {
  const value = escapeRegExp(status);
  const keys = STATUS_FIELD_NAMES.map(escapeRegExp).join("|");
  const attributes = STATUS_DATA_ATTRIBUTES.map(escapeRegExp).join("|");
  const structuredValue = `(?:["'](?:${keys})["']|(?<![\\p{L}\\p{N}_$])(?:${keys})(?![\\p{L}\\p{N}_$]))\\s*:\\s*["']${value}["']`;
  const htmlAttribute = `(?:${attributes})\\s*=\\s*["']\\s*${value}\\s*["']`;
  return { label: `status: ${status}`, pattern: new RegExp(`${structuredValue}|${htmlAttribute}`, "iu") };
}

function secretPattern(identifier: string): ForbiddenPublicPattern {
  return {
    label: `secret: ${identifier}`,
    pattern: new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(identifier)}(?![\\p{L}\\p{N}_])`, "iu"),
  };
}

const privateFieldPatterns = Object.values(PRIVATE_BASE_FIELD_NAMES).flatMap((group) =>
  Object.entries(group).map(([key, label]) => fieldPattern(key, label)),
);

export const FORBIDDEN_PUBLIC_PATTERNS: readonly ForbiddenPublicPattern[] = [
  ...privateFieldPatterns,
  ...["草稿", "禁止发布", "待处理", "处理中", "待审核", "失败"].map(statusPattern),
  ...[
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
    ".env",
  ].map(secretPattern),
];

export function findForbiddenPublicContent(content: string): ForbiddenPublicMatch[] {
  const candidates = [
    content,
    content.replaceAll('\\"', '"').replaceAll("\\'", "'"),
    content.replaceAll(/&quot;|&#34;|&#x22;/gi, '"').replaceAll(/&#39;|&#x27;/gi, "'"),
  ];

  return FORBIDDEN_PUBLIC_PATTERNS.flatMap(({ label, pattern }) => {
    const match = candidates.map((candidate) => pattern.exec(candidate)).find(Boolean);
    return match ? [{ label, value: match[0] }] : [];
  });
}
