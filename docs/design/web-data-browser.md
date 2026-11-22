---
status: 已实现
created: 2026-11-20
modified: 2026-11-22
tags: [feature]
---

# Web 数据浏览器

## 背景与目标

当前仓库通过 `eto` 把 10 个平台的数据写入 SQLite：raw 层（`sync_run` / `sync_response`）保留原始响应，投影层把 raw 重放成 24 张平台表。现在只有 CLI 和 Markdown 输出，没有交互式查看入口。

本特性在仓库根目录新增独立的 `web/`，提供局域网内可用的数据浏览器：

- 实时读 `data/eto.db`，不重启、不导入、不复制。
- 覆盖 10 个平台的全部投影表和 raw 层。
- 前端 Vue 3，后端 FastAPI，前后端分离，API 可被其他客户端复用。
- v1 只读；未来标签、笔记、评分等扩展数据不写投影表。

目标不是替代 Obsidian 导出，而是给“数据是否正确、某条记录长什么样、raw 响应是什么”提供一个可视化入口。

当前库实测：297MB、26 张表、`user_version=7`、`sync_run` 695 行、`sync_response` 17,469 行；典型投影列表查询 0.02ms。`sync_response.body` 是 zlib 压缩的 BLOB，压缩后约 76.5MB。

## 范围

- 包含：
  - `web/backend`：FastAPI 只读 API，schema 内省、通用查询、行详情、raw 浏览。
  - `web/frontend`：Vue 3 + Vite + TypeScript + OpenVue 1.1.1，平台/表导航、列表、筛选、详情、raw 页面。
  - 局域网单用户，无登录。
  - 生产模式由 FastAPI 托管 `frontend/dist`；开发模式 Vite proxy。
- 不包含：
  - 写入、标签、笔记、评分、删除、批量操作；这些放到后续版本。
  - 登录、权限、多用户、多账号。
  - FTS5 全文索引；v1 用 `LIKE`。
  - 跨平台统一 `item` 模型（仓库既有非目标）。
  - 修改 `eto` CLI、主包 `pyproject.toml` 或 Markdown 导出流程。
  - 移动端适配；以桌面浏览器为主。
  - 删除检测、数据脱敏。

## 方案设计

### 目录布局

```text
web/
├── README.md                  # 安装、启动、局域网说明
├── backend/
│   ├── requirements.txt
│   ├── requirements-dev.txt
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py            # FastAPI 实例、路由挂载、静态文件
│   │   ├── config.py          # ETO_DB、截断阈值、CORS
│   │   ├── db.py              # 只读连接、健康检查
│   │   ├── schema.py          # sqlite_master / PRAGMA 内省
│   │   ├── models.py          # 查询请求/响应模型
│   │   ├── query.py           # 通用 SQL 构建与执行
│   │   └── raw.py             # run/response、zlib 解压
│   └── tests/
│       ├── conftest.py
│       ├── test_health.py
│       ├── test_schema.py
│       ├── test_query.py
│       ├── test_query_api.py
│       └── test_raw.py
└── frontend/
    ├── package.json
    ├── vite.config.ts
    ├── tsconfig.json
    ├── index.html
    └── src/
        ├── main.ts
        ├── App.vue
        ├── router.ts
        ├── api/client.ts
        ├── api/types.ts
        ├── views/{Home,Table,Detail,RawRuns,RawRun,RawResponse}View.vue
        ├── components/{PlatformNav,DataTable,FilterBar,FieldRenderer,JsonTree}.vue
        ├── composables/useTableQuery.ts
        ├── config/tables.ts
        ├── utils/{pk,time,html,renderers}.ts
        └── styles/main.css
```

### 后端

- FastAPI + uvicorn，Python 3.12，路由用同步函数（FastAPI 线程池），不引入 ORM。
- DB 路径：`ETO_DB` 环境变量，默认仓库根 `data/eto.db`；相对路径按仓库根解析。
- 每请求一个只读连接：`sqlite3.connect('file:<path>?mode=ro', uri=True)`，`PRAGMA query_only=ON`、`PRAGMA busy_timeout=5000`；请求结束关闭。不执行 migration，不 chmod。
- 启动时只检查文件存在；健康检查返回 `PRAGMA user_version`，不硬编码版本。
- schema 内省：
  - `sqlite_master` 取非 `sqlite_%` 表；`PRAGMA table_info` 取列、类型、非空、主键顺序。
  - 平台名 = 表名第一个 `_` 之前；`sync_run` / `sync_response` 归为 `raw`。
  - `*_json` 和 `request` 标记为 JSON 列；`sync_response.body` 标记 `hidden`。
  - 每表 `COUNT(*)` 作为 `row_count`。
