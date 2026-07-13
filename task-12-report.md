# AI Work Discovery Task 12 Report

## Scope

- Baseline: `7f60ffd9d6b7a7b8ea459b38d2800aead71ea241`.
- Lock repair baseline: `659a0601cd51fef793ce6e4851c322ed5446f0ce`.
- Added the top-level two-phase content synchronization command, dependency-injected orchestration, typed stage failures, concise operational logging, and a bounded exclusive process lock.
- Replaced the PID/metadata/stale-`rm` lock with `proper-lockfile` over the stable working directory using atomic directory creation, `realpath: false`, `retries: 0`, a 15-minute stale threshold, and a 5-minute heartbeat.
- Added `sync:content` and `sync:content:check`; retained `sync` as a compatibility alias without secret-bearing arguments.
- Added focused unit and CLI coverage. No UI or previously completed content, inbox, mapping, asset, or dataset modules were modified.

## RED / GREEN

### RED

- `npm test -- tests/unit/sync-content.test.ts` first failed because `scripts/sync-content.ts` did not exist.
- After the minimal orchestration implementation, three tests exposed a fixture mismatch with the mapper's existing published/public literals; the fixture was corrected without production special cases.
- The CLI subprocess test then failed because invalid configuration returned nonzero without a typed operational message.
- The lock repair tests first failed because `createSynchronizationLock` and `proper-lockfile` were absent. After the minimal implementation, the crash-recovery test exposed filesystem mtime precision rounding; the test now waits on the stale condition with a bounded test-only poll rather than weakening production's zero-retry acquisition.

### GREEN

- `runSync` accepts injected `client`, `config`, `processInbox`, `buildDataset`, `output`, `clock`, `logger`, and `lock` dependencies.
- Inbox processing completes before Content and Copy Blocks are re-read. The two required publication reads run concurrently and preserve typed content/copy failure stages.
- Existing per-record Inbox isolation remains authoritative: one failed or AI-failed Inbox item contributes to counts and does not stop later records or publication.
- Mapping and asset-source extraction complete before dataset construction. The built value passes `PublicDatasetSchema.parse` before `output.replaceAtomically` receives it.
- Asset retrieval failure remains a successful type-specific fallback through Task 9. Invalid downloaded paths or other dataset/schema failures reject publication.
- Operational logs contain only status, error code/stage, and counts. Raw text, bodies, URLs, tokens, secrets, headers, and causes are not logged.
- `main` leaves failures rejected, while the executable boundary sets a nonzero exit code. Invalid configuration is mapped to `CONFIG_INVALID` without printing configuration values.
- Lock contention is mapped from `proper-lockfile`'s `ELOCKED` to `SyncRunError` with `LOCK_CONTENDED`; other acquire and release failures remain distinguishable as `LOCK_ACQUIRE_FAILED` and `LOCK_RELEASE_FAILED`.

## Last-Good Guarantee

The output boundary is called exactly once and only after all of these steps succeed:

1. Inbox batch processing returns its isolated summary.
2. Both required Feishu publication reads succeed.
3. Public record mapping and controlled asset-source mapping succeed.
4. Dataset construction completes.
5. The complete candidate passes `PublicDatasetSchema`.

Any earlier failure results in zero replacement calls. Output replacement delegates to Task 9's temp-file validation and atomic rename; a replacement failure removes the temp file and leaves the previous `content.json` byte-for-byte unchanged. The orchestration never reads an old generated dataset as fallback for the current run.

## Failure Matrix

| Failure | Typed result | Replace output | Last good |
| --- | --- | --- | --- |
| Inbox batch infrastructure failure | `INBOX_PROCESSING_FAILED` | No | Preserved |
| One Inbox record or AI enrichment failure | Counted in `inbox.failed`; run continues | Yes, if publication succeeds | Replaced with complete new dataset |
| Content table read failure | `FEISHU_CONTENT_READ_FAILED` | No | Preserved |
| Copy Blocks table read failure | `FEISHU_COPY_READ_FAILED` | No | Preserved |
| Mapping or asset-source schema failure | `CONTENT_MAPPING_FAILED` | No | Preserved |
| Dataset or final schema failure | `DATASET_BUILD_FAILED` | No | Preserved |
| Asset download failure with valid fallback | Success | Yes | Replaced with validated fallback dataset |
| Atomic output failure | `OUTPUT_REPLACE_FAILED` | Attempted once | Preserved by Task 9 |
| Active lock contention | `LOCK_CONTENDED` | No | Preserved |
| Invalid CLI configuration | `CONFIG_INVALID`, nonzero exit | No | Preserved |

## Locking

- The default lock uses maintained `proper-lockfile` and locks the stable working directory with atomic `mkdir` semantics.
- Acquisition uses `realpath: false` and `retries: 0`, so active contention rejects immediately with typed `LOCK_CONTENDED` and never enters Inbox processing or publication reads.
- The configured 15-minute stale threshold is refreshed every 5 minutes. A live owner remains protected after the initial stale duration, while a lock left by a force-killed process becomes recoverable after it is genuinely stale.
- Acquisition returns an ownership-bound release function. `runExclusive` calls only that function in `finally`; it does not inspect PIDs, parse owner metadata, or delete a lock path itself.
- Real temporary-directory tests cover two concurrent `runSync` calls with a barrier and maximum critical-section concurrency of one, 100 repeated contention rounds, force-killed-process stale recovery, heartbeat protection, and cleanup after the protected operation throws. Lock dependency injection remains available for orchestration unit tests.

## Verification

- Focused unit/CLI tests: 1 file passed, 13 tests passed.
- Full `npm test`: 13 files passed, 313 tests passed.
- `npm run sync:content:check`: passed.
- `npx tsc --noEmit --ignoreDeprecations 6.0`: passed. The unmodified `npx tsc --noEmit` command is currently blocked by the repository's existing TypeScript 6 `TS5101` diagnostic for deprecated `baseUrl` in `tsconfig.json`; that configuration file is outside this task's assigned scope.
- `npm run check`: 50 files checked; 0 errors, 0 warnings, 0 hints.
- `npm run build`: 13 static pages generated.
