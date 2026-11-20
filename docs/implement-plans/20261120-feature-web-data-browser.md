---
goal: 在 web/ 下实现独立的前后端分离数据浏览器，覆盖 10 个平台投影表与 raw 层，只读、局域网可用。
created: 2026-11-20
modified: 2026-11-20
status: Planned
design: docs/design/web-data-browser.md
---

# Web 数据浏览器实现计划

## 目标

交付 `web/backend`（FastAPI 只读 API）和 `web/frontend`（Vue 3 + OpenVue 1.1.1），支持 schema 驱动的表浏览、搜索/过滤/排序/分页、可读详情渲染，以及 raw run/response 浏览；不改主包和 CLI。

## 约束与前提

- **CON-001**：v1 只读，不写投影表、不写扩展表；未来写入放独立 `data/user.db`。
- **CON-002**：独立 `web/`，不改主包 `pyproject.toml`，不加 `eto` 子命令。
- **CON-003**：Python 3.12；Node 20+；SQLite 文件默认 `data/eto.db`，可用 `ETO_DB` 覆盖；后端与 `eto` 用同一 OS 用户运行。
- **CON-004**：局域网单用户、无登录；默认只绑 `127.0.0.1`，LAN 访问显式 `--host 0.0.0.0`。
- **CON-005**：搜索用 `LIKE`，不建 FTS5。
- **CON-006**：所有表名/列名/操作符走 allowlist，值参数化，不提供任意 SQL 接口。
- **CON-007**：`sync_response.body` 不出现在通用表 API；只能通过 raw 详情解压，2MB 截断。
- **CON-008**：`openvue` / `@openvue/themes` 锁精确版本 `1.1.1`，升级前跑全量冒烟；OpenVue 是年轻 fork，不自动跟随 minor。
- **GUD-001**：沿用仓库风格：Ruff 单引号、无 emoji、小于 1000 行/文件；文档用简体中文。
- **GUD-002**：依赖最小化：后端 FastAPI/uvicorn；前端 Vue/Router/OpenVue 1.1.1/dayjs/DOMPurify/marked，不用 ORM、Pinia、Axios。
- **GUD-003**：每个后端模块配 pytest；前端纯函数（主键编解码、时间格式化、渲染器选择）配 Vitest。

## 实施步骤

### 阶段 1：后端只读 API

完成标准：`uvicorn app.main:app` 启动，`/api/health`、`/api/schema`、通用查询/行详情、raw 接口全部可用，pytest 通过。

| Task | Status | Description | Verification Steps | Date |
| --- | --- | --- | --- | --- |
| TASK-001 | Completed | 创建 `web/backend` 骨架：`requirements.txt`、`app/config.py`、`app/db.py`、`app/main.py`，实现只读连接与 `/api/health`。 | `cd web/backend && pip install -r requirements.txt && uvicorn app.main:app --port 8787`；`curl -s localhost:8787/api/health` 返回 `status=ok`、`readonly=true`、`user_version=7`；`pytest -q tests/test_health.py` 通过。 | 2026-11-20 |
| TASK-002 | Completed | 实现 `app/schema.py` 与 `/api/schema`：表、列、主键顺序、JSON 列、`hidden` 列、平台分组、行数。 | `curl -s localhost:8787/api/schema` 包含 26 张表；`zhihu_content` 主键为 `content_id`，`bilibili_fav_item` 主键为 `fav_id,media_id`，`sync_response.body` 为 `hidden`；`pytest -q tests/test_schema.py` 通过。 | 2026-11-20 |
| TASK-003 | Completed | 实现 `app/models.py` 与 `app/query.py` 的请求模型和 SQL 构建：过滤操作符、搜索、排序、分页、列 allowlist、参数化。 | `pytest -q tests/test_query.py` 覆盖 `eq/gte/lte/like/in/is_null`、复合主键排序、未知表/列/操作符报 400、注入字符串只作为参数值。 | 2026-11-20 |
| TASK-004 | Completed | 实现 `POST /api/tables/{table}/query`，返回 `rows/total/columns`，解析 `*_json` 列。 | `curl -s -X POST localhost:8787/api/tables/zhihu_content/query -H 'content-type: application/json' -d '{"columns":["content_id","title"],"sort":[{"column":"updated_time","dir":"desc"}],"limit":5}'` 返回 5 行和 `total`；`twitter_tweet.author_json` 返回对象；`curl .../query -d '{"limit":999}'` 被截到 200；pytest 通过。 | 2026-11-20 |
| TASK-005 | Completed | 实现 `POST /api/tables/{table}/row`，按主键取单行，支持复合主键。 | `curl -s -X POST .../tables/zhihu_content/row -d '{"pk":{"content_id":"<id>"}}'` 返回单行；复合主键 `bilibili_fav_item` 可查；不存在返回 404；pytest 通过。 | 2026-11-20 |
| TASK-006 | Completed | 实现 `app/raw.py` 与 raw 接口：run 列表/详情、response 列表/详情、zlib 解压、JSON/文本识别、2MB 截断。 | `/api/runs?limit=5` 返回 695 条中的 5 条；`/api/responses?limit=5` 不含 `body`；`/api/responses/{id}` 返回解析后的 JSON 或文本，`body_truncated` 正确；pytest 通过。 | 2026-11-20 |

