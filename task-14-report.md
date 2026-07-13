# Task 14 Final Release Acceptance Report

## Scope

Completed final public-release acceptance for AI Work Discovery from starting HEAD `c15eba4`, limited to E2E/security coverage, two requested unit regressions, release scanning, and narrow accessibility/test-server fixes. No product feature or visual redesign was added.

## Release Gate

Run from `apps/web` in this order:

1. `npm test` - PASS, 15 files and 320 tests.
2. `npm run typecheck` - PASS.
3. `npm run check` - PASS, 0 errors, 0 warnings, 0 hints.
4. `npm run build` - PASS, 13 static pages generated.
5. `npm run verify:public` - PASS, 32 `dist` files scanned.
6. `npm run test:e2e` - PASS, 56 tests passed and 2 project-specific tests skipped.

The two skips are intentional: the mobile-menu test is skipped in the desktop project, and the explicit 390x844 checkpoint is skipped in the desktop project. Both execute in the mobile project.

## Security Acceptance

- Requested every public route: `/`, `/discover`, `/updates`, and all 10 detail routes; all returned HTTP 200.
- Checked every route response for all sync environment variable names, authorization/raw inbox markers, `.env`, draft/internal field markers, and the specified Chinese workflow states.
- Added `npm run verify:public`, which recursively scans built CSS, HTML, JS/CJS/MJS, JSON, SVG, text, and XML assets plus forbidden artifact paths.
- Confirmed no credential-shaped values with `git grep`.
- Confirmed no tracked `.env`, source map, Playwright report, test result, temporary, runtime lock, or screenshot artifacts. The existing dependency manifest `apps/web/package-lock.json` remains tracked and was not modified.
- Confirmed `dist`, Playwright output, and `.superpowers/sdd/task-14-screenshots` are ignored.

## Responsive And Keyboard Acceptance

- Covered 1440x1000, 412x915, and 390x844 viewports across home, discover, updates, and a representative detail page.
- Asserted exact document width, loaded images with nonzero natural width, control/card bounds, card separation, no nested cards, and stable 16:10 card images.
- Asserted the homepage hero is nonblank and the next section is visible in the first viewport.
- Verified Tab/Enter and visible focus for header navigation/search/submit/menu, discovery search/category/sort, detail copy, and external source actions.
- Verified mobile menu Enter open, Escape close, focus return, and synchronized `aria-expanded`/accessible name.
- Verified copy success, failure/retry, stable button dimensions, and 1600ms reset.

## Screenshots

Stored locally and intentionally untracked under `.superpowers/sdd/task-14-screenshots`:

- `home-desktop.png`
- `home-mobile.png`
- `discover-desktop.png`
- `discover-mobile.png`
- `updates-desktop.png`
- `updates-mobile.png`
- `detail-desktop.png`
- `detail-mobile.png`

All eight full-page screenshots were inspected. No blank hero, image failure, horizontal overflow, text/control clipping, incoherent overlap, or nested card defect was found, so no layout CSS change was required.

## Defects Fixed

- Replaced the Playwright web server from daemonizing `astro dev` to foreground `astro preview`, so E2E startup is observable and reliable.
- Made the unavailable submit button keyboard-focusable with `aria-disabled="true"` while preserving its no-action behavior.
- Added mobile menu Escape dismissal, focus restoration, and accurate open/close accessible names.
- Added asset-reader regression coverage proving reader cancellation, request abort, and preservation of the original read error.
- Added fake-timer CopyBlock coverage proving reset occurs at exactly 1600ms and restored real timers between tests.

## Dependency And External Risk

- No dependency was added; `@axe-core/playwright` was not required.
- External Feishu/original-source availability is outside the static release gate. E2E verifies target URLs and keyboard popup behavior, not third-party uptime or content.
- Live GitHub Actions secrets, Feishu write permissions, and a production deployment were not exercised locally. Existing workflow/unit coverage remains the control for those external integrations.
