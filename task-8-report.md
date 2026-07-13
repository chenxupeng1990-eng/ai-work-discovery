# AI Work Discovery Task 8 Report

## Scope

- Baseline: `38e68415baa9d75c4e32dfecec89f1211bd7a39a`
- Commit message: `feat: add Feishu content adapter`
- Added sync environment validation, centralized Base field constants, a native-fetch Feishu client, raw-record mapping, and focused unit coverage.
- No frontend pages, components, generated content, or fixture content were modified.

## RED / GREEN

### Initial RED

- `npm test -- tests/unit/map-records.test.ts tests/unit/config.test.ts tests/unit/feishu-client.test.ts` failed because all three adapter modules were absent.
- The first security refinement test failed because an HTTPS AI base URL containing URL credentials was accepted.
- A mapper regression test failed because an invalid Copy Block linked only to a draft was parsed before publication filtering.

### GREEN

- Added exact Zod parsing for all nine sync variables. Errors identify invalid variable names without serializing input values.
- Added HTTPS-only, no-URL-credentials validation for `AI_BASE_URL`; production validation remains strict and tests inject an HTTPS Feishu API origin.
- Added a native-fetch client with tenant token acquisition, expiry-aware process caching, encoded Base paths and page tokens, pagination, record creation, and typed failures for HTTP, Feishu-code, response-shape, and JSON errors.
- Added a raw record contract `{ record_id, fields }` and a mapper that filters before parsing publishable fields or related Copy Blocks.
- Added explicit Base field allowlisting, linked-record joins, stable Copy Block sorting, structured attachment parsing, controlled local asset targets, and per-item `ContentItemSchema` validation.

## Mapping Decisions

- Publication requires both `发布状态=已发布` and `公开级别=公开`. Draft, forbidden, and desensitized records are excluded for this task.
- Attachments must be Base attachment objects containing a credential-free HTTPS `url` or `tmp_url`; arbitrary strings are rejected.
- The mapper converts a validated attachment source into a deterministic `/images/content/<record-id>/<safe-name>` target accepted by `ContentItemSchema`. Task 9 remains responsible for downloading the source and writing that target.
- Unknown Base fields and internal publication fields are never copied into the returned `ContentItem`.
- Copy Blocks are parsed only when they link to a publishable content record, so malformed draft-only blocks cannot stop public mapping.

## Security Review

- Configuration errors contain field names only; Feishu app secrets and AI API keys are not included in error text.
- Feishu errors expose only operation, HTTP status, or numeric API code. They do not include request headers, bearer tokens, app secrets, app tokens, response messages, or request bodies.
- All configured or mapped URLs require HTTPS and reject embedded username/password credentials.
- Base app token, table id, and pagination token are encoded before entering request URLs.
- Public mapper output is created from explicit properties and validated by a strict schema, preventing unknown, draft, public-level, or inbox fields from leaking.

## Verification

- Target unit tests: 3 files passed, 25 tests passed.
- Full `npm test`: 7 files passed, 73 tests passed.
- Script TypeScript check: passed with `tsc --noEmit --ignoreConfig` and explicit bundler settings.
- `npm run check`: 0 errors, 0 warnings, 0 hints.
- `npm run build`: 13 static pages generated.