#### TASK-001 执行记录

- **状态**: 已完成（2026-11-20）
- **变更摘要**: 新增 `web/backend` FastAPI 骨架、只读 SQLite 连接与 `/api/health`，附带 pytest 夹具和健康检查测试。
- **逻辑变更**:
  - **新增**: `app/config.py` 解析 `ETO_DB`（相对路径按仓库根解析）、2MB raw 截断阈值与 CORS 白名单；`app/db.py` 提供 `mode=ro` + `query_only` + `busy_timeout` 的单请求连接与健康检查；`app/main.py` 注册 CORS 与健康路由；`tests/conftest.py` 建立最小临时库；`tests/test_health.py` 覆盖正常、只读拒写和库缺失 503。
  - **修改**（及原因）: 无既有代码改动；仓库 `.gitignore` 已覆盖 `.venv/`，无需调整。
- **相关代码**: `web/backend/app/config.py`（`get_db_path`、`get_frontend_dist`）、`web/backend/app/db.py`（`open_readonly`、`get_connection`、`health`）、`web/backend/app/main.py`。
- **验证结果**: `pytest -q tests/test_health.py` 3 项通过；本机 8787 端口被其他服务占用，改用 8788 启动 uvicorn，`/api/health` 返回 `status=ok`、`readonly=true`、`user_version=7`。

#### TASK-002 执行记录

- **状态**: 已完成（2026-11-20）
- **变更摘要**: 新增 schema 内省模块与 `/api/schema`，按真实数据库动态输出 26 张表的平台分组、主键顺序、JSON/hidden 标记和行数。
- **逻辑变更**:
  - **新增**: `app/schema.py` 读取 `sqlite_master`/`PRAGMA table_info`；`sync_*` 表归入 `raw`，其余按前缀分组；`*_json` 与 `request` 标记 JSON，`sync_response.body` 标记 hidden；`describe_database` 汇总每平台表数。
  - **修改**（及原因）: `app/main.py` 挂载 `/api/schema`；`tests/conftest.py` 增加复合主键表 `bilibili_fav_item`，用于覆盖主键顺序。
- **相关代码**: `web/backend/app/schema.py`（`describe_table`、`describe_database`、`find_table`）、`web/backend/app/main.py`。
- **验证结果**: `pytest -q tests/test_schema.py` 4 项通过；真实库上 `/api/schema` 返回 26 张表，主键与 hidden 标记符合预期（8787 被占用，使用 8788 验证）。

#### TASK-003 执行记录

