import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadSyncConfig, type SyncConfig } from "./config";
import { FeishuClient, type RawFeishuRecord } from "./feishu/client";
import { BASE_FIELDS } from "./feishu/fields";
import { mapPublishedContent, normalizeAttachmentSourceUrl } from "./feishu/map-records";
import { processPendingInbox, type InboxProcessingSummary } from "./inbox/process-inbox";
import {
  buildPublicDataset,
  writePublicDataset,
  type BuildPublicDatasetOptions,
} from "./publish/build-dataset";
import { PublicDatasetSchema, type ContentItem, type PublicDataset } from "../src/lib/schema";

const DEFAULT_LOCK_PATH = resolve(".sync-content.lock");
const DEFAULT_STALE_AFTER_MS = 15 * 60 * 1000;
const CONTENT = BASE_FIELDS.content;

export type SyncClient = Pick<FeishuClient, "listRecords" | "createRecord" | "updateRecord">;

export interface SyncLogger {
  info(message: string): void;
  error(message: string): void;
}

export interface SyncOutput {
  replaceAtomically(dataset: PublicDataset): Promise<void>;
}

export interface SyncLock {
  runExclusive<T>(operation: () => Promise<T>): Promise<T>;
}

export type DatasetBuilder = (
  items: readonly ContentItem[],
  options: BuildPublicDatasetOptions,
) => Promise<unknown>;

export interface SyncDependencies {
  client: SyncClient;
  config: SyncConfig;
  processInbox?: (
    client: SyncClient,
    config: SyncConfig,
  ) => Promise<InboxProcessingSummary>;
  buildDataset?: DatasetBuilder;
  output?: SyncOutput;
  clock?: () => Date;
  logger?: SyncLogger;
  lock?: SyncLock;
}

export interface SyncSummary {
  inbox: {
    pending: number;
    processed: number;
    failed: number;
    skipped: number;
  };
  published: number;
  status: "success";
}

export class SyncRunError extends Error {
  readonly code: string;
  readonly stage: string;

  constructor(code: string, stage: string, cause?: unknown) {
    super(`${code} at ${stage}`, cause === undefined ? undefined : { cause });
    this.name = "SyncRunError";
    this.code = code;
    this.stage = stage;
  }
}

export async function runSync(dependencies: SyncDependencies): Promise<SyncSummary> {
  const logger = dependencies.logger ?? consoleLogger;
  const lock = dependencies.lock ?? createExclusiveFileLock({ path: DEFAULT_LOCK_PATH });

  try {
    return await lock.runExclusive(async () => {
      const inbox = await processInbox(dependencies).catch((error) => {
        throw new SyncRunError("INBOX_PROCESSING_FAILED", "process-inbox", error);
      });

      const [contentRecords, copyRecords] = await Promise.all([
        readTable(dependencies.client, dependencies.config.FEISHU_CONTENT_TABLE_ID, "content"),
        readTable(dependencies.client, dependencies.config.FEISHU_COPY_BLOCKS_TABLE_ID, "copy"),
      ]);

      let mapped: ContentItem[];
      try {
        mapped = mapPublishedContent(contentRecords, copyRecords);
      } catch (error) {
        throw new SyncRunError("CONTENT_MAPPING_FAILED", "map-content", error);
      }

      const assets = new Map<string, string>();
      try {
        const recordsById = new Map(contentRecords.map((record) => [record.record_id, record]));
        for (const item of mapped) {
          const record = recordsById.get(item.id);
          if (!record) throw new Error(`Missing mapped content record ${item.id}`);
          assets.set(item.coverImage, normalizeAttachmentSourceUrl(record.fields[CONTENT.coverImage]));
        }
      } catch (error) {
        throw new SyncRunError("CONTENT_MAPPING_FAILED", "map-assets", error);
      }

      let dataset: PublicDataset;
      try {
        const candidate = await (dependencies.buildDataset ?? buildPublicDataset)(mapped, {
          assets,
          clock: dependencies.clock,
        });
        dataset = PublicDatasetSchema.parse(candidate);
      } catch (error) {
        throw new SyncRunError("DATASET_BUILD_FAILED", "build-dataset", error);
      }

      try {
        await (dependencies.output ?? defaultOutput).replaceAtomically(dataset);
      } catch (error) {
        throw new SyncRunError("OUTPUT_REPLACE_FAILED", "replace-output", error);
      }

      const summary: SyncSummary = {
        inbox: {
          pending: inbox.processed,
          processed: inbox.succeeded,
          failed: inbox.failed,
          skipped: inbox.skipped,
        },
        published: dataset.items.length,
        status: "success",
      };
      logger.info(
        `sync status=success pending=${summary.inbox.pending} processed=${summary.inbox.processed}`
        + ` failed=${summary.inbox.failed} skipped=${summary.inbox.skipped} published=${summary.published}`,
      );
      return summary;
    });
  } catch (error) {
    const typed = error instanceof SyncRunError
      ? error
      : new SyncRunError("LOCK_CONTENDED", "lock", error);
    logger.error(`sync status=failed code=${typed.code} stage=${typed.stage}`);
    throw typed;
  }
}

