# AI Work Discovery Task 11 Report

## Scope

- Baseline: `ae1c8e746e33c7c27e4d068ecb38b859c09250af`.
- Added a strict OpenAI-compatible draft proposal parser and bounded enrichment request adapter.
- Added pending Inbox processing, review-draft and Copy Block writes, failure isolation, and a detectable partial-write checkpoint.
- Added the minimal Feishu `updateRecord` operation and shared draft/Inbox status constants.
- Review fixes: added strict draft-only source recovery, idempotent Copy Block retries, public-mapper isolation for internal write keys, and typed transport-error wrapping for Feishu fetch failures.
- No UI or publication pipeline files were modified.

## RED / GREEN

### RED

- `npm test -- tests/unit/feishu-client.test.ts` failed because `FeishuClient.updateRecord` did not exist.
- `npm test -- tests/unit/ai-enricher.test.ts` failed because the enrichment module did not exist.
- `npm test -- tests/unit/process-inbox.test.ts` failed because the Inbox processor did not exist.
- A timeout regression proved that aborting alone did not finish a response stream that ignored `AbortSignal`.
- A transport-boundary regression proved that allowlisted metadata URLs still exposed query parameters to the model.
- A retry regression proved that successful Content creation followed by a failed Inbox checkpoint update created a second draft after manual recovery.
- Existing-draft and duplicate-source regressions proved that source Inbox ids were neither recovered nor enforced fail-safe.
- A unique published-source regression proved that a non-draft Content record could be reused and receive new Copy Blocks.
- A partial Copy Block write regression proved that retrying after order 0 succeeded and order 1 failed duplicated order 0.
- Duplicate-key, wrong-draft-link, and public-field-conflict regressions proved that existing Copy Blocks were not validated before retry writes.
- A mapper-isolation regression covered both the Content source Inbox id and Copy Block idempotency key as internal-only fields.
- Feishu list/create/update and tenant-token transport regressions proved that fetch rejections escaped as raw network/TLS errors.

### GREEN

- `DraftProposalSchema` and nested Copy Blocks are strict and enforce exact content-type/status enums plus field, array-count, and string-length limits.
- Completion parsing accepts only `choices[0].message.content` containing pure JSON or one lowercase `json` fence. Empty choices, non-string content, free text, unknown proposal fields, published/approved statuses, and malformed JSON are rejected with typed errors.
- Enrichment posts to a safely joined HTTPS `chat/completions` URL with the configured model, temperature `0.2`, JSON response format, and Bearer authentication.
- Model input is reconstructed from bounded SourceMetadata and a 1,000-character editor note. Truncation is recorded by length metadata; cookies, HTML, raw fields, URL credentials, query strings, and fragments are not sent.
- One 20-second timeout covers fetch and streamed body reads. Responses are limited to 256 KiB, decoded as strict UTF-8, and non-2xx, malformed, oversized, timeout, and request failures remain typed without exposing the API key.
- Pending Inbox records are marked Processing before detection. Non-pending records are skipped.
- Content and Copy Block writes use explicit field allowlists. Content publication status is hardcoded to `草稿`; AI status is not trusted; public level is not written.
- Draft creation hardcodes the internal `来源收件箱记录ID` field to the Inbox `record_id`. Before creating, the processor lists Content records and reuses only the unique matching record whose publication status is exactly `草稿`; any non-draft match, multiple source matches, or conflicting checkpoint fails visibly for manual handling without another create or Copy Block write.
- The created or recovered draft id is written back to the Inbox before any Copy Block write. A create-success/checkpoint-failure retry reuses the original draft after the Inbox is manually restored to pending.
- Each Copy Block receives the internal `来源收件箱复制块键` value `${inboxRecordId}:${order}`. Before every create, the processor lists Copy Blocks by this key: one exact match linked only to the same draft is skipped, while duplicate keys, link conflicts, or public-field conflicts fail safely without another write.
- Proposal array order remains the persisted `显示顺序`, so a retry after order 0 succeeds and order 1 fails creates only the missing order 1 block.
- The internal source Inbox id and Copy Block idempotency key are not part of the public mapper allowlist and are covered by non-disclosure regressions.
- Per-record failures write `失败` plus a 240-character sanitized message and processing continues for later records.

## No Automatic Publication Evidence

- Production draft creation writes only `BASE_VALUES.content.draft`, whose value is `草稿`.
- `DraftProposalSchema` rejects `已发布`, `审核通过`, unknown statuses, and unknown fields before Feishu writes.
- The Content write does not include the public-level field, so no record is automatically marked `公开`.
- Successful Inbox records end at `待审核` and retain the linked draft id for human review.

## Error Isolation

- Provider and Feishu API errors expose only typed operation/category information and optional HTTP/code values.
- Feishu request and tenant-token fetch rejections are wrapped as `FeishuApiError` with an optional `cause`; the public message contains only the operation and no URL, secret, headers, or body.
- Inbox error storage uses `Error.message` only, removes configured secrets, Bearer values, URLs and credential-like key/value text, collapses line breaks, and caps the result at 240 characters.
- Failure updating one Inbox record does not stop subsequent pending records; a failed failure-status write is contained so the batch summary still returns.

## Verification

- Focused review unit tests: 2 files passed, 22 tests passed.
- Full `npm test`: 12 files passed, 300 tests passed.
- Script and focused-test TypeScript check passed with `npx tsc --noEmit --ignoreConfig scripts/inbox/process-inbox.ts scripts/feishu/client.ts scripts/feishu/fields.ts scripts/feishu/map-records.ts tests/unit/process-inbox.test.ts tests/unit/feishu-client.test.ts tests/unit/map-records.test.ts --module ESNext --moduleResolution Bundler --target ES2022 --lib ES2022,DOM --types node,vitest/globals --skipLibCheck`.
- TypeScript was `6.0.3`; the check did not pass `--ignoreDeprecations`, and no deprecation diagnostic was emitted. The existing `--ignoreConfig` script-check convention was retained.
- `npm run check`: 48 files checked; 0 errors, 0 warnings, 0 hints.
- `npm run build`: 13 static pages generated.
- `git diff --check`: passed.
