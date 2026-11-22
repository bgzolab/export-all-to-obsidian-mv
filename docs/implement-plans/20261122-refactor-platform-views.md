---
goal: 将 Web 浏览器改为平台化主视图，把次要表合并进详情，并为 Bangumi / Bilibili 增加照片墙
created: 2026-11-22
modified: 2026-11-22
status: Completed
design: docs/design/web-data-browser.md
---

# 平台化视图与照片墙

## 目标

每个平台只保留一个主视图；次要表只从“数据说明”目录进入。Bangumi 支持收藏状态/条目类型 facet，Bangumi 与 Bilibili 默认照片墙并可切回表格；CNBlog、QiReader、Twitter、V2EX、知乎在详情页合并正文、来源或回复。

## 约束与前提

- **CON-001**：只改 `web/` 和 `docs/`，不改 `src/`、`pyproject.toml`、`eto` CLI。
- **CON-002**：数据库仍只读；不新增 ORM、Pinia、Axios。
- **CON-003**：`/t/:table` 和 `/t/:table/:pk` 保持可用；主视图仍由表名驱动。
- **CON-004**：CNBlog 空正文是上游接口问题，本分支只展示提示，不修 exporter。
- **GUD-001**：前端继续以 URL 为列表状态唯一来源；新增 `view` 参数只控制照片墙/表格。
- **GUD-002**：每页关联数据用批量 `IN` 查询，禁止逐行查询。

## 实施步骤

### 阶段 1：后端搜索列

完成标准：`search_columns` 可显式包含 JSON 文本列；不传时行为不变；未知/非文本列返回 400。

| Task     | Status  | Description | Verification Steps | Date |
| -------- | ------- | ----------- | ------------------ | ---- |
| TASK-001 | Completed | 在 `QueryRequest` 增加 `search_columns`，`query.build_where` 按显式列构造 `LIKE`，允许 JSON `TEXT` 列，补后端测试。 | `cd web/backend && .venv/bin/pytest -q tests/test_query.py tests/test_query_api.py`；`.venv/bin/ruff check app tests` | 2026-11-22 |

### 阶段 2：前端配置与照片墙组件

完成标准：平台主表、照片墙、facet、虚拟列、Bilibili 收藏夹和详情合并配置都可在 `config/` 中声明；照片墙组件可独立渲染卡片并触发详情跳转。

| Task     | Status  | Description | Verification Steps | Date |
| -------- | ------- | ----------- | ------------------ | ---- |
| TASK-002 | Completed | 更新 `platforms.ts`（Twitter 主表 `twitter_tweet`、V2EX 主表 `v2ex_topic`）；扩展 `tables.ts` / `details-types.ts` / `details.ts`：`layout`、`gallery`、`facets`、`virtualColumns`、`folders`、`searchColumns`、`lookup`、`sources`、`children`；补配置测试。 | `cd web/frontend && npm run typecheck`；`npm run test -- src/config` | 2026-11-22 |
| TASK-003 | Completed | 新增 `components/GalleryGrid.vue` 与 `utils/gallery.ts`：封面回退、标题/副标题、badge、meta、收藏夹、点击行事件；补纯函数测试。 | `npm run typecheck`；`npm run test -- src/utils/gallery.test.ts` | 2026-11-22 |

### 阶段 3：列表页与详情页

完成标准：Bangumi / Bilibili 默认照片墙并可切表格；Bangumi facet 可筛选且计数正确；Bilibili 收藏夹显示在卡片和详情；CNBlog / QiReader 详情直接显示抓取正文；Twitter / V2EX / 知乎详情显示来源；V2EX 详情内嵌回复。

| Task     | Status  | Description | Verification Steps | Date |
| -------- | ------- | ----------- | ------------------ | ---- |
| TASK-004 | Completed | 改造 `views/TableView.vue`：`view=gallery/table`、照片墙渲染、`FacetBar` 与计数、Bilibili 收藏夹批量补全、虚拟列、`search_columns`，移除同平台表 tabs。 | `npm run typecheck`；`npm run test`；Playwright 打开 `/t/bangumi_collection`、`/t/bilibili_media` 检查照片墙/表格切换和 facet | 2026-11-22 |
| TASK-005 | Completed | 改造 `views/DetailView.vue` 与新增 `utils/extras.ts`：`lookup` 正文、`sources` 来源、`folders` 收藏夹、`children` 回复；CNBlog / QiReader 不再显示摘要；补纯函数测试。 | `npm run typecheck`；`npm run test`；Playwright 打开 CNBlog、QiReader、Twitter、V2EX、知乎、Bilibili 详情 | 2026-11-22 |

