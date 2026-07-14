# AI Work Discovery - Discover Hero Design QA

- Source visual truth: `C:\Users\Qifei\.codex\generated_images\019f3af3-f911-7a01-b37b-a62773487dc1\exec-3752f3e4-ea80-48b7-8908-8d7f0dd7a7d7.png`
- Refero source: `https://styles.refero.design/style/022cf675-42d1-44e7-953a-68facc802117`
- Implementation screenshot: `C:\Users\Qifei\.feishu-codex-bridge\projects\t\.worktrees\ai-work-discovery\.superpowers\sdd\task-14-screenshots\discover-qa-desktop.png`
- Mobile screenshot: `C:\Users\Qifei\.feishu-codex-bridge\projects\t\.worktrees\ai-work-discovery\.superpowers\sdd\task-14-screenshots\discover-qa-mobile.png`
- Side-by-side comparison: `C:\Users\Qifei\.feishu-codex-bridge\projects\t\.worktrees\ai-work-discovery\.superpowers\sdd\task-14-screenshots\discover-design-comparison.png`
- Viewports: `1920x1080` desktop and `390x844` mobile
- State: initial discovery page, featured sort, no query, all tracks

## Full-view comparison evidence

The implementation preserves the selected composition: large lower-left headline, real workflow visual as the hero subject, compact featured metadata, blue conversion CTA, and search/filter controls visible at the next-section boundary. The generated optical-glass asset provides the same high-key iridescent depth as the source while the live page uses the actual maintained content screenshot.

## Focused comparison evidence

- Typography: the implementation uses SF Pro-compatible system fallbacks, weight 600 display type, 1.07 display leading, and Refero's 17/20px body scale. Desktop wrapping is two lines; the 390px layout keeps the title to two lines without overflow.
- Spacing: the page uses the imported 4px scale, 28px image radii, pill controls, and the Refero 1440px content maximum. Mobile leaves the start of the search section visible in the first viewport.
- Colors: all interface surfaces map to Apple Ink, Fog Canvas, Pure White, Ash, Graphite, Electric Blue, and Link Blue tokens. The iridescent spectrum appears only in the raster hero imagery.
- Images: the hero background is a dedicated 1920px WebP asset. The featured workflow image is real project content, not placeholder art, and remains sharp at both target sizes.
- Copy: the selected headline, support copy, weekly feature title, CTA labels, search copy, tracks, and result count are preserved.

## Comparison history

### Iteration 1

- Earlier P2: the mobile featured image retained its intrinsic 960px width/600px height, producing horizontal overflow and an excessively tall hero.
- Fix: constrained the visual to its grid track, set image width/height behavior explicitly, and compacted mobile spacing.
- Evidence: responsive E2E now passes at 390px and 412px with exact document width.

### Iteration 2

- Earlier P2: the desktop headline wrapped to three lines and the featured metadata collided with the document visual.
- Fix: rebalanced hero grid tracks, constrained desktop headline wrapping, reduced mobile type responsively, and separated image/metadata proportions.
- Evidence: the final side-by-side comparison shows a two-line headline and distinct featured text region with no overlap.

## Findings

No actionable P0, P1, or P2 differences remain.

## Interaction and runtime checks

- Search query, track selection, featured/latest sorting, Hero CTA route, keyboard interaction, desktop/mobile overflow, and card separation are covered by Playwright.
- Browser console and page error listeners reported no errors during search, track, and sorting interactions.
- Primary Hero CTA resolves to `/content/feishu-bridge-team-entry`.

## Follow-up polish

- P3: replace the current maintained workflow screenshot when a cleaner, taskbar-free production capture becomes available.

## Work Radar Iteration

- Target: retain the Apple/Refero visual system while adopting Vibe Coding Radar's goal-first information hierarchy.
- Routes checked: `/discover` on 1440x1000, Pixel 7, and 390x844.
- Evidence: current Playwright release screenshots in `.superpowers/sdd/task-14-screenshots`.
- Four discovery tracks, preference picker, recommendations, search, sorting, cards, and copy action remain keyboard operable.
- Theme tokens control color, typography, spacing, dividers, and controls; the added listing cards use an 8px radius and no shadow.
- Images load with stable dimensions; cards do not overlap; desktop and mobile pages have no horizontal overflow.
- Public pages expose no private release markers, draft data, or internal asset URLs.

## Chinese Typography and Liquid Glass Iteration

- Source screenshot: `C:\Users\Qifei\AppData\Local\Temp\codex-clipboard-046a8387-1c9a-40b5-a7f1-243e8189d503.png`.
- Desktop implementation: `.superpowers/sdd/task-14-screenshots/discover-glass-desktop-1920-final.png` at `1920x1080`.
- Mobile implementation: `.superpowers/sdd/task-14-screenshots/discover-glass-mobile-final.png` at `390x844`.
- Side-by-side evidence: `.superpowers/sdd/task-14-screenshots/discover-glass-comparison-final.png`.

### Iteration 1

- P2: four desktop preference groups used horizontally scrolling button rows, leaving two groups with clipped final options.
- Fix: changed each group to a wrapping flex row while retaining the four-column desktop layout and two-/one-column responsive layouts.
- Evidence: the visual-contract E2E detects any button extending past its preference group; it passes at the final state.

### Final comparison

- Typography: Chinese fallbacks now prioritize PingFang SC, Noto Sans CJK SC, and Microsoft YaHei. Section, recommendation, and listing-card headings use weight 500 with more relaxed Chinese line height.
- Spacing: the quick-match tool has a wider heading gap, four balanced desktop preference groups, and a larger separation before its recommendation results.
- Glass: the panel uses a translucent Fog surface, 1px tokenized border, 22px backdrop blur, and short settle/hover transitions without gradients or shadows.
- Responsive behavior: controls collapse to two columns below 1180px and one column below 720px. Mobile recommendations remain single-column with no horizontal overflow.
- Motion accessibility: reduced-motion mode removes the panel entrance animation and interactive transforms.
- Content and imagery: no content, route, image, Feishu field, search, filter, or copy behavior changed.

### Iteration 2

- P2: the relaxed recommendation line height exceeded two fixed text containers at the 1024px breakpoint, and two 12px muted labels fell below WCAG AA contrast.
- Fix: increased the bounded text regions to their measured three-line height and changed muted labels from Slate to Graphite.
- Evidence: the final E2E checks 1024px vertical overflow, adaptive 4/2/1-column breakpoints, exact glass opacity, muted-label color, and zero display letter spacing.

### Iteration 3

- P2: on 390px screens, a three-line recommendation title was visually clamped by its `h3`, but the nested link retained a taller click box and could extend below the viewport after scrolling.
- Fix: moved the two-line clamp to the link itself so its visual text and interactive bounds are identical.
- Evidence: the targeted link-boundary regression and the 390x844 release-page test both pass.

No actionable P0, P1, or P2 differences remain.

final result: passed
