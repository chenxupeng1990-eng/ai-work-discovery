# AI Work Discovery Task 10 Report

## Scope

- Baseline: `5aa892845e82ccad21b998e98e2561bb2bd9c606`.
- Added deterministic inbox source detection and bounded public metadata retrieval.
- Added focused unit coverage for detection, SSRF controls, redirects, timeout and size limits, stream cancellation, encoding, and metadata extraction.
- `cheerio` was already present in `package.json` and `package-lock.json` at the baseline, so no dependency files changed.
- No UI, fixture, generated dataset, Feishu adapter, or publication pipeline files were modified.

## RED / GREEN

### RED

- `npm test -- tests/unit/detect-source.test.ts` failed because `scripts/inbox/detect-source.ts` did not exist.
- `npm test -- tests/unit/fetch-metadata.test.ts` failed because `scripts/inbox/fetch-metadata.ts` did not exist.
- A follow-up boundary test proved that an English imperative beginning with `Build` was incorrectly classified as `text`.
- A follow-up size-limit test proved that a declared response larger than 2 MB was rejected without cancelling its body or aborting its request.

### GREEN

- `detectSource` trims input, rejects empty or over-limit values, normalizes HTTP(S) URLs, and uses URL parsing before text heuristics.
- Feishu/Lark, GitHub, and AI HOT recognition uses exact-domain or dot-delimited subdomain checks; lookalike suffixes remain ordinary `web` URLs.
- Code classification is limited to complete fenced blocks and anchored common command forms. Natural-language mentions of `npm` or `git` remain text.
- Questions and bounded English or Chinese instruction prefixes classify as `prompt`; remaining input classifies as `text`.
- `fetchPublicMetadata` accepts only credential-free public HTTP(S), uses manual redirects with at most five hops, and repeats URL plus DNS safety validation before every request.
- Requests use `credentials: "omit"`, an empty referrer, no cookie or authorization headers, one 10-second abort controller, and a streamed 2 MB limit.
- Cheerio statically parses accepted HTML without executing scripts. Explicit `text/plain` is cleaned as text and is never parsed as HTML.
- Extracted title and description follow deterministic metadata precedence, whitespace cleanup, and length bounds. Canonical and image candidates are relatively resolved and returned only when they are credential-free public HTTP(S) URLs.

## SSRF Validation

- Rejected URL credentials, non-HTTP(S) schemes, localhost names, IPv4 and IPv6 literals in loopback, private, carrier-grade NAT, link-local, documentation, benchmarking, multicast, and reserved ranges.
- Resolved every hostname through an injectable resolver and rejected the hostname when any returned address was non-public, covering mixed public/private DNS answers used in rebinding attacks.
- Revalidated each redirect target before the next fetch; tests cover relative redirects, private-address redirects, and the five-hop ceiling.
- Error messages report only the failure category or HTTP status and do not echo credential-bearing source or redirect URLs.
- Unsafe or unresolvable canonical and image candidates are skipped rather than returned.

## Boundary Validation

- Detection tests cover URL precedence, hostname spoofing, trim and maximum length, empty input, fenced code, common commands, natural-language command words, questions, instructions, and fallback text.
- Retrieval tests cover request header policy, all-address DNS checks, unsafe redirects, non-2xx responses, unsupported content types, malformed UTF-8, total timeout, declared and streamed 2 MB limits, observable cancellation, and request abort.
- Metadata tests cover Open Graph, Twitter, and document metadata precedence; relative canonical/image resolution; unsafe candidate skipping; output text bounds; whitespace cleanup; and non-HTML handling for `text/plain`.

## Verification

- Target unit tests: 2 files passed, 88 tests passed.
- Full `npm test`: 10 files passed, 202 tests passed.
- Script TypeScript check: passed with `npx tsc --noEmit --ignoreConfig scripts/inbox/detect-source.ts scripts/inbox/fetch-metadata.ts --module ESNext --moduleResolution Bundler --target ES2022 --lib ES2022,DOM --types node --skipLibCheck`.
- `npm run check`: 44 files checked; 0 errors, 0 warnings, 0 hints.
- `npm run build`: 13 static pages generated.
