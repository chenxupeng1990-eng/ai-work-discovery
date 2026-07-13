# Task 6 Implementation Report

## Scope

Implemented the searchable and filterable discovery listing as one hydrated React island inside a static Astro route. The change also makes both the primary Discover navigation and Header search control navigate to `/discover`.

## TDD Evidence

- RED: `npm run test:e2e -- tests/e2e/discover.spec.ts` ran 12 desktop/mobile tests before implementation; 11 failed because `/discover` had no searchbox, category controls, sort controls, cards, or empty state, while the desktop overflow check alone passed against the missing route.
- RED: `npm run test:e2e -- tests/e2e/discover.spec.ts --project=desktop --grep "header search"` failed because Header search was still a button instead of a link to `/discover`.
- After implementation, the focused discovery suite passed in both desktop and mobile projects: 14 tests passed.

## Implementation

- Added `DiscoveryExplorer.tsx` with one `{ query, category, sort }` state object.
- Derived categories and filtered/sorted results with `useMemo`; result matching delegates to the existing `queryContent` helper.
- Added Chinese keyword search, category chips, Featured/Latest segmented sorting, stable `aria-pressed` states, and an `aria-live="polite"` result count.
- Added a resettable empty state and detail links using `/content/<slug>`.
- Added the static `/discover` Astro route, schema-validating `public/data/content.json` before passing serialized items into the single `client:load` island.
- Added flat, shadow-free discovery cards with a fixed `16 / 10` image ratio, maximum `4px` card/input/control radius, and responsive four/three/two/one-column layouts without horizontal overflow.
- Changed Header Discover and search links to navigate to `/discover` and updated the home regression assertion.

## Verification

- `npm test`
  - Exit code 0.
  - 3 unit test files passed, 37 tests passed.
- `npm run test:e2e -- tests/e2e/discover.spec.ts`
  - Exit code 0.
  - 14 tests passed across desktop and mobile.
- `npm run test:e2e -- tests/e2e/home.spec.ts`
  - Exit code 0.
  - 9 tests passed; the desktop run of the mobile-only navigation test was skipped as expected.
- `npm run check`
  - Exit code 0.
  - 24 files checked with 0 errors, 0 warnings, and 0 hints.
- `npm run build`
  - Exit code 0.
  - Static `/index.html` and `/discover/index.html` routes built successfully.
- `npm run test:e2e`
  - Exit code 0.
  - 23 tests passed across desktop and mobile; the desktop run of the mobile-only navigation test was skipped as expected.
- Playwright desktop/mobile full-page capture
  - Desktop document width matched its 1440px viewport.
  - Mobile document width matched its 412px viewport.
  - Visual inspection confirmed stable controls, fixed 16:10 cards, and no text overlap.

## Commit

- Implementation commit: `efc1a0f0767f5adbb614969d4440ae71bf3b2651` (`feat: add searchable discovery page`)

## Files

- `apps/web/src/components/DiscoveryExplorer.tsx`
- `apps/web/src/components/Header.astro`
- `apps/web/src/pages/discover.astro`
- `apps/web/tests/e2e/discover.spec.ts`
- `apps/web/tests/e2e/home.spec.ts`
- `.superpowers/sdd/task-6-report.md`