- **状态**: 已完成（2026-11-20）
- **变更摘要**: 新增查询请求模型与 SQL 构建层，实现全部过滤操作符、搜索、稳定排序、分页、列 allowlist 和参数化执行。
- **逻辑变更**:
  - **新增**: `app/models.py` 定义 `Filter`/`SortSpec`/`QueryRequest`/`RowRequest`/`QueryResponse`；`app/query.py` 提供 `build_where`/`build_select`/`build_count`/`run_query`/`fetch_row`，未知表、列、操作符、排序方向返回 400，hidden 列不可查询，JSON 列只允许 null 判断，`limit` 上限 200。
  - **修改**（及原因）: `app/schema.py` 的 `find_table` 不再执行 `COUNT(*)`，避免每次查询重复统计大表；新增测试数据使用复合主键表。
- **相关代码**: `web/backend/app/query.py`（`run_query`、`fetch_row`、`build_select`）、`web/backend/app/models.py`。
- **验证结果**: `pytest -q tests/test_query.py` 25 项通过，覆盖 10 种操作符、复合主键排序、注入字符串参数化、隐藏列/JSON 列限制与 400 错误路径。

#### TASK-004 执行记录

- **状态**: 已完成（2026-11-20）
- **变更摘要**: 挂载通用查询接口 `POST /api/tables/{table}/query`，返回列元数据、当页数据和过滤后的总数，并解析 JSON 列。
- **逻辑变更**:
  - **新增**: `tests/test_query_api.py` 覆盖分页/排序/JSON 解析/limit 截断/隐藏列与非法输入。
  - **修改**（及原因）: `app/main.py` 增加查询路由，复用 `query.run_query`，不新增 SQL 逻辑。
- **相关代码**: `web/backend/app/main.py`（`query_table`）、`web/backend/app/query.py`。
- **验证结果**: `pytest -q tests/test_query_api.py` 8 项通过；真实库上 `zhihu_content` 返回 5/2968 行、`twitter_tweet.author_json` 为对象、`limit=999` 截为 200。

#### TASK-005 执行记录

- **状态**: 已完成（2026-11-20）
- **变更摘要**: 新增按主键取单行的接口，支持单列与复合主键，缺行返回 404。
- **逻辑变更**:
  - **新增**: 行详情路由与 4 个 API 测试（单主键、复合主键、404、主键不完整 400）。
  - **修改**（及原因）: `app/main.py` 引入 `HTTPException` 与 `RowRequest`，行查询复用 `query.fetch_row`。
- **相关代码**: `web/backend/app/main.py`（`get_row`）、`web/backend/app/query.py`（`fetch_row`）。
- **验证结果**: `pytest -q tests/test_query_api.py` 12 项通过；真实库上 `zhihu_content` 与 `bilibili_fav_item` 均可按主键读取，缺失主键返回 404。

#### TASK-006 执行记录

- **状态**: 已完成（2026-11-20）
- **变更摘要**: 新增 raw 层浏览接口：run 列表/详情、response 列表/详情，详情按需 zlib 解压并识别 JSON/文本，超过 2MB 截断。
- **逻辑变更**:
  - **新增**: `app/raw.py` 提供 `list_runs`/`get_run`/`list_responses`/`get_response`；run 列表按 id 倒序并支持平台/状态过滤；response 列表通过 join 支持平台过滤、不返回 `body`；详情返回 `body_size`、`body_truncated`、`content_type`。
  - **修改**（及原因）: `app/main.py` 挂载 4 个 raw 路由；`tests/conftest.py` 补齐 `sync_run` 真实列（`scope`/`command`/`finished_at`/`error`），避免测试 schema 与生产漂移。
- **相关代码**: `web/backend/app/raw.py`（`get_response`、`list_responses`）、`web/backend/app/main.py`。
- **验证结果**: `pytest -q tests/test_raw.py` 13 项通过；真实库 `/api/runs?limit=5` 返回 695 总数中的 5 条，`/api/responses?limit=5` 共 17469 条且不含 body，response 1 解析为 JSON。

### 阶段 2：前端骨架与数据浏览

完成标准：`npm run dev` 可浏览全部平台表，列表支持搜索/筛选/排序/分页，详情按字段类型渲染。

