# Task 3 实现报告：搜索、筛选、排序与路由助手

## 状态

已完成。接管前一个 Agent 留下的 3 个未跟踪文件，在保留有效实现的基础上补齐边界契约、验证证据和自审。

提交：`feat: add content discovery queries`（最终哈希见任务完成状态）

## 接管说明

接管时存在以下未提交文件：

- `apps/web/src/lib/content-query.ts`
- `apps/web/src/lib/content.ts`
- `apps/web/tests/unit/content-query.test.ts`

先运行目标测试确认遗留状态：

```powershell
cd apps/web
npm test -- tests/unit/content-query.test.ts
```

```text
Test Files  1 passed (1)
Tests       12 passed (12)
Exit code: 0
```

因此简报中的原始 RED（`queryContent` 缺失）已无法重现。为保留可验证的 TDD 证据，新增“非正数 limit 返回空数组”边界测试，并分别完成两个 RED/GREEN 循环。

## RED 证据

### getRecent 非正数限制

命令：

```powershell
npm test -- tests/unit/content-query.test.ts
```

关键输出：

```text
Test Files  1 failed (1)
Tests       1 failed | 12 passed (13)
FAIL  returns no recent items for a non-positive limit
Expected: []
Received: 7 items
Exit code: 1
```

失败原因符合预期：`slice(0, -1)` 会返回除最后一项外的内容，而不是空数组。

### getRelated 非正数限制

命令：

```powershell
npm test -- tests/unit/content-query.test.ts
```

关键输出：

```text
Test Files  1 failed (1)
Tests       1 failed | 13 passed (14)
FAIL  returns no related items for a non-positive limit
Expected: []
Received: 1 item
Exit code: 1
```

失败原因符合预期：相关推荐同样把负数直接传给 `slice`，产生非空结果。

## GREEN 证据

目标单测：

```powershell
npm test -- tests/unit/content-query.test.ts
```

```text
Test Files  1 passed (1)
Tests       14 passed (14)
Exit code: 0
```

完整单测：

```powershell
npm test
```

```text
Test Files  2 passed (2)
Tests       30 passed (30)
Exit code: 0
```

类型与 Astro 检查：

```powershell
npm run check
```

```text
Result (12 files):
- 0 errors
- 0 warnings
- 0 hints
Exit code: 0
```

生产构建：

```powershell
npm run build
```

```text
Result (12 files): 0 errors, 0 warnings, 0 hints
1 page(s) built
Complete!
Exit code: 0
```

## 实现摘要

- 中文搜索覆盖标题、摘要、推荐理由、来源名称和标签，并对查询做去首尾空白和大小写归一化。
- 分类筛选支持具体分类和 `全部`。
- `featured` 按权重、更新时间、slug、id 确定性排序。
- `latest` 按更新时间、权重、slug、id 确定性排序。
- 新增 `getFeatured`、`getRecent`、`getBySlug`、`getRelated`。
- 相关推荐按共享标签数和同分类评分，排除当前项、过滤零分项并确定性排序。
- `getRecent` 和 `getRelated` 对 `limit <= 0` 返回空数组，避免负数 `slice` 语义泄漏。

## 自审

- 改动仅涉及 Task 3 指定的 3 个实现/测试文件及本报告。
- `sortContent` 先复制数组再排序，不修改调用方输入。
- 搜索、分类、两种排序和全部路由助手均有单测覆盖。
- 相关推荐测试明确验证当前项排除、相关性排名、limit 和无关项过滤。
- `git diff --check` 无空白错误；仅出现仓库现有 Windows 行尾转换提示。
- 未修改或撤销其他 Agent 的已提交内容。

## 顾虑

无阻塞问题。当前排序依赖 schema 已保证的 ISO 时间字符串；相关推荐的相关性范围按简报限定为共享标签和同分类，未扩展到全文相似度。
