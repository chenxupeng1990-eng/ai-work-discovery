# Task 4 Implementation Report

## Scope

Implemented the AI Work Discovery visual foundation, shared layout, navigation, footer, homepage shell, and structural Playwright coverage. No files outside the assigned Task 4 paths were changed.

## TDD Process

1. Rewrote the inherited `apps/web/tests/e2e/home.spec.ts` as valid UTF-8 Chinese.
2. Ran the structural E2E before production changes.
3. Confirmed RED: the desktop test exited with code 1 because `getByRole("banner")` could not find the shared header at `home.spec.ts:6`.
4. Added the shared visual tokens and primitives, `BaseLayout`, header, footer, and homepage shell.
5. Ran the focused tests and corrected the mobile-visible `发现` entry while retaining a fixed-height header.
6. Re-ran desktop/mobile tests, Astro checks, production build, visual screenshots, forbidden-style scan, and staged diff review.

## Implementation Notes

- `BaseLayout` owns the document shell and the site's only `main` landmark.
- The header provides text navigation, an accessible search icon button with `aria-label` and `title`, a `提交内容` action, and an absolute-positioned native mobile menu.
- Mobile navigation keeps the header at 64px and does not create horizontal overflow.
- Global styles define the approved colors, fixed typography, 1320px container, section/button/tag/grid primitives, and a 4px maximum radius except tags and circular icon geometry.
- No shadows, blur, decorative gradients, blobs, or negative letter spacing were added.

## Verification

- `npm run test:e2e -- tests/e2e/home.spec.ts`
  - Desktop and mobile structural coverage passed.
  - Mobile menu height and overflow coverage passed on the mobile project.
  - The desktop project skipped the mobile-only behavior test as intended.
  - Playwright emitted only the existing `NO_COLOR`/`FORCE_COLOR` environment warning.
- `npm run check`
  - Exit code 0.
  - 16 files checked, 0 errors, 0 warnings, 0 hints.
- `npm run build`
  - Exit code 0.
  - Astro check passed and one static page (`/index.html`) was built.
- Desktop 1440x1000 and mobile 412x915 screenshots were inspected; header controls fit, mobile navigation overlays without resizing the header, and no incoherent overlap or horizontal overflow was observed.
- `git diff --cached --check`
  - Exit code 0 before the implementation commit.

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
- Report: recorded in the follow-up documentation commit containing this file.
