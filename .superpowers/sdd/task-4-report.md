# Task 4 Implementation Report

## Scope

Implemented the AI Work Discovery visual foundation, shared layout, navigation, footer, homepage shell, and structural Playwright coverage. The Task 4 review fix is limited to the header, homepage E2E coverage, this report, and the homepage intro needed to remove broken placeholder fragments.

## TDD Process

1. Rewrote the inherited `apps/web/tests/e2e/home.spec.ts` as valid UTF-8 Chinese.
2. Ran the structural E2E before production changes.
3. Confirmed RED: the desktop test exited with code 1 because `getByRole("banner")` could not find the shared header at `home.spec.ts:6`.
4. Added the shared visual tokens and primitives, `BaseLayout`, header, footer, and homepage shell.
5. Ran the focused tests and corrected the mobile-visible `发现` entry while retaining a fixed-height header.
6. Re-ran desktop/mobile tests, Astro checks, production build, visual screenshots, forbidden-style scan, and staged diff review.

## Implementation Notes

- `BaseLayout` owns the document shell and the site's only `main` landmark.
- The header provides text navigation, an accessible search icon button with `aria-label` and `title`, a disabled `提交内容` command ready for a later submission flow, and an absolute-positioned mobile menu controlled by a real `button`.
- The mobile menu button owns `aria-controls="mobile-navigation"`, starts with `aria-expanded="false"`, and uses a minimal inline script to update `aria-expanded` while toggling the navigation's `hidden` state.
- Mobile navigation keeps the header at 64px and does not create horizontal overflow.
- The Task 4-only `#discover` and `#ready` intro CTAs were removed, and the previous `#submit` link became a disabled button so the current page contains no broken fragment commands without adding Task 5 content.
- Global styles define the approved colors, fixed typography, 1320px container, section/button/tag/grid primitives, and a 4px maximum radius except tags and circular icon geometry.
- No shadows, blur, decorative gradients, blobs, or negative letter spacing were added.

## Review Failure And Fix

- Before the fix, `npm run test:e2e -- tests/e2e/home.spec.ts --project=mobile` exited with code 1: 1 test passed and 1 failed after 5 seconds because Chromium did not expose the `<summary aria-label="打开导航">` as the requested button role.
- The failing assertion was `getByRole("button", { name: "打开导航" })`, confirming the review issue was semantic rather than a locator timeout problem.
- Replacing `<details>/<summary>` with a real button and explicitly controlled hidden navigation fixed the accessibility tree while preserving the fixed header layout.

## Verification

- `npm run test:e2e -- tests/e2e/home.spec.ts`
  - Exit code 0: 3 passed, 1 skipped.
  - Desktop and mobile structural coverage passed; the desktop project skipped only the mobile-specific behavior test.
  - The mobile test verified the button role, `aria-controls`, `aria-expanded="false"` before interaction, `aria-expanded="true"` after interaction, visible navigation, unchanged header height, and `document.documentElement.scrollWidth <= viewport.width`.
  - Playwright emitted only the existing `NO_COLOR`/`FORCE_COLOR` environment warning.
- `npm run check`
  - Exit code 0.
  - 16 files checked, 0 errors, 0 warnings, 0 hints.
- `npm run build`
  - Exit code 0.
  - Astro check passed with 0 errors, 0 warnings, and 0 hints; one static page (`/index.html`) was built.

## Changed Files

- `apps/web/src/styles/global.css`
- `apps/web/src/layouts/BaseLayout.astro`
- `apps/web/src/components/Header.astro`
- `apps/web/src/components/Footer.astro`
- `apps/web/src/pages/index.astro`
- `apps/web/tests/e2e/home.spec.ts`
- `.superpowers/sdd/task-4-report.md`

## Commit

- Implementation: `2bbb662` (`feat: add discovery site visual foundation`)
- Initial report: `971d4d9` (`docs: add task 4 implementation report`)
- Review fix: recorded in the commit containing this report update.
