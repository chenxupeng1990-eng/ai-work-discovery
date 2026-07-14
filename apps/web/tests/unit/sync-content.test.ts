import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { describe, expect, it, vi } from "vitest";
import type { SyncConfig } from "../../scripts/config";
import type { RawFeishuRecord } from "../../scripts/feishu/client";
import { BASE_FIELDS } from "../../scripts/feishu/fields";
import {
  buildPublicDataset,
  publishDatasetAtomically,
  writePublicDataset,
} from "../../scripts/publish/build-dataset";
import {
  SyncRunError,
  createSynchronizationLock,
  defaultOutput,
  runSync,
  type SyncLogger,
  type SyncOutput,
} from "../../scripts/sync-content";

const CONTENT = BASE_FIELDS.content;

const config: SyncConfig = {
  FEISHU_APP_ID: "app-id",
  FEISHU_APP_SECRET: "app-secret-value",
  FEISHU_BASE_APP_TOKEN: "base-token-value",
  FEISHU_CONTENT_TABLE_ID: "content-table",
  FEISHU_COPY_BLOCKS_TABLE_ID: "copy-table",
  FEISHU_INBOX_TABLE_ID: "inbox-table",
  AI_BASE_URL: "https://ai.example.com/v1",
  AI_API_KEY: "ai-secret-value",
  AI_MODEL: "test-model",
};

const record = (record_id: string, fields: Record<string, unknown>): RawFeishuRecord => ({
  record_id,
  fields,
});

function publishedRecord(overrides: Record<string, unknown> = {}): RawFeishuRecord {
  return record("content-1", {
    [CONTENT.title]: "Public case",
    [CONTENT.slug]: "public-case",
    [CONTENT.type]: "Case",
    [CONTENT.category]: "Team",
    [CONTENT.summary]: "A public summary",
    [CONTENT.recommendationReason]: "Useful to teams",
    [CONTENT.recommendationTrack]: "团队实践",
    [CONTENT.timeToValue]: "半天",
    [CONTENT.adoptionLevel]: "需要配置",
    [CONTENT.takeaway]: "完成一份可供团队直接复用的公开案例卡片。",
    [CONTENT.networkRequirement]: "无需 VPN",
    [CONTENT.coverImage]: [{ name: "cover.png", url: "https://cdn.example.com/cover.png" }],
    [CONTENT.tags]: ["Codex"],
    [CONTENT.audience]: ["Engineering"],
    [CONTENT.scenario]: "Collaboration",
    [CONTENT.originalUrl]: "https://example.com/source",
    [CONTENT.feishuDocumentUrl]: "https://example.feishu.cn/wiki/public",
    [CONTENT.sourceName]: "Public source",
    [CONTENT.featured]: false,
    [CONTENT.sortWeight]: 10,
    [CONTENT.publishedAt]: "2026-07-13T00:00:00.000Z",
    [CONTENT.updatedAt]: "2026-07-14T00:00:00.000Z",
    [CONTENT.publicationStatus]: "已发布",
    [CONTENT.publicLevel]: "公开",
    ...overrides,
  });
}

function clientFor(content: RawFeishuRecord[] = [publishedRecord()], copies: RawFeishuRecord[] = []) {
  return {
    listRecords: vi.fn(async (tableId: string) => {
      if (tableId === config.FEISHU_CONTENT_TABLE_ID) return content;
      if (tableId === config.FEISHU_COPY_BLOCKS_TABLE_ID) return copies;
      return [];
    }),
    createRecord: vi.fn(),
    updateRecord: vi.fn(),
  };
}

function successfulInbox() {
  return { processed: 3, succeeded: 2, failed: 1, skipped: 4 };
}

function memoryOutput(): SyncOutput & { replaceAtomically: ReturnType<typeof vi.fn> } {
  return { replaceAtomically: vi.fn(async () => undefined) };
}

