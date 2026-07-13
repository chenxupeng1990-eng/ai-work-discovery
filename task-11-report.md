# AI Work Discovery Task 11 Report

## Scope

- Baseline: `ae1c8e746e33c7c27e4d068ecb38b859c09250af`.
- Added a strict OpenAI-compatible draft proposal parser and bounded enrichment request adapter.
- Added pending Inbox processing, review-draft and Copy Block writes, failure isolation, and a detectable partial-write checkpoint.
- Added the minimal Feishu `updateRecord` operation and shared draft/Inbox status constants.
- No UI or publication pipeline files were modified.

## RED / GREEN

### RED

- `npm test -- tests/unit/feishu-client.test.ts` failed because `FeishuClient.updateRecord` did not exist.
- `npm test -- tests/unit/ai-enricher.test.ts` failed because the enrichment module did not exist.
- `npm test -- tests/unit/process-inbox.test.ts` failed because the Inbox processor did not exist.
- A timeout regression proved that aborting alone did not finish a response stream that ignored `AbortSignal`.
- A transport-boundary regression proved that allowlisted metadata URLs still exposed query parameters to the model.

### GREEN

- `DraftProposalSchema` and nested Copy Blocks are strict and enforce exact content-type/status enums plus field, array-count, and string-length limits.
- Completion parsing accepts only `choices[0].message.content` containing pure JSON or one lowercase `json` fence. Empty choices, non-string content, free text, unknown proposal fields, published/approved statuses, and malformed JSON are rejected with typed errors.
- Enrichment posts to a safely joined HTTPS `chat/completions` URL with the configured model, temperature `0.2`, JSON response format, and Bearer authentication.
- Model input is reconstructed from bounded SourceMetadata and a 1,000-character editor note. Truncation is recorded by length metadata; cookies, HTML, raw fields, URL credentials, query strings, and fragments are not sent.
- One 20-second timeout covers fetch and streamed body reads. Responses are limited to 256 KiB, decoded as strict UTF-8, and non-2xx, malformed, oversized, timeout, and request failures remain typed without exposing the API key.
- Pending Inbox records are marked Processing before detection. Non-pending records are skipped.
- Content and Copy Block writes use explicit field allowlists. Content publication status is hardcoded to `草稿`; AI status is not trusted; public level is not written.
- The created draft id is written back to the Inbox before any Copy Block write. A retry that already has a draft checkpoint fails visibly for manual recovery instead of silently creating another draft or duplicate blocks.
- Per-record failures write `失败` plus a 240-character sanitized message and processing continues for later records.

## No Automatic Publication Evidence

- Production draft creation writes only `BASE_VALUES.content.draft`, whose value is `草稿`.
- `DraftProposalSchema` rejects `已发布`, `审核通过`, unknown statuses, and unknown fields before Feishu writes.
- The Content write does not include the public-level field, so no record is automatically marked `公开`.
- Successful Inbox records end at `待审核` and retain the linked draft id for human review.

## Error Isolation

- Provider and Feishu API errors expose only typed operation/category information and optional HTTP/code values.
- Inbox error storage uses `Error.message` only, removes configured secrets, Bearer values, URLs and credential-like key/value text, collapses line breaks, and caps the result at 240 characters.
- Failure updating one Inbox record does not stop subsequent pending records; a failed failure-status write is contained so the batch summary still returns.

## Verification

- Focused unit tests: 3 files passed, 48 tests passed.
- Full `npm test`: 12 files passed, 289 tests passed.
- Script and focused-test TypeScript check: passed.
- `npm run check`: 48 files checked; 0 errors, 0 warnings, 0 hints.
- `npm run build`: 13 static pages generated.
- `git diff --check`: passed.