- 通用查询：
  - 表名、列名、排序方向、过滤操作符都从 schema 允许列表校验；值全部参数化；标识符用双引号包裹。
  - 过滤操作符：`eq`、`ne`、`gt`、`gte`、`lt`、`lte`、`like`、`in`、`is_null`、`not_null`；BLOB 和 JSON 列只允许 `is_null` / `not_null`。
  - `search`：对选中表的非 JSON `TEXT` 列做 `LIKE '%' || ? || '%' ESCAPE '\'`；用户输入中的 `\`、`%`、`_` 先转义；`body`、`content_json` 等大字段不参与。
  - 排序：用户指定列后追加主键列作为稳定排序；当前所有表都有主键。
  - 分页：`limit` 默认 50、最大 200；`offset` 默认 0。
  - `columns` 可选；不传返回除 `hidden` 外的全部列。列表页由前端显式传列，避免拉取大字段。
  - 响应中的 JSON 列解析为对象/数组；解析失败保留字符串。
  - `total` 用同一过滤条件 `COUNT(*)` 返回。
- 行详情：按主键对象做等值过滤，`limit=1`；支持复合主键。
- raw：
  - `GET /api/runs`：`sync_run` 列表，支持 `platform`、`status`、分页。
  - `GET /api/runs/{id}`：run 详情 + 响应数量。
  - `GET /api/responses`：列表不返回 `body`，支持 `run_id`、`platform`、`endpoint`、`status_code`、`q`、分页。
  - `GET /api/responses/{id}`：zlib 解压 `body`；未截断时尝试 JSON 解析，失败按文本返回；超过 2MB 时只返回前 2MB 并标记 `body_truncated=true`，不尝试 JSON 解析。
  - 通用表 API 不允许选择 `sync_response.body`。
- 错误：未知表/列/操作符 400；行不存在 404；数据库文件不存在 503；响应体统一 `{"detail": "..."}`。
- CORS：仅开发模式允许 `http://localhost:5173` 和 `http://127.0.0.1:5173`；生产同源，不配通配。
- 静态托管：`web/frontend/dist` 存在时挂载 `/`，并为 Vue Router 提供 SPA fallback；不存在时只提供 API。

### 接口

#### `GET /api/health`

```json
{"status":"ok","db":"/repo/data/eto.db","user_version":7,"readonly":true}
```

#### `GET /api/schema`

```json
{
  "tables": [
    {
      "name": "zhihu_content",
      "platform": "zhihu",
      "kind": "projection",
      "row_count": 2968,
      "primary_key": ["content_id"],
      "columns": [
        {"name": "content_id", "type": "TEXT", "not_null": true, "pk": 1, "json": false, "hidden": false},
        {"name": "author_json", "type": "TEXT", "not_null": false, "pk": 0, "json": true, "hidden": false}
      ]
    }
  ]
}
```

#### `POST /api/tables/{table}/query`

请求：

```json
{
  "columns": ["content_id", "title", "updated_time"],
  "filters": [
    {"column": "updated_time", "op": "gte", "value": 1700000000}
  ],
  "search": "关键词",
  "sort": [{"column": "updated_time", "dir": "desc"}],
  "limit": 50,
  "offset": 0
}
```

响应：

```json
{
  "table": "zhihu_content",
  "columns": [{"name": "content_id", "type": "TEXT", "json": false}],
  "rows": [{"content_id": "123", "title": "...", "updated_time": 1700000000}],
  "total": 2968,
  "limit": 50,
  "offset": 0
}
```

#### `POST /api/tables/{table}/row`

请求：`{"pk": {"content_id": "123"}}`；响应：`{"table": "zhihu_content", "row": {...}}`。

#### raw

