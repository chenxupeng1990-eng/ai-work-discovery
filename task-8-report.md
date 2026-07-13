# AI Work Discovery Task 8 Report

## Scope

- Baseline: `38e68415baa9d75c4e32dfecec89f1211bd7a39a`
- Original commit message: `feat: add Feishu content adapter`
- Review fix commit message: `fix: harden Feishu client boundaries`
- Added sync environment validation, centralized Base field constants, a native-fetch Feishu client, raw-record mapping, and focused unit coverage.
- Review fixes make list pagination response validation strict and reject credentials in the Feishu API base URL.
- No frontend pages, components, generated content, or fixture content were modified.

## RED / GREEN

### Initial RED

- `npm test -- tests/unit/map-records.test.ts tests/unit/config.test.ts tests/unit/feishu-client.test.ts` failed because all three adapter modules were absent.
- The first security refinement test failed because an HTTPS AI base URL containing URL credentials was accepted.
- A mapper regression test failed because an invalid Copy Block linked only to a draft was parsed before publication filtering.
- Review regression tests failed because missing or string `data.has_more` values silently ended pagination and a Feishu API base URL containing credentials was accepted. Existing checks already rejected non-array `data.items` and `has_more=true` without a non-empty `page_token`.

### GREEN

- Added exact Zod parsing for all nine sync variables. Errors identify invalid variable names without serializing input values.
- Added HTTPS-only, no-URL-credentials validation for `AI_BASE_URL`; production validation remains strict and tests inject an HTTPS Feishu API origin.
- Added a native-fetch client with tenant token acquisition, expiry-aware process caching, encoded Base paths and page tokens, pagination, record creation, and typed failures for HTTP, Feishu-code, response-shape, and JSON errors.
- List pages now require `data.items` to be an array and `data.has_more` to be a boolean on every page. When `has_more` is true, `data.page_token` must be a non-empty string; when false, the token is ignored.
- Feishu API base URLs now require HTTPS and reject any URL username or password with a credential-free error message.
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
- All configured or mapped URLs require HTTPS and reject embedded username/password credentials, including the Feishu client's injectable API base URL.
- Base app token, table id, and pagination token are encoded before entering request URLs.
- Public mapper output is created from explicit properties and validated by a strict schema, preventing unknown, draft, public-level, or inbox fields from leaking.

## Verification

- Target unit tests: 3 files passed, 30 tests passed.
- Full `npm test`: 7 files passed, 78 tests passed.
- Script TypeScript check: passed with `npx tsc --noEmit --ignoreConfig scripts/config.ts scripts/feishu/client.ts scripts/feishu/fields.ts scripts/feishu/map-records.ts --module ESNext --moduleResolution Bundler --target ES2022 --lib ES2022,DOM --types node --skipLibCheck`.
- `npm run check`: 37 files checked; 0 errors, 0 warnings, 0 hints.
- `npm run build`: 13 static pages generated.
