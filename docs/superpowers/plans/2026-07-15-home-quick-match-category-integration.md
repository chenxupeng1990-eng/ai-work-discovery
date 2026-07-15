# 首页快速匹配与分类二级页整合 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将快速匹配恢复到首页，并把当前主要目标连接到对应分类二级页，同时保持首页内容数量有界。

**Architecture:** 从现有 `DiscoveryExplorer` 提取独立 `QuickMatch` 组件；首页负责组合轮播、快速匹配和最新精选，发现页只保留全量检索。分类 slug 与数量继续由现有分类模块计算。

**Tech Stack:** Astro、React、TypeScript、Vitest、Playwright。

## Global Constraints

- 不修改公开数据契约、推荐算法、飞书表结构或同步流程。
- 首页最新精选最多 10 条，快速匹配最多 3 条。
- 所有分类链接使用 `lib/categories.ts` 的稳定英文 slug。
- 保持现有中文字体、玻璃视觉 tokens、键盘操作和响应式约束。

---

### Task 1: 锁定首页和发现页行为

**Files:**
- Modify: `apps/web/tests/e2e/home.spec.ts`
- Modify: `apps/web/tests/e2e/discover.spec.ts`

**Interfaces:**
- Consumes: 首页 `/`、发现页 `/discover`、分类路由 `/category/<slug>`。
- Produces: 快速匹配位置、动态分类入口和发现页去重的回归测试。

- [x] 写首页快速匹配、目标切换、分类链接及发现页不重复面板的失败测试。
- [x] 运行聚焦 E2E，确认测试因功能尚未迁移而失败。

### Task 2: 提取快速匹配并接入首页

**Files:**
- Create: `apps/web/src/components/QuickMatch.tsx`
- Create: `apps/web/src/components/QuickMatch.css`
- Modify: `apps/web/src/components/DiscoveryExplorer.tsx`
- Modify: `apps/web/src/pages/index.astro`
- Modify: `apps/web/src/pages/discover.astro`
- Delete: `apps/web/src/components/CategoryLinks.astro`

**Interfaces:**
- Consumes: `recommendContent(items, preferences, 3)`、`slugForTrack(track)`、公开内容数组。
- Produces: `QuickMatch({ items }: { items: ContentItem[] })`。

- [x] 将偏好状态、三条推荐和偏好按钮移动到 `QuickMatch`。
- [x] 根据当前目标计算分类数量和 `/category/<slug>` 链接。
- [x] 首页在 Hero 后渲染 `QuickMatch`，移除独立分类入口。
- [x] 发现页只保留搜索、筛选、排序和完整列表。
- [x] 运行聚焦测试，确认首页与发现页行为通过。

### Task 3: 收紧分类页导航和布局

**Files:**
- Modify: `apps/web/src/pages/category/[slug].astro`
- Modify: `apps/web/tests/e2e/home.spec.ts`

**Interfaces:**
- Consumes: `CATEGORY_DEFINITIONS` 与当前分类。
- Produces: 分类切换导航和稳定的一至三列内容布局。

- [x] 写分类切换入口和单内容布局的失败测试。
- [x] 在分类页加入四分类切换与返回全部发现入口。
- [x] 保持单卡为三列网格宽度，避免一条内容横向拉伸。
- [x] 运行分类相关 E2E 并确认通过。

### Task 4: 全量验证

**Files:**
- Modify only if verification exposes a scoped defect.

**Interfaces:**
- Consumes: 完整实现。
- Produces: 可发布构建与桌面、移动端验收证据。

- [x] 运行 `npm test -- --run`。
- [x] 运行 `npm run check`、`npm run build`、`npm run verify:public`。
- [x] 运行 `npm run test:e2e`。
- [x] 检查桌面与 390x844 首页、发现页、分类页截图，无溢出、遮挡或异常空白。