| Task | Status | Description | Verification Steps | Date |
| --- | --- | --- | --- | --- |
| TASK-007 | Completed | 创建 Vue 3 + Vite + TypeScript + OpenVue 1.1.1 骨架，注册 Aura 主题，配置路由、API client、基础布局和 Vite `/api` proxy。 | `cd web/frontend && npm install && npm run dev`；首页请求 `/api/schema` 成功；`npm run build` 通过。 | 2026-11-20 |
| TASK-008 | Completed | 实现首页和 `PlatformNav`：按平台分组展示表名与行数，点击进入 `/t/:table`。 | 页面显示 10 个平台、26 张表；点击 `zhihu_content` 进入列表；行数与 API 一致。 | 2026-11-20 |
| TASK-009 | Completed | 实现通用列表 `TableView`/`DataTable`：用 OpenVue DataTable 的 lazy 模式接服务端分页/排序，加搜索、列选择，查询状态同步到 URL。 | 打开 `/t/zhihu_content`；翻到第 2 页；按 `updated_time` 降序；搜索关键词；刷新页面状态保留；浏览器后退恢复上一组条件；请求参数包含 `limit/offset/sort`。 | 2026-11-20 |
| TASK-010 | Completed | 实现 `FilterBar`：按列类型生成输入，支持 `eq/gte/lte/like`、数值和时间范围、增删过滤条件。 | 给 `zhihu_content.updated_time` 加 `gte` 过滤，列表行数变化；删除条件恢复；URL 包含过滤状态。 | 2026-11-20 |
| TASK-011 | Completed | 实现详情页与主键路由：`/t/:table/:pk`，`pk` 为 base64url(JSON)，支持单列/复合主键。 | 点击 `zhihu_content` 行进入详情；`bilibili_fav_item` 复合主键详情可打开；直接访问详情 URL 可加载；不存在显示 404 提示。 | 2026-11-20 |
| TASK-012 | Completed | 实现 `FieldRenderer`/`JsonTree` 及 `time/html/renderers` 工具，使用 OpenVue `Tag`/`Image`/`Tree`：文本、长文本、链接、图片、时间、布尔/数字、JSON 树、HTML/Markdown 清洗渲染、`response_id` 跳转。 | 打开 `twitter_tweet` 详情，`author_json` 显示折叠树；`zhihu_content.body_html` 渲染富文本且脚本被清洗；`github_star.readme` 按 Markdown 渲染；`bilibili_media` 显示封面；`v2ex_topic` 的 `response_id` 可跳 raw；时间按配置格式化。 | 2026-11-20 |
| TASK-013 | Completed | 编写 `src/config/tables.ts`，为 10 个平台配置显示名、标题列、列表列、默认排序、时间单位、HTML/Markdown/图片列、隐藏列；未知表走 fallback。 | 逐个平台打开首表，列表有可读标题和默认排序；大字段不在列表请求中；未知新表仍可浏览；手工检查 10 个平台。 | 2026-11-20 |

#### TASK-007 执行记录

- **状态**: 已完成（2026-11-20）
- **变更摘要**: 建立 Vue 3 + Vite + TypeScript + OpenVue 1.1.1 前端骨架，接入 Aura 主题、路由、API client、基础布局和开发代理。
- **逻辑变更**:
  - **新增**: `package.json`（OpenVue/themes 精确 1.1.1）、`vite.config.ts`（`/api` 默认代理 8787，可用 `VITE_API_TARGET` 覆盖）、`tsconfig.json`、`src/main.ts`、`src/App.vue`、`src/router.ts`、`src/api/{client,types}.ts`、`src/views/HomeView.vue` 与基础样式。
  - **修改**（及原因）: Vitest 从 5.x 降到 3.2.7，规避 npm 10 在可选 peer 依赖上的 `edgesOut` 解析崩溃；其余版本按当前 npm 可用版本锁定。
- **相关代码**: `web/frontend/src/main.ts`、`web/frontend/vite.config.ts`、`web/frontend/src/api/client.ts`。
- **验证结果**: `npm run build` 通过；Vite dev server 200，经 proxy 请求 `/api/schema` 返回真实表结构（本机用 5174/8788 避开端口占用）。

