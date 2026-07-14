import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { findForbiddenPublicContent } from "./public-release-patterns";

const execFileAsync = promisify(execFile);
const APP_DIRECTORY = resolve(".");
const DIST_DIRECTORY = join(APP_DIRECTORY, "dist");
export const PUBLIC_ARTIFACT_ROOTS = ["apps/web/src/generated", "apps/web/public"] as const;
export const PUBLIC_TEXT_EXTENSIONS = new Set([
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

async function findRepositoryRoot(): Promise<string> {
  const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], { cwd: APP_DIRECTORY });
  return stdout.trim();
}

export async function listTrackedPublicTextArtifacts(repositoryRoot?: string): Promise<string[]> {
  const root = repositoryRoot ?? await findRepositoryRoot();
  const { stdout } = await execFileAsync("git", ["ls-files", "--", ...PUBLIC_ARTIFACT_ROOTS], { cwd: root });
  return stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((file) => PUBLIC_TEXT_EXTENSIONS.has(extname(file).toLowerCase()));
}

export async function verifyPublicRelease(): Promise<void> {
  const repositoryRoot = await findRepositoryRoot();
  const distFiles = await listFiles(DIST_DIRECTORY);
  const trackedArtifacts = await listTrackedPublicTextArtifacts(repositoryRoot);
  const violations: string[] = [];

  const scanFile = async (file: string, publicPath: string) => {
    if (FORBIDDEN_PATHS.some((pattern) => pattern.test(publicPath))) {
      violations.push(`${publicPath}: forbidden release artifact`);
    }
    if (!PUBLIC_TEXT_EXTENSIONS.has(extname(file).toLowerCase())) return;

    const content = await readFile(file, "utf8");
    for (const match of findForbiddenPublicContent(content)) {
      violations.push(`${publicPath}: ${match.label} (${JSON.stringify(match.value)})`);
    }
  };

  for (const file of distFiles) {
    await scanFile(file, `dist/${relative(DIST_DIRECTORY, file).replaceAll("\\", "/")}`);
  }
  for (const publicPath of trackedArtifacts) {
    await scanFile(resolve(repositoryRoot, publicPath), publicPath);
  }

  if (violations.length > 0) {
    throw new Error(`Public release verification failed:\n${violations.join("\n")}`);
  }

  console.log(
    `Public release verification passed: scanned ${distFiles.length} dist files and ${trackedArtifacts.length} tracked public text artifacts.`,
  );
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/scripts/verify-public.ts")) {
  await verifyPublicRelease();
}
