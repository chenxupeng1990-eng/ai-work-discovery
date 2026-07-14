export interface ForbiddenPublicPattern {
  label: string;
  pattern: RegExp;
}

export interface ForbiddenPublicMatch {
  label: string;
  value: string;
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function fieldPattern(label: string, aliases: readonly string[]): ForbiddenPublicPattern {
  const names = aliases.map(escapeRegExp).join("|");
  const quotedOrObjectKey = `(?:["'](?:${names})["']|(?<![\\p{L}\\p{N}_$])(?:${names})(?![\\p{L}\\p{N}_$]))\\s*:`;
  const htmlAttribute = `(?:aria-label|data-label|title)\\s*=\\s*["']\\s*(?:${names})\\s*["']`;
  const htmlLabel = `<(?:label|dt|th|legend|span|div|p|strong)\\b[^>]*>\\s*(?:${names})\\s*</(?:label|dt|th|legend|span|div|p|strong)>`;
  return { label: `field: ${label}`, pattern: new RegExp(`${quotedOrObjectKey}|${htmlAttribute}|${htmlLabel}`, "iu") };
}

function statusPattern(status: string): ForbiddenPublicPattern {
  const value = escapeRegExp(status);
  const structuredValue = `(?:["'][^"']+["']|(?<![\\p{L}\\p{N}_$])[\\p{L}_$][\\p{L}\\p{N}_$]*)(?:\\s*)?:(?:\\s*)?["']${value}["']`;
  const htmlAttribute = `(?:data-status|data-state|status|state|aria-label)\\s*=\\s*["']\\s*${value}\\s*["']`;
  const standaloneLabel = `<(?:span|strong|em|div|p|li|dd)\\b[^>]*>\\s*${value}\\s*</(?:span|strong|em|div|p|li|dd)>`;
  return { label: `status: ${status}`, pattern: new RegExp(`${structuredValue}|${htmlAttribute}|${standaloneLabel}`, "u") };
}

function secretPattern(identifier: string): ForbiddenPublicPattern {
  return {
    label: `secret: ${identifier}`,
    pattern: new RegExp(`(?<![A-Z0-9_])${escapeRegExp(identifier)}(?![A-Z0-9_])`, "i"),
  };
}

export const FORBIDDEN_PUBLIC_PATTERNS: readonly ForbiddenPublicPattern[] = [
  fieldPattern("原始内容", ["原始内容", "Raw Content", "rawContent"]),
  fieldPattern("发布状态", ["发布状态", "publicationStatus", "isDraft"]),
  fieldPattern("公开级别", ["公开级别", "publicLevel"]),
  fieldPattern("处理状态", ["处理状态", "processingStatus"]),
  fieldPattern("关联草稿内容", ["关联草稿内容", "relatedDraftContent"]),
  fieldPattern("来源收件箱记录ID", ["来源收件箱记录ID", "sourceInboxRecordId"]),
  fieldPattern("来源收件箱复制块键", ["来源收件箱复制块键", "sourceInboxCopyBlockKey"]),
  statusPattern("草稿"),
  statusPattern("禁止发布"),
  statusPattern("待处理"),
  statusPattern("处理中"),
  statusPattern("待审核"),
  statusPattern("失败"),
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
