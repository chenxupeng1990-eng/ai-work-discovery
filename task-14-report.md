# Task 14 Final Release Acceptance Report

## Scope

Completed final public-release acceptance for AI Work Discovery from starting HEAD `c15eba4`, followed by the Task 14 review fixes from HEAD `28e5414`. Scope remained limited to E2E/security coverage, release scanning, and narrow accessibility/test-server fixes. No product feature, CSS change, or visual redesign was added.

## Release Gate

Run from `apps/web` in this order:

1. `npm test` - PASS, 16 files and 362 tests.
2. `npm run typecheck` - PASS.
3. `npm run check` - PASS, 0 errors, 0 warnings, 0 hints.
4. `npm run build` - PASS, 13 static pages generated.
5. `npm run verify:public` - PASS, 32 `dist` files scanned.
6. `npm run test:e2e` - PASS, 56 tests passed and 2 project-specific tests skipped.
7. Git tracked-artifact scan - PASS, 90 tracked files checked.

The two skips are intentional: the mobile-menu test is skipped in the desktop project, and the explicit 390x844 checkpoint is skipped in the desktop project. Both execute in the mobile project.

## Security Acceptance

- Requested every public route: `/`, `/discover`, `/updates`, and all 10 detail routes; all returned HTTP 200.
- Checked every route response with the same shared, labeled matcher used by `verify:public`.
- Field rules cover direct and serialized JSON/object keys plus explicit HTML labels for original content, publication status, public level, processing status, related draft content, source Inbox record ID, and source Inbox copy-block key, including their internal serialized aliases.
- Status rules cover structured JSON values, status/state attributes, and standalone status labels for `草稿`, `禁止发布`, `待处理`, `处理中`, `待审核`, and `失败` without rejecting natural text such as `Draft`, `drafting`, or `失败复盘`.
- Secret identifiers are matched case-insensitively as whole tokens, preventing partial-word false positives.
- `npm run verify:public` recursively scans common built text extensions including CSS, CSV, HTML/XHTML, JS/CJS/MJS, JSON, Markdown, SVG, text, web manifests, XML, and YAML, plus forbidden artifact paths.
- Added 42 scanner unit cases covering every internal field/status/secret leak shape and legitimate public-text regressions.
- Confirmed no credential-shaped values with `git grep`.
- Confirmed no tracked `.env`, source map, Playwright report, test result, temporary, runtime lock, or screenshot artifacts. The existing dependency manifest `apps/web/package-lock.json` remains tracked and was not modified.
- Confirmed `dist`, Playwright output, and `.superpowers/sdd/task-14-screenshots` are ignored.

## Responsive And Keyboard Acceptance

- Covered 1440x1000, 412x915, and 390x844 viewports across home, discover, updates, and a representative detail page.
- Asserted exact document width, loaded images with nonzero natural width, control/card bounds, card separation, no nested cards, and stable 16:10 card images.
- Asserted the homepage hero is nonblank and the next section is visible in the first viewport.
- Verified visible focus and real forward Tab order from the page start or current known focus for header controls, discovery search/category/sort, detail copy, and external source actions; no test calls `.focus()` to manufacture coverage.
- Verified discovery controls are reached through the header, then operated with Space/Enter; `fill` is only used after the searchbox receives focus by Tab.
- Verified detail copy is reached from the header, the external link is reached by continuing Tab after copy, and Enter activation is captured by a controlled navigation listener.
- Verified mobile menu Tab reachability, Enter open/close, Escape close, focus return, and synchronized `aria-expanded`/accessible name.
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

The full screenshot-related layout regression reran for desktop, mobile, and the explicit 390x844 checkpoint. No blank hero, image failure, horizontal overflow, text/control clipping, incoherent overlap, or nested card defect was found, so no layout CSS change was required.

## Defects Fixed

- Replaced duplicated substring deny lists with one labeled, structured public-release matcher shared by unit tests, all 13 route checks, and the dist scanner.
- Replaced direct-focus keyboard coverage with the shared `tabUntil` helper and forward-only Tab traversal from the page start or current known focus.
- Replaced the Playwright web server from daemonizing `astro dev` to foreground `astro preview`, so E2E startup is observable and reliable.
- Made the unavailable submit button keyboard-focusable with `aria-disabled="true"` while preserving its no-action behavior.
- Added mobile menu Escape dismissal, focus restoration, and accurate open/close accessible names.
- Added asset-reader regression coverage proving reader cancellation, request abort, and preservation of the original read error.
- Added fake-timer CopyBlock coverage proving reset occurs at exactly 1600ms and restored real timers between tests.

## Dependency And External Risk

- No dependency was added; `@axe-core/playwright` was not required.
- External Feishu/original-source availability is outside the static release gate. E2E verifies target URLs and controlled keyboard activation without navigating to the third party; it does not verify third-party uptime or content.
- Live GitHub Actions secrets, Feishu write permissions, and a production deployment were not exercised locally. Existing workflow/unit coverage remains the control for those external integrations.