- `GET /api/runs?platform=zhihu&status=success&limit=50&offset=0`
- `GET /api/runs/{id}`
- `GET /api/responses?run_id=1&limit=50&offset=0`
- `GET /api/responses/{id}` → `{"id":..., "request": {...}, "body": {...}|"...", "body_truncated": false, "body_size": 12345, "content_type": "json"}`

### 前端

- Vue 3 + Vite + TypeScript + Vue Router + OpenVue 1.1.1（`openvue/datatable`、`openvue/column`、`openvue/tag`、`openvue/image`、`openvue/tree`）；`dayjs` 时间格式化，`DOMPurify` 清洗 HTML，`marked` 渲染 Markdown；不引入 Pinia/Axios，查询状态放路由 query。
- 依赖锁精确版本：`openvue@1.1.1`、`@openvue/themes@1.1.1`；OpenVue 是 2026-07 的年轻 fork，升级前跑全量冒烟。
- 布局：左侧平台导航，顶部品牌与只读状态，主区看板/列表/详情；`html,body,#app` 锁定视口高度，`app-main` 独立滚动，列表页的 DataTable 用 `scrollHeight="flex"` 占满剩余高度，分页器固定在底部。
- 列表用 OpenVue `DataTable` 的 lazy 模式：`:lazy="true"`、`:totalRecords`、`@page`、`@sort`；搜索/过滤由自定义 `FilterBar` 生成并传给后端，不用 DataTable 的本地过滤。未填值的过滤条件保留在 UI/URL 中但不发送到 SQLite，避免列表闪成 0 行。
- 路由：
  - `/` 看板：平台主内容数量、平台分布、最近同步、近期成功率；表目录收进“数据说明”弹窗。
  - `/t/:table` 列表：同平台表切换、分页、排序、搜索、列选择、过滤条；状态同步到 URL。
  - `/t/:table/:pk` 详情：`pk` 为 base64url(JSON)，支持复合主键。
  - `/raw`：run 列表。
  - `/raw/runs/:id`：该 run 的 response 列表。
  - `/raw/responses/:id`：response 详情。
- 字段可读性由 `src/config/columns.ts` 统一处理：列名中文标签、平台特定取值字典（如知乎 `answer` → 回答、Bangumi 收藏类型）、布尔/时长/时间/ID 的格式化。未知列回退到原始列名。
- 详情布局由 `src/config/details.ts` 按表声明标题、副标题、封面、正文、互动数、元信息、外链、播放器、关联记录和预览目标：
  - 文章/主题/推文：标题、作者、时间、互动数、清洗后的正文。
  - 视频：封面、UP 主、播放/收藏/弹幕数、Bilibili iframe 播放器、简介。
  - 音乐：专辑封面、歌手、专辑、时长、网易云播放器；歌单显示曲目数并链接到曲目表。
  - GitHub：仓库名、描述、Stars/Forks/Issues、标签、README（相对图片按 `raw.githubusercontent.com/<repo>/HEAD/` 解析）。
  - 关联表（`twitter_like`、`v2ex_favorite`、`zhihu_collection_item`、`bilibili_fav_item`、`netease_playlist_song`）：加载目标行并用 `PreviewCard` 展示标题、摘要和互动数，再链接到完整详情。
  - 没有平台配置的表回退到通用字段视图，并默认展开“全部字段（技术视图）”。
- 详情渲染器（按列名/类型选择，按表配置覆盖）：
  - `text`：普通文本；长文本折叠（正文区域传 `expanded` 关闭折叠）。
  - `html`：`body_html`、`content`、`content_rendered`、`long_text` 等，DOMPurify 后渲染。
  - `markdown`：`github_star.readme` 等，`marked` 渲染后再 DOMPurify；支持相对链接重写。
  - `url` / `image` / `images`：链接、封面、`images_json` / `pic_infos_json` / `attachments_json` 中的图片。
  - `datetime`：按表配置 `epoch_s` / `epoch_ms` / `iso` / `raw`；悬停显示原值。网易云时间列实际为毫秒，配置已修正。
  - `duration`：Bilibili 秒、网易云毫秒。
  - `json`：`*_json` 列用可折叠 JSON 树，不直接显示字符串。
  - `boolean` / `number` / `tag`。
  - `response_id` / `*_response_id`：跳转 raw response 详情。
