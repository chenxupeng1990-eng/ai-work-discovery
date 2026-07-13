# AI Work Discovery Task 9 Report

## Scope

- Baseline: `f99c079b0f7452efe8bedcd1c87f8af7e0007f8c`
- Added the bounded public image downloader, deterministic public dataset builder, atomic generated dataset writer, focused unit coverage, and seven type-specific WebP fallbacks.
- No UI pages, components, fixture data, generated `content.json`, or sync orchestration were modified.

## RED / GREEN

### RED

- `npm test -- tests/unit/build-dataset.test.ts` failed because `scripts/publish/assets.ts` and `scripts/publish/build-dataset.ts` did not exist.
- The first implementation run exposed a Vitest `import.meta.url` incompatibility before tests could execute; fixed paths now resolve from the `apps/web` script working directory.
- The first full `astro check` found a test-only `Uint8Array`/`BodyInit` type mismatch; the response helper now converts test bytes to an `ArrayBuffer`.

### GREEN

- `downloadAsset` accepts credential-free HTTPS only, validates the final redirect URL, requires a 2xx response, and allows only JPEG, PNG, or WebP declarations with matching magic bytes.
- A 10-second `AbortController` timeout covers retrieval. `Content-Length` rejects known oversize assets before processing, while streamed byte counting stops unknown-length responses above 8 MB without unbounded buffering.
- Asset bytes are streamed into a fixed `public/images/content` temporary file, fsynced, named by SHA-256 plus a controlled extension, and atomically renamed. Existing identical hashes are reused and all failure paths remove temporary files.
- `buildPublicDataset` copies only explicit `ContentItem` and `CopyBlock` public keys. Remote sources are supplied separately by controlled target path, so raw records and private publication metadata cannot enter the public item structure.
- Missing or failed cover downloads select a real type-specific WebP fallback. Successful download results must remain under `/images/content/` and pass `ContentItemSchema` as part of the final `PublicDatasetSchema` validation.
- Dataset order is deterministic: `sortWeight` descending, `updatedAt` descending, then `id` ascending. `generatedAt` supports an injected clock.
- `writePublicDataset` writes `content.tmp.json` with exclusive creation, fsyncs it, reads and parses it with `PublicDatasetSchema`, then renames it to `content.json`. Validation or rename failure removes the temp file and leaves the old target unchanged.

## Security Tests

- Rejected HTTP source URLs and URLs containing username/password credentials.
- Rejected a final redirect URL that downgraded to HTTP.
- Rejected non-2xx responses, missing/unknown/disallowed content types, and mismatched JPEG/PNG/WebP signatures.
- Verified both declared and streamed 8 MB limits and the 10-second abort path.
- Verified SHA-256 filenames, controlled extensions, path confinement, and duplicate hash reuse.
- Verified private keys are absent from serialized output and downloaded paths outside `/images/content/` are rejected.
- Verified failed dataset validation removes `content.tmp.json` and preserves the previous `content.json` byte-for-byte.
- Verified successful output survives a `PublicDatasetSchema` roundtrip.

## Fallback Asset Validation

`ffprobe` decoded every fallback as WebP at `1200x675`; direct signature inspection returned `RIFF` at bytes 0-3 and `WEBP` at bytes 8-11.

- `fallback-ai-signal.webp`: 2564 bytes
- `fallback-case.webp`: 2758 bytes
- `fallback-collaboration.webp`: 2808 bytes
- `fallback-getting-started.webp`: 2736 bytes
- `fallback-inspiration.webp`: 2492 bytes
- `fallback-skill.webp`: 2404 bytes
- `fallback-tool.webp`: 2694 bytes

## Verification

- Target unit test: 1 file passed, 29 tests passed.
- Full `npm test`: 8 files passed, 107 tests passed.
- Script TypeScript check: passed with `npx tsc --noEmit --ignoreConfig scripts/publish/assets.ts scripts/publish/build-dataset.ts --module ESNext --moduleResolution Bundler --target ES2022 --lib ES2022,DOM --types node --skipLibCheck`.
- `npm run check`: 40 files checked; 0 errors, 0 warnings, 0 hints.
- `npm run build`: 13 static pages generated.
