import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { findForbiddenPublicContent } from "./public-release-patterns";

const DIST_DIRECTORY = resolve("dist");
const TEXT_EXTENSIONS = new Set([
  ".cjs", ".css", ".csv", ".htm", ".html", ".js", ".json", ".map", ".md", ".mjs",
  ".svg", ".txt", ".webmanifest", ".xhtml", ".xml", ".yaml", ".yml",
]);
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
  for (const match of findForbiddenPublicContent(content)) {
    violations.push(`${publicPath}: ${match.label} (${JSON.stringify(match.value)})`);
  }
}

if (violations.length > 0) {
  throw new Error(`Public release verification failed:\n${violations.join("\n")}`);
}

console.log(`Public release verification passed: scanned ${files.length} dist files.`);