- 每表配置 `src/config/tables.ts`：显示名、说明、计数单位、标题列、列表列、默认排序、时间列及单位、HTML/Markdown 列、图片列、隐藏列（`body`、`content_json`、`request` 等）。未知表走自动推断。
- 看板使用 CSS 横向条形图展示平台分布，不引入图表库；最近同步直接读取 `/api/runs?limit=200`，成功率按已完成 run 计算。
- raw 详情：JSON 树/文本、截断提示、复制、下载原始文本。
- 安全：所有 HTML 经 DOMPurify；`v-html` 只用于清洗后的内容；外链 `rel="noopener noreferrer"`。

### 未来扩展边界

- 投影表是 `rebuild_platform` 的产物，任何用户写入都会被下一次重建清掉。
- 标签、笔记、评分、隐藏、手工条目等放独立 `data/user.db`（未来），键为 `(table_name, row_key)`，`row_key` 是主键列的 JSON；不改 `src/db/projections/`。
- Web 服务未来对 `data/user.db` 读写，对 `data/eto.db` 保持只读；需要跨库查询时用 `ATTACH DATABASE` 只读挂载，或应用层拼接。
- 写入特性上线前必须加共享 token 或最小鉴权；v1 不实现。

### 部署

- 开发：
  - 后端：`cd web/backend && uvicorn app.main:app --reload --port 8787`
  - 前端：`cd web/frontend && npm run dev`（Vite proxy `/api` → 8787）
- 生产：
  - `cd web/frontend && npm ci && npm run build`
  - `cd web/backend && uvicorn app.main:app --host 0.0.0.0 --port 8787`
  - 浏览器访问 `http://<LAN-IP>:8787/`
- 本项目按局域网场景使用，启动命令显式绑定 `0.0.0.0`；只在本机使用时去掉 `--host 0.0.0.0`。README 必须保留无鉴权风险说明。

## 关键决策

- **DEC-001**：Python + FastAPI，不用 Go/Rust — 当前库 297MB、投影表几千行，实测列表查询 0.02ms；单用户 LAN 的瓶颈不是语言。GIL 对单用户无影响，SQLite 写入本来就串行；换语言只会增加第二套工具链和 schema 双写。
- **DEC-002**：通用 schema 驱动 API，不做 10 套平台接口 — 26 张表、10 个平台，新增表和平台自动覆盖；平台差异放在前端展示配置。
- **DEC-003**：v1 只读；未来扩展数据放独立 `data/user.db` — 投影表会被重建，不能承载用户数据。
- **DEC-004**：独立 `web/`，自带依赖，不改主包 — 保持 `pipx install export_to_obsidian` 轻量，不把 FastAPI/Node 塞进 CLI 依赖。
- **DEC-005**：无登录，局域网单用户 — 用户明确接受；v1 只读，写入上线前加 token。
- **DEC-006**：搜索用 `LIKE`，不建 FTS5 — 当前数据量几千到几万行，`LIKE` 足够；FTS5 需要触发器和索引维护，等数据量或体验触发再上。
- **DEC-007**：详情用渲染器注册表，不直接展示 JSON — 用户明确要求进一步渲染；JSON 树只用于嵌套对象和调试开关。
- **DEC-008**：OpenVue 1.1.1 — PrimeVue 5.x 改为 PrimeUI License（非 MIT，需要 license key 和年度续期），与公开 AGPL 仓库分发不兼容；PrimeVue 4.5.5 已进入 security-only。OpenVue 是 4.5.5 的 MIT fork，API 兼容，DataTable 覆盖服务端分页/排序/过滤/冻结列。代价是项目年轻（2026-07 创建，当前 1.1.1），锁精确版本；若维护停滞，回退 PrimeVue 4.5.5 或换 Element Plus。
- **DEC-009**：生产单进程托管 `dist` — 局域网单用户最省部署；开发用 Vite proxy，不需要 CORS 通配。
- **DEC-010**：raw body 按需解压，2MB 截断 — 避免一次返回巨大响应；截断状态在 API 和 UI 明示。

## 备选方案

