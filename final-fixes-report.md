# Final Fixes Report: Product And Operations Integration, Round 1

## Scope

Completed the first whole-branch review fix round from starting HEAD `e525b3a`. Changes are limited to CI/sync workflow contracts, Feishu record publication mapping, public fixtures/generated data, content search, discovery navigation and URL state, E2E/unit coverage, and operations documentation.

The asset download implementation was not modified. `FeishuDocumentCard.astro` remains available for future records with a verified anonymous public Feishu URL. No live third-party network acceptance test was added.

## Fixes

- CI and sync workflows now run `npm run verify:public` immediately after build. Sync runs the scan before the step that stages or commits generated content.
- `BASE_VALUES` now owns the three public-level values: `公开`, `脱敏案例`, and `禁止发布`. Published mapping accepts the first two and rejects the third.
- Existing Inbox processing still creates drafts without setting `公开级别`; the unit contract explicitly verifies this behavior.
- Removed the login-gated WayToAGI `feishuDocumentUrl` from the test fixture and generated public dataset without adding a replacement. The valid `originalUrl` remains.
- Detail E2E now verifies that records without an explicitly anonymous Feishu URL omit the Feishu card and still expose the original source.
- Search now includes `copyBlocks[].title` and continues to exclude copy block body content.
- Header navigation now contains six valid destinations: discovery, cases, collaboration, tools/resources, AI signals, and updates.
- Homepage discovery directions are eight lightweight links to categories that exist in the generated dataset.
- Discovery category state initializes from the URL after hydration, accepts only current categories, normalizes invalid values to `全部`, updates the URL on interaction, and responds to history navigation.
- The operations guide documents both publishable public levels, manual public-level selection for AI drafts, incognito Feishu-link verification, and the build-to-public-scan workflow order.

## Verification

Run from `apps/web`:

| Command | Result |
| --- | --- |
| `npm test` | PASS: 16 files, 480 tests |
| `npm test -- tests/unit/workflows.test.ts` | PASS: 2 workflow contract tests |
| `npm run typecheck` | PASS |
| `npm run check` | PASS: 59 files, 0 errors, 0 warnings, 0 hints |
| `npm run build` | PASS: 13 static pages |
| `npm run verify:public` | PASS: 32 dist files and 1 tracked public text artifact scanned |
| `npm run test:e2e -- --reporter=line` | PASS: 62 passed, 2 project-specific skips |

The existing screenshot acceptance generated fresh desktop and mobile homepage captures. Header inspection confirmed all six desktop links fit without overflow; the mobile header remains compact and the six-link menu opens, closes, supports keyboard dismissal, and stays within the viewport. The 390x844 width checkpoint also passed.

## External Acceptance Boundary

This round does not claim live Feishu availability. Editors must verify every Feishu document URL in an incognito window before publication; if anonymous access is not confirmed, the field remains empty and the original source is used instead.
