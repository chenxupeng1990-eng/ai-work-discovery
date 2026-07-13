# Task 13 验收报告

## 范围

本任务完成 CI、定时内容同步、生产数据源统一、TypeScript 6 配置修复、内容运营文档和部署文档。未重构或重新设计 UI。

## 生产数据源迁移

- 新增 `apps/web/src/lib/public-dataset.ts`，在单一模块中导入并执行 `PublicDatasetSchema.parse(src/generated/content.json)`。
- 首页、发现页、详情页和最近更新页全部改为读取该 loader。
- 删除会造成双数据源误解的 `apps/web/public/data/content.json`。
- 将 fixture 从 `src/data` 移到 `tests/fixtures`；生产 `src/pages` 不再引用 fixture 或 `public/data`。
- E2E 期望直接从 `src/generated/content.json` 读取并校验，确保静态路由、排序、数量和页面内容与权威 dataset 一致。
- 新增静态与行为测试，约束生产页面只能通过统一 loader 读取 generated dataset，并禁止恢复第二份 public JSON。

## TypeScript 与 package scripts

- 删除已弃用的 `compilerOptions.baseUrl`。
- 将 paths 目标改为 TypeScript 6 可接受的 `./src/*`，保留 `@/*` 解析能力。
- 新增 `typecheck: tsc --noEmit`，未使用 `ignoreDeprecations`。
- 新增 `yaml` dev dependency，用真实 YAML parser 验证 workflow 语法和合同。

## GitHub Actions

### CI

- 触发：所有 pull request、`main` push。
- Node 22、`npm ci`、lockfile cache。
- gate：typecheck、unit、Astro check、build、完整 Chromium E2E。
- `contents: read`、job timeout、按 workflow/ref concurrency 并取消旧 CI。
- CI 不引用 repository secrets，fork PR 不会获得同步凭据。

### 内容同步

- 触发：`17 */6 * * *` 和 `workflow_dispatch`。
- `contents: write`；默认分支单实例，运行中任务不取消。
- 精确注入 `SyncConfigSchema` 的 9 个 secret 名称，secret 不出现在命令参数中。
- 顺序执行 sync、unit、typecheck、check、build；任一步失败都不会进入提交步骤。
- 只 stage `apps/web/src/generated/content.json` 和存在时的 `apps/web/public/images/content`；空内容集不会因图片目录不存在而失败。
- staged diff 为空时退出；有差异时使用 `github-actions[bot]` 身份提交并安全推送到当前默认分支。

## 运维文档

- `docs/content-operations.md`：三张 Base 表的精确中文字段、类型、允许值、必填项和内部幂等字段；Inbox 到草稿、人工审核、公开发布、下架、手动同步和 last-good 恢复流程。
- `docs/deployment.md`：Node 22、全部 secrets、GitHub workflow 权限与 branch protection、Cloudflare Pages 命令和 `apps/web/dist` 输出目录。
- 文档明确公开站只展示“已发布 + 公开”，AI 只生成草稿，不能自动发布。

## 验证结果

在 `apps/web` 运行：

| 命令 | 结果 |
| --- | --- |
| `npm test` | 15 files，318 tests passed；包含 YAML parse、cron、permissions、secret、stage path、CI gate 和生产数据源测试 |
| `npm run typecheck` | 通过，裸 `tsc --noEmit` 无输出错误 |
| `npm run check` | 54 files，0 errors、0 warnings、0 hints |
| `npm run build` | 通过，生成 13 个静态页面，包括 10 个 generated dataset 详情路由 |
| `npm run test:e2e -- --reporter=line` | 39 passed，1 skipped；desktop/mobile 两个 Chromium 项目完整执行，skip 为 desktop 项目中的移动端专用导航用例 |

本地 E2E 首轮复用了依赖优化前遗留的 Astro dev server，导致 React island hydration 报 `_jsxDEV is not a function`。停止该 worktree 的旧 server、清理 `node_modules/.vite` 并由新 server 重跑后，浏览器无 page error，完整 E2E 通过；未为该环境缓存问题修改生产 UI。

## 运维验收结论

- 同步成功后，生产构建会消费新生成的 `src/generated/content.json`，不再被 fixture 或 public 副本遮蔽。
- 同步或验证失败时 workflow 不提交，仓库继续保留 last-good dataset。
- GitHub 仓库仍需按 `docs/deployment.md` 配置 9 个 secrets、Actions 写权限和默认分支保护绕过，之后才能完成真实云端手动同步验收。
