# Task 5 Implementation Report

## Scope

Built the discovery-first homepage from the existing eight-item fixture dataset. The homepage renders one full-width spotlight, five worth-trying cards, four externally sourced AI signal entries, three ready-to-use resources, and six recent updates without introducing detail-route placeholders.

## RED

1. Extended `apps/web/tests/e2e/home.spec.ts` before production changes with assertions for the literal H1, required section headings, bounded item counts, local fixture images, valid external content links, absence of `学习进度`, first-viewport visibility of the next section, and horizontal overflow.
2. Ran `npx playwright test tests/e2e/home.spec.ts --grep "bounded discovery" --project=desktop --reporter=line`.
3. Confirmed exit code 1. The test failed at `home.spec.ts:18` because the required `AI 工作灵感与实践` H1 did not exist.

## GREEN

- Added `FeaturedSpotlight.astro` with the selected fixture image as a full-width background, a solid contrast layer, fixed 48px/36px H1 sizes, eager image loading, explicit dimensions, and direct text overlay without a card.
- Added `ContentCard.astro` with a stable `16 / 10` image ratio, 4px radius, lazy loading, fixed image dimensions, stable metadata row, and no shadow.
- Added flat-list `AISignals.astro` and three-item `ReadyToUse.astro` sections.
- Composed the homepage with deterministic data selection through `getFeatured` and `getRecent`.
- Rendered content anchors only when a real `originalUrl` exists. Items awaiting the later detail route remain non-interactive instead of linking to a missing route or fragment.
- Re-ran the desktop and mobile homepage E2E projects. Desktop passed 3 tests with the mobile-only test skipped; mobile passed all 4 tests.

## Command Results

- `npm run test:e2e -- tests/e2e/home.spec.ts`
  - Exit code 0.
  - 7 passed, 1 desktop-only conditional skip.
  - Both projects verified headings, item counts, local images, valid content links, no `学习进度`, no horizontal overflow, and a visible next-section hint.
- `npm test`
  - Exit code 1 because the current Vitest configuration also collects `tests/e2e/home.spec.ts` and Playwright rejects `test()` under Vitest.
  - The actual unit suites passed: 34 tests passed across 2 unit files.
  - The same E2E file passed independently under Playwright as recorded above.
- `npm run check`
  - Exit code 0.
  - 20 files checked, 0 errors, 0 warnings, 0 hints.
- `npm run build`
  - Exit code 0.
  - Astro check passed and one static route, `/index.html`, was built.

## Screenshots And Visual Check

- Desktop: `.superpowers/sdd/screenshots/task-5-desktop.png`, 1440 x 1000 viewport.
- Mobile: `.superpowers/sdd/screenshots/task-5-mobile.png`, Pixel 7 emulation at 412 x 839.
- The worth-trying section begins at 751px on desktop and 645px on mobile, leaving a visible hint in both initial viewports.
- Document scroll width matched viewport width at both sizes: 1440px desktop and 412px mobile.
- Fixture images rendered in the spotlight and all five cards. Long Chinese titles wrapped without covering metadata or adjacent content.
- No nested cards, shadows, blur, gradients, decorative blobs, viewport-scaled fonts, or negative letter spacing were observed.

## Self-Review

- `git diff --check` passed before the implementation commit.
- Static scans found no forbidden style patterns and no Task 5 fragment links.
- Homepage counts remain deliberately bounded at 1 / 5 / 4 / 3 / 6.
- The fixture set contains one item typed `AI Signal`; the four-item AI 风向 feed therefore uses the existing items that have public `originalUrl` values and recommendation reasons. No fixture data was invented or expanded.
- Changes are limited to the four Task 5 components, homepage composition, E2E coverage, and this report.

## Files

- `apps/web/src/components/FeaturedSpotlight.astro`
- `apps/web/src/components/ContentCard.astro`
- `apps/web/src/components/AISignals.astro`
- `apps/web/src/components/ReadyToUse.astro`
- `apps/web/src/pages/index.astro`
- `apps/web/tests/e2e/home.spec.ts`
- `.superpowers/sdd/task-5-report.md`

## Commit

- Implementation: `44ac577` (`feat: build discovery-first homepage`)
