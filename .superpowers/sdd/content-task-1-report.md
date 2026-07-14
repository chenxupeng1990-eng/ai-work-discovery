# Task 1 实现报告：内容时效审查发布门禁

## 状态

已完成并提交前验证。

## 实现范围

- `apps/web/scripts/feishu/fields.ts`
  - 新增信息价值、时效状态、事实状态、核验结论、核验说明、核验时间、下次复核时间。
  - 全部新增字段加入 `PRIVATE_BASE_FIELD_NAMES.content`，不允许进入公开 JSON。
- `apps/web/scripts/audit/content-audit.ts`
  - 提供严格的 `ContentAuditProposalSchema`。
  - 提供 `assertReleaseAudits(records, now)` 和只包含记录 ID 的 `ContentAuditError`。
  - 仅审查发布状态为“已发布”的记录；允许价值为“高价值”或“可保留”、时效“当前有效”、事实“符合当前实际”、结论“通过”，且核验时间合法、下次复核时间合法并晚于 `now`。
- `apps/web/scripts/sync-content.ts`
  - 在 Feishu 内容/复制块读取完成后、`mapPublishedContent` 前执行门禁。
  - 审查失败包装为 `SyncRunError("CONTENT_AUDIT_FAILED", "audit-content", error)`，发生失败时不替换上一版输出。
- `apps/web/tests/unit/content-audit.test.ts`
  - 覆盖通过路径、缺失字段、已过时、无法确认、非通过结论、无效日期、到期复核时间、草稿/下架忽略，以及只暴露记录 ID。
- `apps/web/tests/unit/sync-content.test.ts`
  - 既有已发布 fixture 添加合法审查字段；新增同步 fail-closed 测试。

## TDD 记录

### RED

先新增审查和同步阻断测试，执行：

```powershell
npm test -- --run tests/unit/content-audit.test.ts tests/unit/sync-content.test.ts
```

结果符合预期：审查模块尚不存在，`content-audit.test.ts` 无法解析导入；同步测试显示到期复核记录仍返回成功并尝试发布。

### GREEN

实现最小门禁后重复执行同一 focused 命令：

```text
Test Files  2 passed (2)
Tests       36 passed (36)
```

## 最终验证

```powershell
npm test -- --run tests/unit/content-audit.test.ts tests/unit/sync-content.test.ts
npm test -- --run
npm run check
npm run build
```

- Focused tests：2 个文件、36 项通过。
- 全量 Vitest：21 个文件、611 项通过（完整证据修复后）。
- `npm run check`：72 个文件，0 errors、0 warnings、0 hints。
- `npm run build`：检查通过，静态构建完成 19 页。

## 自审

- 门禁筛选条件仅为 `发布状态 === "已发布"`；草稿、下架及其他状态不会因审查字段缺失阻断同步。
- `auditNote` 在提案 schema 和已发布门禁中都要求 trim 后非空，且长度不超过 500；七个审查字段分别缺失时均有表驱动阻断测试。
- `ContentAuditError.message` 仅连接失败记录 ID；不会包含字段名、字段值、审查说明或 URL。同步日志只记录固定 code/stage。
- 新字段未添加到公开映射 allowlist，并被私有字段泄漏检测动态覆盖。
- 审查调用位于公开映射、资源下载、数据构建和原子替换之前，因此失败不会替换已有 `content.json`。
- 修改仅覆盖 Task 1 指定文件和本报告；未修改 `.superpowers/sdd/task-3-report.md` 的已有变更。

## 备注

`ContentAuditProposalSchema` 接受设计中定义的所有审查枚举值，以便 LLM 能返回“需复核”“下架”等人工决策建议；发布门禁只放行其中要求的通过组合。

## 本次 Feishu datetime 兼容修复

- 存储态的 `auditedAt` 和 `nextReviewAt` 同时接受 Feishu Base 返回的有限、安全正整数毫秒时间戳，以及原有带时区 ISO 字符串。
- 数字时间戳必须达到毫秒量级、通过 `Date` 有效范围校验；秒级值、`NaN`、`Infinity`、负数、非整数和溢出值均被拒绝，不进行秒到毫秒猜测或转换。
- `ContentAuditProposalSchema` 的 `auditedAt` 和 `nextReviewAt` 仍保持 ISO 字符串要求。
- 新增真实 API 数字字段形状测试，并覆盖上述非法数字边界；本次 focused 测试共 38 项通过。
