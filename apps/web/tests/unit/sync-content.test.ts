import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SyncConfig } from "../../scripts/config";
import type { RawFeishuRecord } from "../../scripts/feishu/client";
import { BASE_FIELDS } from "../../scripts/feishu/fields";
import { buildPublicDataset, writePublicDataset } from "../../scripts/publish/build-dataset";
import {
  SyncRunError,
  createExclusiveFileLock,
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

describe("createExclusiveFileLock", () => {
  it("does not remove an old lock owned by a live process", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sync-live-lock-"));
    const lockPath = join(directory, "sync.lock");
    await writeFile(lockPath, JSON.stringify({
      pid: process.pid,
      createdAt: "2000-01-01T00:00:00.000Z",
      token: "live-owner",
    }));

    try {
      const lock = createExclusiveFileLock({
        path: lockPath,
        clock: () => new Date("2026-07-14T08:00:00.000Z"),
        staleAfterMs: 1,
      });
      await expect(lock.runExclusive(async () => undefined))
        .rejects.toMatchObject({ code: "LOCK_CONTENDED" });
      expect(await readFile(lockPath, "utf8")).toContain("live-owner");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("reclaims one bounded stale dead lock and releases its own lock", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sync-stale-lock-"));
    const lockPath = join(directory, "nested", "sync.lock");
    await mkdir(join(directory, "nested"), { recursive: true });
    await writeFile(lockPath, JSON.stringify({
      pid: 2_147_483_647,
      createdAt: "2000-01-01T00:00:00.000Z",
      token: "dead-owner",
    }));

    try {
      const lock = createExclusiveFileLock({
        path: lockPath,
        clock: () => new Date("2026-07-14T08:00:00.000Z"),
        staleAfterMs: 1,
      });
      await expect(lock.runExclusive(async () => "done")).resolves.toBe("done");
      await expect(readFile(lockPath, "utf8")).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

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