describe("runSync", () => {
  it("uses transactional dataset publication for the default filesystem output", () => {
    expect(defaultOutput.replaceAtomically).toBe(publishDatasetAtomically);
  });

  it("does not replace the last good dataset when a required Feishu read fails", async () => {
    const output = memoryOutput();
    const client = clientFor();
    client.listRecords.mockImplementation(async (tableId: string) => {
      if (tableId === config.FEISHU_CONTENT_TABLE_ID) throw new Error("private body and token");
      return [];
    });

    await expect(runSync({
      client,
      config,
      processInbox: async () => successfulInbox(),
      output,
    })).rejects.toMatchObject({ code: "FEISHU_CONTENT_READ_FAILED" });
    expect(output.replaceAtomically).not.toHaveBeenCalled();
  });

  it("does not replace the last good dataset when mapping fails", async () => {
    const output = memoryOutput();

    await expect(runSync({
      client: clientFor([publishedRecord({ [CONTENT.slug]: "invalid slug" })]),
      config,
      processInbox: async () => successfulInbox(),
      output,
    })).rejects.toMatchObject({ code: "CONTENT_MAPPING_FAILED" });
    expect(output.replaceAtomically).not.toHaveBeenCalled();
  });

  it("continues publishing after one inbox item fails and reports safe counts", async () => {
    const output = memoryOutput();
    const logger = { info: vi.fn(), error: vi.fn() } satisfies SyncLogger;

    const summary = await runSync({
      client: clientFor(),
      config,
      processInbox: async () => successfulInbox(),
      buildDataset: async (items, options) => buildPublicDataset(items, {
        ...options,
        downloadAsset: async () => "/images/content/cover.webp",
      }),
      output,
      clock: () => new Date("2026-07-14T08:00:00.000Z"),
      logger,
    });

    expect(summary).toEqual({
      inbox: { pending: 3, processed: 2, failed: 1, skipped: 4 },
      published: 1,
      status: "success",
    });
    expect(output.replaceAtomically).toHaveBeenCalledOnce();
    expect(logger.info).toHaveBeenCalledWith(
      "sync status=success pending=3 processed=2 failed=1 skipped=4 published=1",
    );
  });

  it("publishes with a type fallback when an asset download fails", async () => {
    const output = memoryOutput();

    await runSync({
      client: clientFor(),
      config,
      processInbox: async () => ({ processed: 0, succeeded: 0, failed: 0, skipped: 0 }),
      buildDataset: async (items, options) => buildPublicDataset(items, {
        ...options,
        downloadAsset: async () => { throw new Error("credential-bearing URL must stay private"); },
      }),
      output,
    });

    expect(output.replaceAtomically.mock.calls[0]?.[0].items[0].coverImage)
      .toBe("/images/fallback-case.webp");
  });

  it("preserves the prior dataset when atomic output replacement fails", async () => {
    const generatedDir = await mkdtemp(join(tmpdir(), "sync-output-failure-"));
    const prior = "{\"lastGood\":true}\n";
    await writeFile(join(generatedDir, "content.json"), prior);
    await writeFile(join(generatedDir, "content.tmp.json"), "occupied");

    try {
      await expect(runSync({
        client: clientFor(),
        config,
        processInbox: async () => successfulInbox(),
        buildDataset: async (items, options) => buildPublicDataset(items, {
          ...options,
          downloadAsset: async () => "/images/content/cover.webp",
        }),
        output: {
          replaceAtomically: (dataset) => writePublicDataset(dataset, { generatedDir }),
        },
      })).rejects.toMatchObject({ code: "OUTPUT_REPLACE_FAILED" });
      expect(await readFile(join(generatedDir, "content.json"), "utf8")).toBe(prior);
    } finally {
      await rm(generatedDir, { recursive: true, force: true });
    }
  });

  it("rejects immediately on lock contention before processing or reading", async () => {
    const client = clientFor();
    const processInbox = vi.fn(async () => successfulInbox());

    await expect(runSync({
      client,
      config,
      processInbox,
      output: memoryOutput(),
      lock: { runExclusive: async () => { throw new SyncRunError("LOCK_CONTENDED", "lock"); } },
    })).rejects.toMatchObject({ code: "LOCK_CONTENDED" });
    expect(processInbox).not.toHaveBeenCalled();
    expect(client.listRecords).not.toHaveBeenCalled();
  });

  it("logs only fixed operational fields and redacts failure details", async () => {
    const messages: string[] = [];
    const logger: SyncLogger = {
      info: (message) => messages.push(message),
      error: (message) => messages.push(message),
    };
    const client = clientFor();
    client.listRecords.mockRejectedValueOnce(new Error(
      `raw body Authorization: Bearer ${config.AI_API_KEY} https://user:pass@example.com/private`,
    ));

    await expect(runSync({
      client,
      config,
      processInbox: async () => successfulInbox(),
      output: memoryOutput(),
      logger,
    })).rejects.toBeInstanceOf(SyncRunError);

    expect(messages.join("\n")).toBe("sync status=failed code=FEISHU_CONTENT_READ_FAILED stage=read-content");
    expect(messages.join("\n")).not.toMatch(/raw body|Bearer|ai-secret|https:|user:pass|app-secret|base-token/i);
  });
});

