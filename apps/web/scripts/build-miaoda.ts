import { spawnSync } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { rewriteForMiaoda, rewriteMiaodaModuleImports } from "./miaoda-paths";

const appId = process.env.MIAODA_APP_ID?.trim();

if (!appId || !/^app_[a-z0-9]+$/i.test(appId)) {
  throw new Error("MIAODA_APP_ID must be a valid Miaoda app id");
}

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const distDirectory = join(projectRoot, "dist");
const basePath = `/app/${appId}`;
const command = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "npm";
const args = process.platform === "win32" ? ["/d", "/s", "/c", "npm run build"] : ["run", "build"];
const build = spawnSync(command, args, {
  cwd: projectRoot,
  env: {
    ...process.env,
    PUBLIC_BASE_PATH: basePath,
    PUBLIC_MIAODA_SAFE: "true",
  },
  stdio: "inherit",
});

if (build.error) {
  throw build.error;
}

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

await rewriteDirectory(distDirectory, basePath, basePath);

async function rewriteDirectory(directory: string, prefix: string, modulePrefix: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      await rewriteDirectory(path, prefix, modulePrefix);
      continue;
    }

    const extension = extname(entry.name);

    if (![".html", ".json", ".js"].includes(extension)) {
      continue;
    }

    const source = await readFile(path, "utf8");
    const rewritten = extension === ".js"
      ? rewriteMiaodaModuleImports(source, modulePrefix)
      : rewriteForMiaoda(source, prefix);

    if (rewritten !== source) {
      await writeFile(path, rewritten, "utf8");
    }
  }
}