#### TASK-008 执行记录

- **状态**: 已完成（2026-11-20）
- **变更摘要**: 首页按平台分组展示 10 个平台、26 张表及行数，左侧 `PlatformNav` 提供同样的分组导航，点击表名进入 `/t/:table`。
- **逻辑变更**:
  - **新增**: `components/PlatformNav.vue`、`composables/useSchema.ts`（页面级 schema 缓存，避免导航与首页重复请求）、`views/TableView.vue` 占位、`config/tables.ts` 平台显示名与 fallback。
  - **修改**（及原因）: `App.vue` 改为侧栏 + 主区布局；`HomeView.vue` 增加平台卡片与 raw 入口；`router.ts` 增加 `/t/:table` 路由。
- **相关代码**: `web/frontend/src/components/PlatformNav.vue`、`web/frontend/src/views/HomeView.vue`、`web/frontend/src/composables/useSchema.ts`。
- **验证结果**: `npm run build` 通过；真实 `/api/schema` 统计为 10 个平台 + raw、共 26 张表，行数与接口一致。

#### TASK-009 执行记录

- **状态**: 已完成（2026-11-20）
- **变更摘要**: 实现 schema 驱动的通用列表页，OpenVue DataTable lazy 服务端分页/排序，支持搜索与列选择，全部查询状态同步到 URL。
- **逻辑变更**:
  - **新增**: `TableView.vue` 完整列表逻辑；`api/client.ts` 增加 `queryTable`；`api/types.ts` 增加查询类型；`config/tables.ts` 增加 `defaultListColumns`，默认列按主键优先并排除大字段/JSON。
  - **修改**（及原因）: 列表请求显式传列，避免 `body_html` 等大字段进入列表；URL 作为唯一状态源，`hydrate` + `watch(route.query)` 保证刷新与前进/后退一致；请求序号防抖避免乱序响应覆盖。
- **相关代码**: `web/frontend/src/views/TableView.vue`、`web/frontend/src/config/tables.ts`（`defaultListColumns`）、`web/frontend/src/api/client.ts`。
- **验证结果**: `npm run build` 通过；Playwright 实测第 2 页请求 `offset=50`、`title` 降序请求 `sort=[{title,desc}]`、搜索请求含 `search` 且 URL 为 `q=编程`、刷新与后退均恢复条件、列选择后请求列包含 `updated_time`。

#### TASK-010 执行记录

- **状态**: 已完成（2026-11-20）
- **变更摘要**: 新增按列类型生成输入与操作符的过滤条，支持文本/数值/时间列，过滤条件保存在 URL 的 `filters` JSON 参数中。
- **逻辑变更**:
  - **新增**: `components/FilterBar.vue` 支持增删条件、按类型切换 `eq/ne/gt/gte/lt/lte/like/is_null/not_null`、时间列使用 `datetime-local` 并转换为 epoch；`utils/time.ts` 提供时间输入双向转换。
  - **修改**（及原因）: `TableView.vue` 从 URL 解析/校验过滤条件并传给请求；空过滤从 URL 移除；JSON 列只提供 null 判断；无效旧链接条目直接丢弃。
- **相关代码**: `web/frontend/src/components/FilterBar.vue`、`web/frontend/src/utils/time.ts`、`web/frontend/src/views/TableView.vue`。
- **验证结果**: `npm run build` 通过；Playwright 实测 `updated_time >= 2025-01-01` 后总数 2968 → 1434，请求包含 epoch 值，URL 含 `filters`，删除后 URL 与总数恢复。

#### TASK-011 执行记录

- **状态**: 已完成（2026-11-20）
- **变更摘要**: 新增 base64url 主键编解码、详情路由与详情页，列表行点击可进入详情，支持单列与复合主键。
- **逻辑变更**:
  - **新增**: `utils/pk.ts`（base64url JSON 编解码，支持 UTF-8）、`views/DetailView.vue`（加载/404/错误状态、字段表）、`api.getRow`。
  - **修改**（及原因）: 列表请求始终并上主键列，避免用户隐藏主键后无法生成详情链接；详情路由 `/t/:table/:pk`；DataTable 增加 `row-click` 与手型光标。
