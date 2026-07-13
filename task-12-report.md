# AI Work Discovery Task 12 Report

## Scope

- Baseline: `7f60ffd9d6b7a7b8ea459b38d2800aead71ea241`.
- Added the top-level two-phase content synchronization command, dependency-injected orchestration, typed stage failures, concise operational logging, and a bounded exclusive process lock.
- Added `sync:content` and `sync:content:check`; retained `sync` as a compatibility alias without secret-bearing arguments.
- Added focused unit and CLI coverage. No UI or previously completed content, inbox, mapping, asset, or dataset modules were modified.

## RED / GREEN

### RED

- `npm test -- tests/unit/sync-content.test.ts` first failed because `scripts/sync-content.ts` did not exist.
- After the minimal orchestration implementation, three tests exposed a fixture mismatch with the mapper's existing published/public literals; the fixture was corrected without production special cases.
- The CLI subprocess test then failed because invalid configuration returned nonzero without a typed operational message.

### GREEN

- `runSync` accepts injected `client`, `config`, `processInbox`, `buildDataset`, `output`, `clock`, `logger`, and `lock` dependencies.
- Inbox processing completes before Content and Copy Blocks are re-read. The two required publication reads run concurrently and preserve typed content/copy failure stages.
- Existing per-record Inbox isolation remains authoritative: one failed or AI-failed Inbox item contributes to counts and does not stop later records or publication.
- Mapping and asset-source extraction complete before dataset construction. The built value passes `PublicDatasetSchema.parse` before `output.replaceAtomically` receives it.
- Asset retrieval failure remains a successful type-specific fallback through Task 9. Invalid downloaded paths or other dataset/schema failures reject publication.
- Operational logs contain only status, error code/stage, and counts. Raw text, bodies, URLs, tokens, secrets, headers, and causes are not logged.
- `main` leaves failures rejected, while the executable boundary sets a nonzero exit code. Invalid configuration is mapped to `CONFIG_INVALID` without printing configuration values.

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

- The default lock uses exclusive file creation and does not wait or retry indefinitely.
- An existing lock owned by a live process is never removed, even when its timestamp is old.
- A dead lock is reclaimed only after the bounded stale threshold and only once; a second acquisition conflict rejects.
- Lock metadata contains only PID, creation time, and a random ownership token. Release removes the file only when the ownership token still matches.

## Verification

- Focused unit/CLI tests: 1 file passed, 10 tests passed.
- Full `npm test`: 13 files passed, 310 tests passed.
- `npm run sync:content:check`: passed.
- `npm run check`: 50 files checked; 0 errors, 0 warnings, 0 hints.
- `npm run build`: 13 static pages generated.
