import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

const DIST_DIRECTORY = resolve("dist");
const TEXT_EXTENSIONS = new Set([".cjs", ".css", ".html", ".js", ".json", ".mjs", ".svg", ".txt", ".xml"]);
const FORBIDDEN_CONTENT = [
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
const FORBIDDEN_PATHS = [
  /(^|[/\\])\.env(?:\.|$)/i,
  /\.map$/i,
  /\.lock(?:\.|$)/i,
  /(^|[/\\])(?:playwright-report|test-results)([/\\]|$)/i,
  /(?:^|[/\\]).*\.tmp(?:\.|$)/i,
  /(?:^|[/\\])(?:package-lock|npm-shrinkwrap|yarn\.lock|pnpm-lock\.yaml)$/i,
] as const;

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  }));
  return files.flat();
}

const files = await listFiles(DIST_DIRECTORY);
const violations: string[] = [];

for (const file of files) {
  const publicPath = relative(DIST_DIRECTORY, file);
  if (FORBIDDEN_PATHS.some((pattern) => pattern.test(publicPath))) {
    violations.push(`${publicPath}: forbidden release artifact`);
  }
  if (!TEXT_EXTENSIONS.has(extname(file).toLowerCase())) continue;

  const content = await readFile(file, "utf8");
  for (const forbidden of FORBIDDEN_CONTENT) {
    if (content.includes(forbidden)) violations.push(`${publicPath}: contains ${forbidden}`);
  }
}

if (violations.length > 0) {
  throw new Error(`Public release verification failed:\n${violations.join("\n")}`);
}

console.log(`Public release verification passed: scanned ${files.length} dist files.`);