- **相关代码**: `web/frontend/src/utils/pk.ts`、`web/frontend/src/views/DetailView.vue`、`web/frontend/src/views/TableView.vue`。
- **验证结果**: `npm run build` 通过；Playwright 实测 `zhihu_content` 行点击进入详情且标题匹配、刷新详情 URL 正常；`bilibili_fav_item` 复合主键解码为 `{fav_id, media_id}`；不存在主键显示“记录不存在”。

#### TASK-012 执行记录

- **状态**: 已完成（2026-11-20）
- **变更摘要**: 新增字段渲染器、JSON 树与 HTML/Markdown 清洗工具，详情页按字段类型渲染文本、链接、图片、时间、布尔、JSON、raw 链接。
- **逻辑变更**:
  - **新增**: `components/FieldRenderer.vue`、`components/JsonTree.vue`（OpenVue Tree）、`utils/html.ts`（DOMPurify + marked，外链自动加 `noopener noreferrer`）、`utils/renderers.ts`（类型选择、图片 URL 提取）、`formatTime`；`config/tables.ts` 增加字段渲染与时间单位覆盖。
  - **修改**（及原因）: 详情页改用 `FieldRenderer`；新增 raw 页面占位路由，避免首页/详情中的 raw 链接在 raw 层实现前失效。
- **相关代码**: `web/frontend/src/components/FieldRenderer.vue`、`web/frontend/src/components/JsonTree.vue`、`web/frontend/src/utils/{html,renderers,time}.ts`。
- **验证结果**: `npm run build` 通过；Playwright 实测 `twitter_tweet.author_json` 输出 JSON 树、`zhihu_content.body_html` 富文本且注入的 `<script>`/`onerror` 被清洗、`github_star.readme` 渲染出 Markdown 标题、`bilibili_media.cover` 显示图片、`v2ex_topic.response_id` 生成 `/raw/responses/11063` 链接、`created` 格式化为 `2012-09-16 12:07:29`。

#### TASK-013 执行记录

- **状态**: 已完成（2026-11-20）
- **变更摘要**: 为 26 张表补齐展示配置：中文标签、标题列、列表列、默认排序、列表隐藏列；保留未知表的 schema fallback。
- **逻辑变更**:
  - **新增**: `TABLE_CONFIGS` 覆盖 10 个平台与 raw 表；`tableLabel`/`titleColumnFor`/`defaultSortFor`/`hiddenColumnsFor`/`listColumnsFor`；详情页显示“标签 · 标题列”。
  - **修改**（及原因）: 列表使用配置列与默认排序，避免拉取 `body_html`、`readme`、`content` 等大字段；列选择器过滤配置隐藏列；未知表仍用 `defaultListColumns` 推断。
- **相关代码**: `web/frontend/src/config/tables.ts`、`web/frontend/src/views/TableView.vue`、`web/frontend/src/views/DetailView.vue`。
- **验证结果**: `npm run build` 通过；Playwright 逐个打开 10 个平台首表，均显示中文标题、默认排序和 50 行列表，请求列不含大字段；不存在的表显示“未知表”而非崩溃。

### 阶段 3：raw 层 UI

完成标准：raw run/response 可浏览，body 解压后以 JSON 树或文本展示，截断有提示。

| Task | Status | Description | Verification Steps | Date |
| --- | --- | --- | --- | --- |
| TASK-014 | Completed | 实现 `/raw` 与 `/raw/runs/:id`：run 列表、平台/状态过滤、分页、run 内 response 列表。 | `/raw` 显示 695 个 run；按 `platform=zhihu`、`status=success` 过滤；打开 run 看到 response 列表；分页正常。 | 2026-11-20 |
| TASK-015 | Completed | 实现 `/raw/responses/:id`：JSON 树/文本、截断提示、复制、下载。 | 打开一个 JSON response，树可展开；打开纯文本 response；大于 2MB 的 response 显示截断提示；复制和下载内容正确。 | 2026-11-20 |

