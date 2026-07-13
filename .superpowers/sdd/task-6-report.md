# Task 6 Implementation Report

## Scope

Implemented the searchable and filterable discovery listing as one hydrated React island inside a static Astro route. The primary Discover navigation and Header search control navigate to `/discover`.

Task 6 does not create `/content/<slug>` routes. Discovery cards therefore use `feishuDocumentUrl ?? originalUrl` when a public source exists and render as non-link articles when neither URL exists. Task 7 can replace this temporary navigation with site detail routes.

## TDD Evidence

- Initial RED: the discovery E2E suite failed before `/discover`, its controls, cards, and empty state existed.
- Final review RED: the schema accepted non-HTTPS URL schemes, and the discovery fixture did not prove Feishu-source precedence when both URLs existed.
- Final review GREEN: public URLs use Zod's structured HTTPS protocol constraint; the AGENTS.md fixture retains its original source while adding the public WayToAGI Feishu document, and cards prefer that Feishu URL with `target="_blank"` plus independent `noopener` and `noreferrer` tokens.
- Sorting regression: the test records the first Featured card, selects Latest, verifies both `aria-pressed` states, and asserts the first card and full order against `updatedAt` sorting.

## Implementation

- Added Chinese keyword search, category chips, Featured/Latest sorting, stable `aria-pressed` states, and an `aria-live="polite"` result count.
- Added a resettable empty state and responsive discovery cards with fixed `16 / 10` image geometry.
- Removed premature `/content/<slug>` navigation from Task 6 cards.
- Added realistic, distinct ISO `updatedAt` values and synchronized `src/data/fixtures.ts`, `src/generated/content.json`, and `public/data/content.json`.
- Kept the discovery E2E independent of third-party availability by validating URL schema and external-link attributes locally without navigating to external sources.

## Verification

- `npm test`: 3 files passed, 46 tests passed.
- `npm run test:e2e -- tests/e2e/discover.spec.ts`: 14 tests passed across desktop and mobile.
- `npm run test:e2e -- tests/e2e/home.spec.ts`: 9 tests passed; 1 desktop run of the mobile-only navigation test was skipped as expected.
- `npm run check`: 24 files checked with 0 errors, 0 warnings, and 0 hints.
- `npm run build`: static `/index.html` and `/discover/index.html` routes built successfully.
- Dataset equality and schema validation are covered by `tests/unit/schema.test.ts`.
- Discovery E2E asserts there are no `href="#..."` or `/content/...` links.

## Commits

- Initial implementation: `efc1a0f0767f5adbb614969d4440ae71bf3b2651` (`feat: add searchable discovery page`).
- Review fix: `fix: verify discovery navigation and sorting`.

## Files

- `apps/web/src/components/DiscoveryExplorer.tsx`
- `apps/web/src/data/fixtures.ts`
- `apps/web/src/generated/content.json`
- `apps/web/public/data/content.json`
- `apps/web/tests/e2e/discover.spec.ts`
- `apps/web/tests/unit/schema.test.ts`
- `.superpowers/sdd/task-6-report.md`
