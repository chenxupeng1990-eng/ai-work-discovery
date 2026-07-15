# 部署与自动化

## 运行时与构建产物

- Node.js：22
- 安装：`cd apps/web && npm ci`
- 类型检查：`npm run typecheck`
- 单元测试：`npm test`
- Astro 检查：`npm run check`
- 生产构建：`npm run build`
- Chromium E2E：先运行 `npx playwright install --with-deps chromium`，再运行 `npm run test:e2e`
- 静态输出目录：`apps/web/dist`

`src/generated/content.json` 是所有生产页面的唯一公开内容数据源。不要在部署平台额外复制或覆盖该文件。

## GitHub Actions

`CI` 在所有 pull request 和 `main` push 上运行，不读取任何 repository secret，因此 fork pull request 不会暴露同步凭据。权限固定为 `contents: read`。

`Sync public content` 按 `0 10 * * *` 每天 18:00（Asia/Shanghai）运行，也支持手动触发。它使用 `contents: write`，同一默认分支只允许一个同步运行，且不会取消正在运行的同步。任务只提交：

- `apps/web/src/generated/content.json`
- `apps/web/public/images/content`

无 staged diff 时不创建提交。同步、测试、类型检查、Astro 检查或构建任一步失败时都不会提交。

### Repository secrets

secret 名称必须与 `SyncConfigSchema` 完全一致：

| Secret | 用途 |
| --- | --- |
| `FEISHU_APP_ID` | 飞书应用 ID |
| `FEISHU_APP_SECRET` | 飞书应用密钥 |
| `FEISHU_BASE_APP_TOKEN` | Base app token |
| `FEISHU_CONTENT_TABLE_ID` | 内容主表 table ID |
| `FEISHU_COPY_BLOCKS_TABLE_ID` | 可复制内容表 table ID |
| `FEISHU_INBOX_TABLE_ID` | 灵感收件箱 table ID |
| `AI_BASE_URL` | OpenAI-compatible HTTPS base URL |
| `AI_API_KEY` | AI provider API key |
| `AI_MODEL` | 模型名称 |

所有 secret 只通过 workflow step 的 `env` 注入，不放入命令行、提交、构建产物或日志。`AI_BASE_URL` 必须是无用户名和密码的 HTTPS URL。

### GitHub 权限与分支保护

1. 在 **Settings > Actions > General > Workflow permissions** 允许 workflow 使用写权限；workflow 自身仍只给同步任务 `contents: write`。
2. 默认分支必须是 `main`，或确保仓库的 `default_branch` 指向实际部署分支。同步任务会显式检出并推送到该默认分支。
3. 如果分支保护禁止 GitHub Actions bot 直接 push，需要为 `github-actions[bot]` 配置规则绕过，或把同步策略改为机器人 PR。当前 workflow 采用直接推送，未配置绕过会在最终 push 阶段失败。
4. 将 CI 的 `validation` job 设为合并必需检查。不要把 scheduled sync 设为 PR 必需检查。
5. 不要改用 `pull_request_target` 运行 fork 代码；当前 CI 不使用 secrets，避免了 fork PR 的 secret 暴露面。

## Cloudflare Pages

在 Cloudflare Pages 连接 GitHub 仓库后配置：

- Production branch：`main`
- Build command：`cd apps/web && npm ci && npm run build`
- Build output directory：`apps/web/dist`
- Node version：22（例如设置 `NODE_VERSION=22`）

Pages 构建不需要飞书或 AI secrets，因为生产构建只读取已提交且已验证的 generated dataset。不要在 Cloudflare Pages 中配置同步 secrets。

## 发布与恢复

1. 合并代码前确认 CI 全绿。
2. 先在 GitHub Actions 手动运行一次同步，确认生成提交和 Pages 部署成功。
3. 同步失败时，默认分支继续保留 last-good dataset，不需要回写空文件或旧 fixture。
4. Pages 部署失败时，查看构建日志并重新部署上一次成功提交；必要时 revert 导致失败的内容同步提交。
5. 恢复后重新运行同步和完整构建，确认公开站只展示“已发布 + 公开”记录。