#### TASK-014 执行记录

- **状态**: 已完成（2026-11-20）
- **变更摘要**: 实现 raw run 列表与 run 详情，支持平台/状态过滤、分页和 run 内 response 列表跳转。
- **逻辑变更**:
  - **新增**: `views/RawRunsView.vue`、`views/RawRunView.vue`；`api/client.ts` 增加 `runs`/`run`/`responses`/`response` 与查询串序列化；`api/types.ts` 增加 raw 类型。
  - **修改**（及原因）: raw 页面状态同步到 URL（`platform`/`status`/`offset`/`limit`），刷新和后退保持一致；run 详情按 `run_id` 拉 response 并分页。
- **相关代码**: `web/frontend/src/views/RawRunsView.vue`、`web/frontend/src/views/RawRunView.vue`、`web/frontend/src/api/client.ts`。
- **验证结果**: `npm run build` 通过；Playwright 实测 `/raw` 显示 695 个 run、翻页 `offset=50`、按 `platform=zhihu` 过滤为 1 个 run、run #354 显示 50 条 response 且行点击跳到 `/raw/responses/2653`。

#### TASK-015 执行记录

- **状态**: 已完成（2026-11-20）
- **变更摘要**: 实现 raw response 详情，按 content_type 展示 JSON 树或文本，支持截断提示、复制与下载。
- **逻辑变更**:
  - **新增**: `views/RawResponseView.vue`，展示 response 元数据、请求参数、body；复制走 Clipboard API，下载用 Blob + 临时 URL。
  - **修改**（及原因）: 超过 512KB 的 JSON 默认显示文本，避免一次性构建巨大树；截断响应明确提示复制/下载内容同为截断结果。
- **相关代码**: `web/frontend/src/views/RawResponseView.vue`。
- **验证结果**: `npm run build` 通过；Playwright 实测 JSON response 树可展开、复制内容与剪贴板一致、下载 `response-1.json` 内容一致；纯文本 HTML response 正确显示；空 body 显示传输错误提示；模拟 3MB 响应显示 2MB 截断警告。

#### TASK-016 执行记录

- **状态**: 已完成（2026-11-20）
- **变更摘要**: FastAPI 在生产模式托管 `web/frontend/dist` 并提供 SPA 深链 fallback；未知 `/api/*` 保持 JSON 404。
- **逻辑变更**:
  - **新增**: `app/main.py` 末尾 catch-all 路由，优先返回 dist 内真实文件，否则返回 `index.html`；路径穿越被 `is_relative_to` 拦截；`tests/test_static.py` 覆盖根路径、深链、静态资源、未知 API 与 dist 缺失。
  - **修改**（及原因）: 无既有行为改动；CORS 仍只允许 Vite 开发源。
- **相关代码**: `web/backend/app/main.py`（`serve_frontend`）、`web/backend/tests/test_static.py`。
- **验证结果**: `pytest -q tests/test_static.py` 4 项通过；生产端口 8789 实测 `/` 与 `/t/zhihu_content` 返回 SPA HTML、`/api/health` 200、`/api/nope` 404；允许源返回 CORS 头、非允许源无 CORS 头。

### 阶段 4：集成、文档与验收

完成标准：生产模式单进程可访问，README 可按步骤复现，测试与冒烟全部通过。

