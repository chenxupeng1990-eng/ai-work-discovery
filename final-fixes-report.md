# Final Fixes Report: Secure Asset Pipeline, Round 2

## Scope

Completed the second whole-branch asset pipeline fix round from starting HEAD `65bc644`. Changes are limited to the metadata transport exports, asset retrieval and normalization, dataset publication, sync output wiring, dependency/workflow contracts, focused tests, and this report. No UI files were changed.

## Public Network Transport

- Asset downloads no longer use the global Fetch implementation.
- `fetch-metadata.ts` now exports its existing default resolver, pinned Undici transport factory, and public-target resolver without changing metadata behavior.
- Every asset URL and redirect hop must use HTTPS, contain no URL credentials, and resolve entirely to public addresses.
- Each hop creates a transport whose TCP/TLS lookup is pinned to the resolver-approved address set while the original hostname remains in the request URL for Host and SNI handling.
- Requests use manual redirects, a five-hop limit, one total ten-second deadline, `credentials: "omit"`, an empty referrer, and no authorization or cookie headers.
- Redirect transports are closed before the next hop. The active transport is destroyed on request, validation, streaming, timeout, or redirect errors.
- Unit tests use controlled resolvers and transports only; no asset test performs a live network request.

## Image Normalization

- Added `sharp` as a direct runtime dependency.
- Download input remains streamed to disk with MIME, magic-byte, declared-length, and observed-length enforcement at 8 MB.
- Images are decoded with fixed dimension, pixel-count, and single-page limits before publication.
- Valid inputs are auto-oriented and encoded as deterministic WebP with fixed encoder parameters.
- Metadata is stripped by default, including EXIF/GPS, XMP, ICC, and comments. Tests verify both sharp metadata and marker-byte absence for generated JPEG and PNG inputs.
- Normalized output is checked against the 8 MB limit, hashed after normalization, and written only as `/images/content/<sha256>.webp`.
- Invalid and oversized decoded images are rejected. Repeated normalization of the same input produces the same path and bytes.

## Transactional Publication And Pruning

- Added `publishDatasetAtomically` for the default filesystem output while preserving `writePublicDataset` for injected in-memory and narrow output tests.
- The candidate dataset is fsynced and schema-validated before publication.
- The previous `content.json` is moved to a quarantine directory outside `public`, then the candidate dataset is renamed into place.
- Only root-level hash-named JPEG, PNG, or WebP files are controlled for pruning. Unknown files are preserved.
- Assets referenced by the new dataset are never moved. Retired or replaced controlled assets are moved to quarantine and deleted only after the transaction succeeds.
- A move failure restores every moved asset and the prior dataset. A dataset replace failure occurs before pruning and restores the prior dataset.
- The default sync output now uses transactional publication. Injected `SyncOutput` behavior is unchanged.
- The sync workflow stages additions, modifications, and deletions with `git add -A -- apps/web/src/generated/content.json apps/web/public/images/content`.

## Verification

Run from `apps/web`:

| Command | Result |
| --- | --- |
| `npm test -- tests/unit/fetch-metadata.test.ts tests/unit/build-dataset.test.ts tests/unit/sync-content.test.ts tests/unit/workflows.test.ts` | PASS: 4 files, 141 tests |
| `npm test` | PASS: 16 files, 495 tests |
| `npm run typecheck` | PASS |
| `npm run sync:content:check` | PASS |
| `npm run check` | PASS: 59 files, 0 errors, 0 warnings, 0 hints |
| `npm run build` | PASS: 13 static pages |
| `npm run verify:public` | PASS: 32 dist files and 1 tracked public text artifact scanned |
| `npm run test:e2e -- --reporter=line` | PASS: 62 passed, 2 existing project-specific skips |

## Acceptance Boundary

The network security tests intentionally use controlled transports and resolvers so they can prove DNS filtering, lookup pinning, redirect behavior, and transport cleanup without depending on external DNS or third-party availability.