### 阶段 4：首页、文档与验证

完成标准：首页/导航只指向主视图，次要表仍可从“数据说明”进入；文档与 CNBlog 排查结论更新；全量检查通过。

| Task     | Status  | Description | Verification Steps | Date |
| -------- | ------- | ----------- | ------------------ | ---- |
| TASK-006 | Completed | 更新首页主表计数/文案、平台导航、`web/README.md`、`web/frontend/README.md`；确认“数据说明”目录仍列出次要表。 | `npm run build`；浏览器检查首页和“数据说明” | 2026-11-22 |
| TASK-007 | Completed | 更新设计文档状态、决策、风险和验证；记录 CNBlog 空正文排查结论，不修改 `src/cnblog`。 | `git diff --check`；人工复核文档 | 2026-11-22 |
| TASK-008 | Completed | 全量验证：后端 pytest/ruff，前端 typecheck/test/build，Playwright 覆盖 24 张投影表和新页面，局域网服务冒烟。 | `cd web/backend && .venv/bin/pytest -q && .venv/bin/ruff check app tests`；`cd web/frontend && npm run typecheck && npm run test && npm run build`；Playwright 冒烟 | 2026-11-22 |

## 执行记录

- 2026-11-22：TASK-001 ~ TASK-008 完成。后端 65 个 pytest、Ruff check/format 通过；前端 57 个 Vitest、typecheck、build 通过。Playwright 覆盖 24 张投影表、Bangumi/Bilibili 照片墙与表格切换、Bangumi facet、CNBlog/QiReader 正文、Twitter/V2EX/知乎来源与 V2EX 回复，页面无报错。

## 涉及文件

- **FILE-001**：`web/backend/app/models.py` — `search_columns` 请求字段。
- **FILE-002**：`web/backend/app/query.py` — 显式搜索列和 JSON 文本搜索。
- **FILE-003**：`web/backend/tests/test_query.py`、`web/backend/tests/test_query_api.py` — 搜索列测试。
- **FILE-004**：`web/frontend/src/config/platforms.ts` — 平台主表和指标。
- **FILE-005**：`web/frontend/src/config/tables.ts` — 照片墙、facet、虚拟列、收藏夹、搜索列。
- **FILE-006**：`web/frontend/src/config/details-types.ts`、`web/frontend/src/config/details.ts` — `lookup` / `sources` / `children` / `folders`。
- **FILE-007**：`web/frontend/src/config/*.test.ts` — 配置回归测试。
- **FILE-008**：`web/frontend/src/components/GalleryGrid.vue`、`web/frontend/src/components/FacetBar.vue` — 照片墙和 facet 组件。
- **FILE-009**：`web/frontend/src/utils/gallery.ts`、`web/frontend/src/utils/extras.ts`、`web/frontend/src/composables/useDetailExtras.ts` 及测试 — 卡片和详情合并纯函数/加载逻辑。
- **FILE-010**：`web/frontend/src/views/TableView.vue` — 列表页整合。
- **FILE-011**：`web/frontend/src/views/DetailView.vue` — 详情页整合。
- **FILE-012**：`web/frontend/src/views/HomeView.vue`、`web/frontend/src/components/PlatformNav.vue` — 首页和导航文案。
- **FILE-013**：`web/frontend/src/api/types.ts` — `search_columns` 类型。
- **FILE-014**：`docs/design/web-data-browser.md`、`web/README.md`、`web/frontend/README.md` — 设计和说明。

## 测试与验证

- **TEST-001**：`cd web/backend && .venv/bin/pytest -q` 全绿；`ruff check app tests` 通过。
- **TEST-002**：`cd web/frontend && npm run typecheck && npm run test && npm run build` 全绿。
- **TEST-003**：Playwright 覆盖 Bangumi/Bilibili 照片墙与表格切换、Bangumi facet 计数、CNBlog/QiReader 正文、Twitter/V2EX/知乎来源、V2EX 回复。
- **TEST-004**：24 张投影表仍可打开，无 ID 表头、无页面报错、表格高度等于视口。

## 风险与遗留

- **RISK-001**：Bangumi facet 计数额外发约 11 个 `COUNT(*)`；数据量增大后再合并为后端 group-by。
- **RISK-002**：照片墙远程封面受网络和防盗链影响；已做懒加载和占位回退。
- **RISK-003**：CNBlog 旧文章正文为空，详情只能提示“正文抓取为空”；修复需要 exporter 侧 HTML fallback，另开分支。
- **RISK-004**：V2EX 回复最多 200 条，超出的回复不在详情页展示。
