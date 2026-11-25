---
goal: 优化 Web 数据浏览器的视觉系统、详情导航和长文阅读体验
created: 2026-11-24
modified: 2026-11-24
status: Completed
design: docs/design/web-data-browser.md
---

# Web 视觉与详情阅读优化

## 目标

- 统一 OpenVue/Aura 与自定义 UI 的强调色，提升侧栏、列表和详情的一致性与层次感。
- 详情页增加吸顶导航条，支持上一条/下一条，并在跨页时保留列表的排序、过滤和搜索。
- 把详情从纵向堆叠改成阅读型布局：固定阅读宽度、完整正文排版、侧栏元信息。
- 修复 CNBlog 正文以 JSON 字符串形式显示转义字符的问题。

## 约束与前提

- **CON-001**：保持 `web/` 只读，不修改 `src/`、`pyproject.toml` 或 `eto` CLI。
- **CON-002**：继续使用 OpenVue 1.1.1，不新增 UI 框架或状态库。
- **CON-003**：URL 仍是可分享查询状态的唯一来源；详情页快照只用于当前标签页的上一条/下一条。

## 实施步骤

| Task     | Status    | Description | Verification Steps | Date |
| -------- | --------- | ----------- | ------------------ | ---- |
| TASK-001 | Completed | `main.ts` 用 `definePreset` 将 Aura 主色固定为 indigo；重做全局语义色、品牌区、侧栏平台标记、列表工具栏和 DataTable 轻量覆盖。 | typecheck/build；深色与浅色截图检查按钮、导航、表格一致 | 2026-11-24 |
| TASK-002 | Completed | 详情页改为 hero + 吸顶工具栏 + 阅读列 + sticky 侧栏；统一正文段落、标题、引用、代码、表格、图片样式，元信息与来源移入侧栏。 | 文章、推文、V2EX、Bilibili、CNBlog 详情截图；移动端 390px 检查 | 2026-11-24 |
| TASK-003 | Completed | 列表加载后保存当前页 `QueryRequest` 与主键到 `sessionStorage`；详情页解析位置、页内切换、跨页补查，并隐藏无上下文时的切换按钮。 | Vitest 覆盖快照和边界；Playwright 验证页内切换、跨页 offset、返回列表保留查询 | 2026-11-24 |
| TASK-004 | Completed | 新增 `decodeStoredText` 解一层 JSON 字符串，修复 CNBlog `body` 的 `\"`、`\\n` 字面量。 | 单测覆盖 JSON/普通文本/数字/null；CNBlog 详情截图无转义字符 | 2026-11-24 |
| TASK-005 | Completed | 移动端平台导航改为换行紧凑布局；更新设计文档、`web/README.md` 和前端 README。 | 390px 下 11 个导航项可见、无横向溢出 | 2026-11-24 |

## 涉及文件

- **FILE-001**：`web/frontend/src/main.ts` — Aura indigo preset。
- **FILE-002**：`web/frontend/src/styles/main.css` — 全局语义色、布局、表格覆盖。
- **FILE-003**：`web/frontend/src/App.vue`、`components/PlatformNav.vue` — 品牌区和平台导航。
- **FILE-004**：`web/frontend/src/views/HomeView.vue`、`views/TableView.vue` — 首页和列表视觉。
- **FILE-005**：`web/frontend/src/views/DetailView.vue` — 详情布局、吸顶导航、侧栏。
- **FILE-006**：`web/frontend/src/components/FieldRenderer.vue` — 正文排版和文本解码。
- **FILE-007**：`web/frontend/src/utils/tableState.ts`、`tableState.test.ts` — 详情页快照和切换逻辑。
- **FILE-008**：`web/frontend/src/utils/format.ts`、`format.test.ts` — `decodeStoredText`。

## 测试与验证

- **TEST-001**：`npm run typecheck && npm run test && npm run build` 通过（72 个 Vitest）。
- **TEST-002**：Playwright 深色/浅色验证首页、列表、文章、推文、V2EX 回复、Bilibili 播放器、raw 页面；上一条/下一条页内与跨页位置正确，返回列表保留查询和滚动，文章段落间距生效，Twitter 图片 `naturalWidth > 0`。
- **TEST-003**：390px 移动端无横向溢出，平台导航 11 项全部可见。
- **TEST-004**：后端未改动，保留 65 个 pytest 与 Ruff 结果。

## 风险与遗留

- **RISK-001**：直接打开详情 URL 时没有列表页快照，上一条/下一条不显示。
- **RISK-002**：视觉层使用 `color-mix()`、`backdrop-filter` 和 `dvh`，旧浏览器会退化。
- **RISK-003**：移动端平台导航占约 158px 高度，平台数量继续增加时需要抽屉或横向滚动。