| Task | Status | Description | Verification Steps | Date |
| --- | --- | --- | --- | --- |
| TASK-016 | Completed | FastAPI 托管 `web/frontend/dist`，加 SPA fallback；开发 CORS 仅允许 Vite 源。 | `cd web/frontend && npm run build`；`cd web/backend && uvicorn app.main:app --port 8787`；访问 `http://127.0.0.1:8787/` 和深链 `/t/zhihu_content` 正常；开发模式 `npm run dev` 经 proxy 调 API 正常。 | 2026-11-20 |
| TASK-017 | Pending | 编写 `web/README.md`、后端/前端 README：安装、开发、生产、LAN 绑定、无鉴权风险、未来 token 提醒，并注明选择 OpenVue 1.1.1（MIT fork）的原因和锁版本策略。 | 按 README 从干净 venv + `npm ci` 启动成功；README 明确 `--host 0.0.0.0` 的风险。 | |
| TASK-018 | Pending | 补齐后端 pytest、前端 Vitest（主键编解码/时间格式化/渲染器选择）、`typecheck`/`build`，执行全平台 + raw 冒烟和性能检查。 | `cd web/backend && pytest -q` 全通过；`cd web/frontend && npm run typecheck && npm run test && npm run build` 全通过；10 平台 + raw 冒烟清单通过；当前库列表查询 p95 < 100ms、2MB raw 详情 < 500ms。 | |

## 涉及文件

- **FILE-001**：`web/backend/app/config.py` — DB 路径、截断阈值、CORS 配置。
- **FILE-002**：`web/backend/app/db.py` — 只读 SQLite 连接与健康检查。
- **FILE-003**：`web/backend/app/schema.py` — 表/列/主键/JSON/hidden 内省。
- **FILE-004**：`web/backend/app/models.py` — 查询请求/响应模型。
- **FILE-005**：`web/backend/app/query.py` — allowlist、过滤、搜索、排序、分页、JSON 解析。
- **FILE-006**：`web/backend/app/raw.py` — run/response 查询、zlib 解压、截断。
- **FILE-007**：`web/backend/app/main.py` — FastAPI 路由、静态托管、SPA fallback。
- **FILE-008**：`web/backend/requirements.txt`、`requirements-dev.txt` — 运行/测试依赖。
- **FILE-009**：`web/backend/tests/*` — 后端测试。
- **FILE-010**：`web/frontend/src/config/tables.ts` — 10 平台展示配置。
- **FILE-011**：`web/frontend/src/components/FieldRenderer.vue`、`JsonTree.vue` — 详情渲染。
- **FILE-012**：`web/frontend/src/utils/{pk,time,html,renderers}.ts` — 前端纯函数。
- **FILE-013**：`web/frontend/src/views/*` — 首页、列表、详情、raw 页面。
- **FILE-014**：`web/README.md` — 安装、运行、LAN 风险。
- **FILE-015**：`web/frontend/package.json` — OpenVue 1.1.1 精确版本、脚本与依赖。

## 测试与验证

- **TEST-001**：`cd web/backend && pytest -q` 覆盖 schema、查询构建、API、raw。
- **TEST-002**：`cd web/frontend && npm run typecheck && npm run test && npm run build`。
- **TEST-003**：手工冒烟 10 个平台：OpenVue DataTable lazy 分页/排序、搜索、过滤、详情、HTML/图片/JSON/时间。
- **TEST-004**：raw 冒烟：run、response 列表/详情、截断、复制/下载。
- **TEST-005**：`eto --db-only zhihu` 运行期间浏览不报错。
- **TEST-006**：性能：列表 p95 < 100ms；2MB raw 详情 < 500ms。

## 风险与遗留

- **RISK-001**：无鉴权 LAN 暴露私人数据；默认 `127.0.0.1`，写入前加 token。
- **RISK-002**：WAL 只读连接需要 `-shm` 权限；同用户运行，必要时改读写连接 + `query_only`。
- **RISK-003**：`LIKE` 大表全表扫描；数据量上来后评估 FTS5。
- **RISK-004**：HTML 清洗依赖 DOMPurify；禁止绕过。
- **RISK-005**：前端未接入 CI；先本地 `typecheck/build` + 冒烟，CI 另立任务。
- **RISK-006**：平台时间格式和展示配置需要维护；未配置时显示原值。
- **RISK-007**：未来写入需要 `data/user.db` 和 token，本期不实现，但设计边界已固定。
- **RISK-008**：OpenVue 是年轻 fork；锁 `1.1.1`，升级前跑全量冒烟，维护停滞则回退 PrimeVue 4.5.5 或 Element Plus。