async function processInbox(dependencies: SyncDependencies): Promise<InboxProcessingSummary> {
  return (dependencies.processInbox ?? processPendingInbox)(dependencies.client, dependencies.config);
}

async function readTable(
  client: SyncClient,
  tableId: string,
  table: "content" | "copy",
): Promise<RawFeishuRecord[]> {
  try {
    return await client.listRecords(tableId);
  } catch (error) {
    throw new SyncRunError(`FEISHU_${table.toUpperCase()}_READ_FAILED`, `read-${table}`, error);
  }
}

const defaultOutput: SyncOutput = { replaceAtomically: writePublicDataset };
const consoleLogger: SyncLogger = {
  info: (message) => console.log(message),
  error: (message) => console.error(message),
};

export interface FileLockOptions {
  path?: string;
  clock?: () => Date;
  staleAfterMs?: number;
}

type LockMetadata = { pid: number; createdAt: string; token: string };

export function createExclusiveFileLock(options: FileLockOptions = {}): SyncLock {
  const path = options.path ?? DEFAULT_LOCK_PATH;
  const clock = options.clock ?? (() => new Date());
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;

  return {
    async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
      const metadata: LockMetadata = {
        pid: process.pid,
        createdAt: clock().toISOString(),
        token: randomUUID(),
      };
      await acquireLock(path, metadata, clock, staleAfterMs);
      try {
        return await operation();
      } finally {
        await releaseLock(path, metadata);
      }
    },
  };
}

async function acquireLock(
  path: string,
  metadata: LockMetadata,
  clock: () => Date,
  staleAfterMs: number,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await writeFile(path, `${JSON.stringify(metadata)}\n`, { encoding: "utf8", flag: "wx" });
      return;
    } catch (error) {
      if (!isFileExistsError(error) || attempt > 0 || !(await isStaleLock(path, clock, staleAfterMs))) {
        throw new SyncRunError("LOCK_CONTENDED", "lock", error);
      }
      await rm(path, { force: true });
    }
  }
}

async function isStaleLock(path: string, clock: () => Date, staleAfterMs: number): Promise<boolean> {
  let info: LockMetadata | undefined;
  try {
    info = JSON.parse(await readFile(path, "utf8")) as LockMetadata;
  } catch {
    const file = await stat(path).catch(() => undefined);
    return Boolean(file && clock().getTime() - file.mtimeMs > staleAfterMs);
  }
  if (!Number.isInteger(info.pid) || info.pid <= 0) return false;
  if (isProcessAlive(info.pid)) return false;
  return clock().getTime() - Date.parse(info.createdAt) > staleAfterMs;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "ESRCH" ? false : true;
  }
}

async function releaseLock(path: string, metadata: LockMetadata): Promise<void> {
  try {
    const current = JSON.parse(await readFile(path, "utf8")) as Partial<LockMetadata>;
    if (current.token === metadata.token) await rm(path, { force: true });
  } catch {
    // The lock may have been removed by a bounded stale-lock recovery.
  }
}

function isFileExistsError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EEXIST";
}

export async function main(): Promise<SyncSummary> {
  let config: SyncConfig;
  try {
    config = loadSyncConfig(process.env);
  } catch (error) {
    const typed = new SyncRunError("CONFIG_INVALID", "load-config", error);
    consoleLogger.error(`sync status=failed code=${typed.code} stage=${typed.stage}`);
    throw typed;
  }
  const client = new FeishuClient({
    appId: config.FEISHU_APP_ID,
    appSecret: config.FEISHU_APP_SECRET,
    appToken: config.FEISHU_BASE_APP_TOKEN,
  });
  return runSync({ client, config });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch(() => {
    process.exitCode = 1;
  });
}
