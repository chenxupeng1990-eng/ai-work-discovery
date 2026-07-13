# AI Work Discovery Task 7 Report

## Scope

- Baseline: `946540d14561119171beefe055334cc8ed6c3c30`
- Feature commit: `64963a4 feat: add content details and copy actions`
- Reviewed and retained the useful concurrent drafts for internal homepage/discovery links, CopyBlock behavior, detail layout, and Vitest unit-test collection.
- Renamed and standardized `FeishuPreviewCard.astro` as `FeishuDocumentCard.astro`.
- Consolidated detail E2E coverage into `apps/web/tests/e2e/detail.spec.ts`.

## Initial RED

- `npm test` failed because Vitest collected the new `.test.tsx` file without a React JSX transform.
- Detail E2E returned HTTP 500 because `getStaticPaths()` referenced a module-local parsed dataset that Astro did not retain in the isolated static-path scope.
- `npm run build` failed with `dataset is not defined` while generating detail routes.
- `/updates` did not exist.
- Static link scanning found shared navigation links to unimplemented `/cases`, `/collaboration`, `/resources`, and `/signals` routes.

## Implementation

- `getStaticPaths()` parses the generated public dataset inside its build-time scope and emits one path per validated item. No detail route fetches Feishu at request time.
- Detail pages render maintained content fields, ordered copy blocks, Feishu-first source actions, original-source fallback actions, and related content excluding the current item.
- All external source links use HTTPS dataset values, `target="_blank"`, and `rel="noopener noreferrer"`.
- CopyBlock uses `navigator.clipboard.writeText`, keeps a fixed `108 x 40` button, changes its accessible name only after success, exposes an alert on failure, and remains retryable.
- Code blocks scroll horizontally inside their own container without widening the page.
- `/updates` sorts by `updatedAt` descending and groups items by date directly from the public dataset.
- Homepage and discovery cards now link to `/content/<slug>`.
- Header navigation now contains only implemented routes, eliminating shared broken links.
- Vitest collects `tests/unit/**/*.test.{ts,tsx}` and excludes Playwright E2E files by directory.

## Verification

- `npm test`: 4 files passed, 48 tests passed.
- `npm run test:e2e -- tests/e2e/detail.spec.ts --project=desktop`: 8 passed.
- `npm run test:e2e -- tests/e2e/detail.spec.ts --project=mobile`: 8 passed.
- `npm run test:e2e`: 39 passed, 1 expected desktop skip, 0 failed.
- `npm run check`: 0 errors, 0 warnings, 0 hints.
- `npm run build`: 13 static pages generated.
- Cheerio static-link scan: 10 detail pages, `/updates` present, 0 broken internal links.

Generated detail routes:

1. `/content/feishu-bridge-team-entry`
2. `/content/storyboarding-ai-video-workflow`
3. `/content/codex-skills-practical-roundup`
4. `/content/agents-md-team-configuration`
5. `/content/ai-hot-agent-workflows-signal`
6. `/content/openai-agent-building-tools-signal`
7. `/content/anthropic-model-context-protocol-signal`
8. `/content/github-openai-skills-project`
9. `/content/ai-work-discovery-weekly-review`
10. `/content/codex-environment-dependency-checklist`
