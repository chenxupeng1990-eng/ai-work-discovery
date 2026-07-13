# Task 5 Review Fix Report

## Review Findings

The previous Task 5 implementation left three review issues unresolved:

1. `ContentCard.astro` applied `height: 100%` to both the card and its inner grid. Equal-height grid rows stretched card images away from their declared `16 / 10` ratio.
2. The AI 风向 section selected recent items by `originalUrl`, so Skill and Tool entries appeared as signals while the fixture dataset contained only one genuine `AI Signal`.
3. `vitest.config.ts` did not limit test discovery, so the standard `npm test` gate collected the Playwright E2E suite and failed.

The earlier report documented the Vitest failure and the one-signal fixture limitation as accepted state. This review fixes both instead of retaining them as caveats.

## RED Evidence

- Added desktop and mobile Playwright measurements for all five content-card images with an accepted rendered ratio of `1.58` to `1.62`.
  - Before the fix, representative ratios were approximately `1.06` on desktop and `0.95` on mobile.
- Added an E2E assertion that AI 风向 links exactly match the most recent fixture items whose type is `AI Signal`.
  - Before the fix, the section rendered four links: three Skill/Tool links plus the single real signal link.
- Added unit assertions requiring three to five genuine AI Signal fixtures, synchronized public JSON, and `tests/unit/**/*.test.ts` as the Vitest include pattern.
  - Before the fix, the fixture count was `1`, `public/data/content.json` was absent, and the Vitest include value was undefined.

## Fixes

- Removed the card and inner-grid `height: 100%` rules. Card images now use `width: 100%`, `height: auto`, `aspect-ratio: 16 / 10`, `object-fit: cover`, and `align-self: start`.
- Changed homepage signal selection to filter strictly on `item.type === "AI Signal"` before applying the recent-item limit.
- Added two complete, public, non-sensitive AI Signal fixtures based on official OpenAI and Anthropic announcements. Existing Skill and Tool types were not renamed.
- Synchronized `src/generated/content.json` and `public/data/content.json` with the ten-item fixture dataset.
- Limited Vitest discovery to `tests/unit/**/*.test.ts`.

Homepage bounds remain one spotlight, five worth-trying cards, three AI signals, three ready-to-use items, and six recent updates.

## Verification

- `npm test`
  - Exit code 0.
  - 3 unit test files passed, 37 tests passed.
- `npm run test:e2e -- tests/e2e/home.spec.ts --project=desktop --project=mobile --reporter=line`
  - Exit code 0.
  - 9 tests passed and 1 desktop run of the mobile-only navigation test was skipped.
  - Both viewports verified content-card image ratios, AI Signal semantics, image loading, and no horizontal overflow.
- `npm run check`
  - Exit code 0.
  - 21 files checked with 0 errors, 0 warnings, and 0 hints.
- `npm run build`
  - Exit code 0.
  - Astro check passed and the static `/index.html` route built successfully.

## Files

- `apps/web/src/components/ContentCard.astro`
- `apps/web/src/pages/index.astro`
- `apps/web/src/data/fixtures.ts`
- `apps/web/src/generated/content.json`
- `apps/web/public/data/content.json`
- `apps/web/vitest.config.ts`
- `apps/web/tests/e2e/home.spec.ts`
- `apps/web/tests/unit/schema.test.ts`
- `apps/web/tests/unit/vitest-config.test.ts`
- `.superpowers/sdd/task-5-report.md`
