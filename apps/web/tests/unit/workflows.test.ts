import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const root = resolve("../..");
const configSecrets = [
  "FEISHU_APP_ID",
  "FEISHU_APP_SECRET",
  "FEISHU_BASE_APP_TOKEN",
  "FEISHU_CONTENT_TABLE_ID",
  "FEISHU_COPY_BLOCKS_TABLE_ID",
  "FEISHU_INBOX_TABLE_ID",
  "AI_BASE_URL",
  "AI_API_KEY",
  "AI_MODEL",
];

function loadWorkflow(name: string) {
  const path = resolve(root, ".github/workflows", name);
  expect(existsSync(path), `${name} should exist`).toBe(true);
  if (!existsSync(path)) return undefined;
  return { source: readFileSync(path, "utf8"), value: parse(readFileSync(path, "utf8")) };
}

describe("GitHub Actions workflows", () => {
  it("parses CI and enforces every pull request and main gate", () => {
    const workflow = loadWorkflow("ci.yml");
    if (!workflow) return;

    const value = workflow.value;
    expect(value.on).toHaveProperty("pull_request");
    expect(value.on.push.branches).toContain("main");
    expect(value.permissions).toEqual({ contents: "read" });
    expect(value.concurrency["cancel-in-progress"]).toBe(true);

    const job = value.jobs.validation;
    expect(job["timeout-minutes"]).toBeGreaterThan(0);
    expect(job["runs-on"]).toBe("ubuntu-latest");
    const setup = job.steps.find((step: Record<string, unknown>) => step.uses === "actions/setup-node@v4");
    expect(setup.with).toMatchObject({ "node-version": 22, cache: "npm", "cache-dependency-path": "apps/web/package-lock.json" });
    const commands = job.steps.flatMap((step: { run?: string }) => step.run ? [step.run] : []);
    expect(commands).toEqual(expect.arrayContaining([
      "npm ci",
      "npm run typecheck",
      "npm test",
      "npm run check",
      "npm run build",
      "npm run verify:public",
      "npx playwright install --with-deps chromium",
      "npm run test:e2e",
    ]));
    expect(commands.indexOf("npm run verify:public")).toBe(commands.indexOf("npm run build") + 1);
    expect(workflow.source).not.toContain("secrets.");
  });

  it("parses sync workflow and commits only validated generated content", () => {
    const workflow = loadWorkflow("sync-content.yml");
    if (!workflow) return;

    const value = workflow.value;
    expect(value.on.schedule).toEqual([{ cron: "17 2 * * 3" }]);
    expect(value.on).toHaveProperty("workflow_dispatch");
    expect(value.permissions).toEqual({ contents: "write" });
    expect(value.concurrency["cancel-in-progress"]).toBe(false);

    const job = value.jobs.sync;
    expect(job["timeout-minutes"]).toBeGreaterThan(0);
    const syncStep = job.steps.find((step: { name?: string }) => step.name === "Sync content");
    expect(Object.keys(syncStep.env).sort()).toEqual([...configSecrets].sort());
    for (const secret of configSecrets) {
      expect(syncStep.env[secret]).toBe(`\${{ secrets.${secret} }}`);
    }

    const commands = job.steps.flatMap((step: { run?: string }) => step.run ? [step.run] : []);
    expect(commands).toEqual(expect.arrayContaining([
      "npm ci",
      "npm run sync",
      "npm test",
      "npm run typecheck",
      "npm run check",
      "npm run build",
      "npm run verify:public",
    ]));
    const commitCommand = commands.find((command: string) => command.includes("git add"));
    expect(commands.indexOf("npm run verify:public")).toBe(commands.indexOf("npm run build") + 1);
    expect(commands.indexOf("npm run verify:public")).toBeLessThan(commands.indexOf(commitCommand));
    expect(commitCommand).toContain(
      "git add -A -- apps/web/src/generated/content.json apps/web/public/images/content",
    );
    expect(commitCommand).toContain("git diff --cached --quiet");
    expect(commitCommand).toContain("git push origin HEAD:${{ github.event.repository.default_branch }}");
    expect(commitCommand).not.toMatch(/git add\s+(?:\.|--all)/);
  });
});
