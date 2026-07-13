# AI Work Discovery Task 10 Report

## Scope

- Baseline: `5aa892845e82ccad21b998e98e2561bb2bd9c606`.
- Added deterministic inbox source detection and bounded public metadata retrieval.
- Added focused unit coverage for detection, default pinned transport wiring, SSRF controls, redirects, timeout and size limits, stream cancellation, encoding, and metadata extraction.
- Added `undici` for per-request dispatchers and `ipaddr.js` for standards-aware IP parsing; `cheerio` remains the static HTML parser.
- No UI, fixture, generated dataset, Feishu adapter, or publication pipeline files were modified.

## RED / GREEN

### RED

- `npm test -- tests/unit/detect-source.test.ts` failed because `scripts/inbox/detect-source.ts` did not exist.
- `npm test -- tests/unit/fetch-metadata.test.ts` failed because `scripts/inbox/fetch-metadata.ts` did not exist.
- A follow-up boundary test proved that an English imperative beginning with `Build` was incorrectly classified as `text`.
- A follow-up size-limit test proved that a declared response larger than 2 MB was rejected without cancelling its body or aborting its request.
- Final intent regressions proved that command-shaped explanation requests such as `tell me what it means`, `interpret the output`, `describe the result`, and Chinese `说明内容` were still classified as `code`.
- Final transport regressions proved that the production `undici` transport wiring was private and therefore could not directly verify preservation of the original hostname URL, pinned dispatcher injection, or dispatcher lifecycle without real networking.

### GREEN

- `detectSource` trims input, rejects empty or over-limit values, normalizes HTTP(S) URLs, and uses URL parsing before text heuristics.
- Feishu/Lark, GitHub, and AI HOT recognition uses exact-domain or dot-delimited subdomain checks; lookalike suffixes remain ordinary `web` URLs.
- Code classification is limited to complete fenced blocks and one full-line anchored command form. Fenced code keeps priority, while non-fenced single-line explanation, interpretation, description, summary, help, question, and analysis requests in English or Chinese classify as prompts before command detection.
- Request markers remain bounded to explicit words or phrases, so ordinary `npm install astro`, `git status`, and `curl https://example.com` inputs remain `code`.
- Questions and bounded English or Chinese request semantics classify as `prompt`; remaining input classifies as `text`.
- `fetchPublicMetadata` accepts only credential-free public HTTP(S), uses manual redirects with at most five hops, and creates a newly resolved, separately pinned transport for every request hop.
- The production transport remains real `undici.fetch` plus `undici.Agent`, constructed through an exported dependency-injected factory so default wiring can be tested without network access.
- Requests use `credentials: "omit"`, an empty referrer, no cookie or authorization headers, one 10-second abort controller, and a streamed 2 MB limit.
- Cheerio statically parses accepted HTML without executing scripts. Explicit `text/plain` is cleaned as text and is never parsed as HTML.
- Extracted title and description follow deterministic metadata precedence, whitespace cleanup, and length bounds. Canonical and image candidates are relatively resolved and returned only when they are credential-free public HTTP(S) URLs.

## SSRF Validation

- Rejected URL credentials, non-HTTP(S) schemes, localhost names, and non-public IPv4/IPv6 ranges using `ipaddr.js` plus an explicit allow-public policy. Coverage includes unspecified, loopback, private/unique-local, CGNAT, link-local, multicast, reserved, benchmarking, documentation, IPv4-mapped, site-local, Teredo, 6to4, AMT, AS112, and other non-direct ranges.
- Resolved every hostname before transport creation and rejected the hostname when any returned address was non-public. The approved address set is frozen into an `undici.Agent` `connect.lookup`, so the actual TCP/TLS connection cannot perform an unconstrained second DNS lookup.
- Kept the original URL hostname for HTTP Host, TLS SNI, and certificate validation. The pinned connection lookup rejects hostname changes and can return only the approved address set.
- Direct factory regressions prove that the Agent factory receives the target's pinned lookup, the fetch call keeps the original hostname URL, and the resulting dispatcher is passed in request options. The fetch stub asserts dispatcher identity, so omitting or bypassing it fails the test.
- Re-resolved each redirect target and created a new pinned dispatcher before the next request. Redirect and final-response transports are closed after their bodies finish; validation, timeout, and request failures destroy the active dispatcher.
- Error messages report only the failure category or HTTP status and do not echo credential-bearing source or redirect URLs.
- Unsafe or unresolvable canonical and image candidates are skipped rather than returned.

## Boundary Validation

- Detection tests cover URL precedence, hostname spoofing, trim and maximum length, empty input, fenced-code priority, one-line command grammar, broad but bounded command-shaped explanation requests in English and Chinese, plain-command negative cases, questions, instructions, and fallback text.
- Retrieval tests cover direct default transport construction, dispatcher injection, original hostname URL preservation, response close and error destroy behavior, pinned connection lookup behavior, all-address DNS checks, public/non-public IPv4 and IPv6 boundaries, per-hop resolver/transport creation, request header policy, unsafe redirects, non-2xx responses, unsupported content types, malformed UTF-8, total timeout, declared and streamed 2 MB limits, observable cancellation, and request abort.
- URL tests apply the 2,048-character limit to normalized initial URLs, resolved redirect locations, and resolved canonical/image candidates. Metadata tests also cover Open Graph, Twitter, and document precedence, unsafe candidate skipping, output text bounds, whitespace cleanup, and non-HTML handling for `text/plain`.

## Verification

- Target unit tests: 2 files passed, 137 tests passed.
- Full `npm test`: 10 files passed, 251 tests passed.
- Script and focused-test TypeScript check: passed with `npx tsc --noEmit --ignoreConfig scripts/inbox/detect-source.ts scripts/inbox/fetch-metadata.ts tests/unit/detect-source.test.ts tests/unit/fetch-metadata.test.ts --module ESNext --moduleResolution Bundler --target ES2022 --lib ES2022,DOM --types node,vitest/globals --skipLibCheck`.
- `npm run check`: 44 files checked; 0 errors, 0 warnings, 0 hints.
- `npm run build`: 13 static pages generated.