- **ALT-001**：Go + Vue — 单二进制和 `embed.FS` 很香，但需要第二套工具链/CI，且 schema 知识要在 Go 和 Python 各写一遍；当前性能数据不支持。
- **ALT-002**：Rust + Vue — 更极端的性能选择；编译和迭代成本高，单用户场景没有收益。
- **ALT-003**：Datasette — 零代码、只读、自带 JSON API；但服务端渲染、无法做自定义 Vue 和未来写入，只适合开发期对照。
- **ALT-004**：每平台一套 REST 接口 — 类型更强、详情更定制；但 10 个平台重复代码，新增表要改后端。先通用，遇到通用 API 表达不了的交互再加平台专用端点。
- **ALT-005**：把数据加载进内存 — 297MB 可放下，但会引入陈旧数据和同步复杂度；SQLite page cache 已足够。
- **ALT-006**：`eto serve` 子命令 — 对用户更方便，但把 web 依赖带进主包；独立目录更干净。以后需要再包一层。
- **ALT-007**：Element Plus — MIT、最新、中文资料最多；DataTable 能力弱于 OpenVue，服务端分页/排序/过滤要自己接，故未选。
- **ALT-008**：PrimeVue 5.x — 组件最完整，但 PrimeUI License 需要 license key/年度续期，与公开 AGPL 分发冲突，未选。

## 风险与限制

- **RISK-001**：局域网无鉴权会暴露私人数据；v1 只读也有读取风险。默认 `127.0.0.1`，LAN 必须显式 `--host 0.0.0.0`；写入功能上线前加 token。
- **RISK-002**：只读连接在 WAL 模式下需要访问 `-shm`；不同用户/容器权限可能导致 `SQLITE_READONLY_CANTINIT`。要求与 `eto` 同用户运行；必要时退化为读写连接 + `PRAGMA query_only=ON`。
- **RISK-003**：`LIKE` 在 `zhihu_content`（42MB）、`v2ex_reply`（50MB）等大表上会全表扫描；当前数据量可接受，10 万行以上再评估 FTS5。
- **RISK-004**：抓取来的 HTML 可能含脚本；必须 DOMPurify，禁止直接 `v-html` 原始内容。
- **RISK-005**：raw body 可能很大或不是 JSON；详情接口 2MB 截断，UI 明示。
- **RISK-006**：schema 漂移（新列、改主键）会让前端配置失效；后端内省自动带出新列，前端有 fallback；主键变更需要人工更新配置。
- **RISK-007**：平台时间格式不统一（epoch 秒/毫秒、ISO、Twitter 英文格式）；前端时间配置需要按表维护，未配置时显示原值。
- **RISK-008**：OpenVue 是年轻 fork（2026-07 创建，当前 1.1.1，GitHub 442 stars / 566 open issues），长期维护和社区支持未验证；代码基线是成熟的 PrimeVue 4.5.5，锁精确版本，最坏情况回退 PrimeVue 4.5.5 或 Element Plus。
- **RISK-009**：前端构建引入 Node 工具链；现有 CI 只有 Ruff/pytest，不覆盖前端。v1 用本地 `typecheck` + `build` + 手工冒烟，CI 集成另立任务。
- **RISK-010**：offset 分页在深页会变慢；当前数据量小，后续可改 cursor。
- **RISK-011**：Bilibili/网易云播放器与外链封面依赖第三方页面可用性和防盗链策略；加载失败时保留标题、封面回退或原站链接，不影响文字数据。

## 验证方式

- **TEST-001**：后端 pytest 覆盖 schema、查询构建、API、raw 解压/截断；未知表/列/操作符和 SQL 注入字符串必须 400 或参数化。
- **TEST-002**：前端 `vue-tsc --noEmit`、`vitest run`、`vite build` 通过。
- **TEST-003**：手工冒烟覆盖 10 个平台：OpenVue DataTable lazy 分页/排序、搜索、过滤、详情、图片/HTML/JSON/时间渲染。
- **TEST-004**：raw 冒烟：run 列表、run 详情、response 列表、JSON/文本详情、截断提示、复制/下载。
- **TEST-005**：并发：`eto --db-only zhihu` 运行时浏览 zhihu 数据不报错。
- **TEST-006**：性能：当前 297MB 库上列表查询 p95 < 100ms；2MB raw 详情 < 500ms。
- **TEST-007**：展示层冒烟：首页看板与“数据说明”、字段中文标签、全高列表、空过滤条件不触发 0 行、详情正文/视频/音乐/关联预览、raw 页面标签与滚动。