describe("createSynchronizationLock", () => {
  it("allows only one concurrent runSync and rejects the second before its critical section", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sync-contention-"));
    let active = 0;
    let maxActive = 0;
    let releaseFirst!: () => void;
    const firstEntered = new Promise<void>((resolveEntered) => {
      releaseFirst = resolveEntered;
    });
    let markEntered!: () => void;
    const entered = new Promise<void>((resolveEntered) => {
      markEntered = resolveEntered;
    });

    try {
      const first = runSync({
        client: clientFor(),
        config,
        lock: createSynchronizationLock({ target: directory }),
        processInbox: async () => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          markEntered();
          await firstEntered;
          active -= 1;
          return successfulInbox();
        },
        buildDataset: async (items, options) => buildPublicDataset(items, {
          ...options,
          downloadAsset: async () => "/images/content/cover.webp",
        }),
        output: memoryOutput(),
      });
      await entered;

      const secondProcessInbox = vi.fn(async () => successfulInbox());
      await expect(runSync({
        client: clientFor(),
        config,
        lock: createSynchronizationLock({ target: directory }),
        processInbox: secondProcessInbox,
        output: memoryOutput(),
      })).rejects.toMatchObject({ code: "LOCK_CONTENDED", stage: "lock" });

      releaseFirst();
      await expect(first).resolves.toMatchObject({ status: "success" });
      expect(secondProcessInbox).not.toHaveBeenCalled();
      expect(maxActive).toBe(1);
    } finally {
      releaseFirst?.();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects every competing acquisition in a 100-round stress run", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sync-lock-stress-"));

    try {
      for (let round = 0; round < 100; round += 1) {
        let releaseOwner!: () => void;
        const ownerBarrier = new Promise<void>((resolveBarrier) => {
          releaseOwner = resolveBarrier;
        });
        let markEntered!: () => void;
        const entered = new Promise<void>((resolveEntered) => {
          markEntered = resolveEntered;
        });
        const owner = createSynchronizationLock({ target: directory }).runExclusive(async () => {
          markEntered();
          await ownerBarrier;
        });
        await entered;

        await expect(createSynchronizationLock({ target: directory }).runExclusive(async () => undefined))
          .rejects.toMatchObject({ code: "LOCK_CONTENDED" });
        releaseOwner();
        await owner;
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("recovers a stale lock left by a crashed process", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sync-stale-lock-"));
    const childScript = [
      "import lockfile from 'proper-lockfile';",
      `await lockfile.lock(${JSON.stringify(directory)}, { realpath: false, stale: 2000, update: 1000, retries: 0 });`,
      "console.log('locked');",
      "setInterval(() => {}, 1000);",
    ].join("\n");
    const child = spawn(process.execPath, ["--input-type=module", "--eval", childScript], {
      cwd: resolve("."),
      stdio: ["ignore", "pipe", "pipe"],
    });

    try {
      await waitForOutput(child, "locked");
      child.kill("SIGKILL");
      await new Promise<void>((resolveExit) => child.once("exit", () => resolveExit()));

      const lock = createSynchronizationLock({
        target: directory,
        staleMs: 2000,
        updateMs: 1000,
      });
      await expect(waitForStaleRecovery(lock)).resolves.toBe("recovered");
    } finally {
      child.kill("SIGKILL");
      await rm(directory, { recursive: true, force: true });
    }
  }, 10_000);

  it("keeps a live lock beyond its stale threshold through heartbeat updates", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sync-heartbeat-"));
    let releaseOwner!: () => void;
    const ownerBarrier = new Promise<void>((resolveBarrier) => {
      releaseOwner = resolveBarrier;
    });

    try {
      const owner = createSynchronizationLock({
        target: directory,
        staleMs: 2000,
        updateMs: 1000,
      }).runExclusive(async () => ownerBarrier);
      await delay(2600);

      await expect(createSynchronizationLock({
        target: directory,
        staleMs: 2000,
        updateMs: 1000,
      }).runExclusive(async () => undefined)).rejects.toMatchObject({ code: "LOCK_CONTENDED" });
      releaseOwner();
      await owner;
    } finally {
      releaseOwner?.();
      await rm(directory, { recursive: true, force: true });
    }
  }, 10_000);

  it("releases its owned lock when the protected operation throws", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sync-release-error-"));

    try {
      const lock = createSynchronizationLock({ target: directory });
      await expect(lock.runExclusive(async () => {
        throw new Error("operation failed");
      })).rejects.toThrow("operation failed");
      await expect(lock.runExclusive(async () => "next owner")).resolves.toBe("next owner");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

async function waitForOutput(child: ReturnType<typeof spawn>, expected: string): Promise<void> {
  await new Promise<void>((resolveOutput, rejectOutput) => {
    let output = "";
    const timeout = setTimeout(() => rejectOutput(new Error(`Timed out waiting for ${expected}`)), 5000);
    child.stdout?.on("data", (chunk) => {
      output += chunk.toString();
      if (output.includes(expected)) {
        clearTimeout(timeout);
        resolveOutput();
      }
    });
    child.once("error", rejectOutput);
    child.once("exit", (code) => {
      if (!output.includes(expected)) rejectOutput(new Error(`Lock child exited with code ${code}`));
    });
  });
}

async function waitForStaleRecovery(lock: ReturnType<typeof createSynchronizationLock>): Promise<string> {
  const deadline = Date.now() + 4500;
  while (Date.now() < deadline) {
    try {
      return await lock.runExclusive(async () => "recovered");
    } catch (error) {
      if (!(error instanceof SyncRunError) || error.code !== "LOCK_CONTENDED") throw error;
      await delay(100);
    }
  }
  throw new Error("Timed out waiting for stale lock recovery");
}

describe("sync content CLI", () => {
  it("maps typed configuration failure to nonzero without printing secret material", () => {
    const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/sync-content.ts"], {
      cwd: resolve("."),
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        AI_API_KEY: "must-not-print-this-secret",
      },
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr.trim()).toBe("sync status=failed code=CONFIG_INVALID stage=load-config");
    expect(`${result.stdout}\n${result.stderr}`).not.toContain("must-not-print-this-secret");
  });
});
