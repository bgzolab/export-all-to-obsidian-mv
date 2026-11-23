---
goal: 修复平台切换白闪、QiReader 时间与冗余列、列表状态丢失和 Twitter 详情无图
created: 2026-11-22
modified: 2026-11-22
status: Completed
design: docs/design/web-data-browser.md
---

# Web 列表与详情体验修复

## 目标

- 切换平台时不残留上一张表的内容，也不出现白色 loading 遮罩。
- QiReader 列表不再显示恒为“是”的收藏列，发布时间按毫秒时间戳渲染。
- 返回表格时恢复页码、筛选和滚动位置。
- Twitter 详情从 raw response 恢复推文图片/视频。

## 约束与前提

- **CON-001**：保持 `web/` 只读，不修改 `src/`、`pyproject.toml` 或 `eto` CLI。
- **CON-002**：URL 仍是可分享查询状态的唯一来源；`sessionStorage` 只补充同标签页的返回体验。
- **CON-003**：Twitter 投影表没有媒体列，媒体从 `twitter_tweet.response_id` 指向的 raw body 提取。

## 实施步骤

| Task     | Status    | Description | Verification Steps | Date |
| -------- | --------- | ----------- | ------------------ | ---- |
| TASK-001 | Completed | `TableView` 切换平台时清空旧行、重置 `loaded`/关联数据，移除 DataTable 白色 loading 遮罩，改用空表提示；分页/搜索时保留现有行到新结果返回。 | Playwright 切换平台；检查 `.p-datatable-mask` 数量为 0，过渡时无旧行 | 2026-11-22 |
| TASK-002 | Completed | 新增 `utils/tableState.ts`，按表保存最近查询和“表+查询”的滚动位置；`TableView` 在侧栏切换、详情返回和浏览器后退时恢复，`DetailView` 返回按钮带上次查询。 | Vitest 状态单测；Playwright 验证页码和滚动恢复 | 2026-11-22 |
| TASK-003 | Completed | QiReader 列表移除 `is_saved` 并加入隐藏列；`published_at` 时间单位从 `iso` 修正为 `epoch_ms`。 | 页面表头无“已收藏”；时间显示为日期而非 13 位数字 | 2026-11-22 |
| TASK-004 | Completed | 新增 `utils/twitter.ts`，沿 raw body 递归定位推文并提取 `extended_entities.media` / `entities.media`；`DetailView` 读取 `response_id` 后渲染图片和视频。 | Vitest 媒体提取；Playwright 检查图片 `naturalWidth > 0` | 2026-11-22 |
| TASK-005 | Completed | 更新设计文档、`web/README.md` 和前端 README，补充状态记忆、白闪修复和 Twitter 媒体来源。 | `git diff --check`；文档链接与路径存在 | 2026-11-22 |

## 涉及文件

- **FILE-001**：`web/frontend/src/views/TableView.vue` — 切换清空、加载态、查询/滚动恢复。
- **FILE-002**：`web/frontend/src/utils/tableState.ts` — 会话级表格状态。
- **FILE-003**：`web/frontend/src/views/DetailView.vue` — 返回时带查询、Twitter 媒体渲染。
- **FILE-004**：`web/frontend/src/utils/twitter.ts` — raw 媒体提取。
- **FILE-005**：`web/frontend/src/config/tables.ts` — QiReader 列和时间单位。
- **FILE-006**：`web/frontend/src/config/details.ts` — Twitter `media` 配置。

## 测试与验证

- **TEST-001**：`npm run typecheck && npm run test && npm run build` 通过（67 个 Vitest）。
- **TEST-002**：Playwright 验证 QiReader 表头/时间、V2EX 第二页滚动 420px 后详情返回与侧栏往返恢复、切换平台无 loading 遮罩、Twitter 四张图片自然宽度正常。
- **TEST-003**：后端未改动，保留 65 个 pytest 与 Ruff 结果。

## 风险与遗留

- **RISK-001**：状态记忆只在当前标签页有效；清空站点数据或新标签页会回到默认。
- **RISK-002**：Twitter 媒体依赖 raw response 保留；raw 被清理或上游结构变化时媒体静默隐藏，正文仍可读。
