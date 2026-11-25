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
        ├── components/{PlatformNav,CellValue,FilterBar,FacetBar,GalleryGrid,FieldRenderer,JsonTree,PreviewCard}.vue
        ├── composables/{useSchema,useDetailExtras}.ts
        ├── config/{tables,details,details-types,columns,platforms}.ts
        ├── utils/{pk,time,html,renderers,format,relation,gallery,extras}.ts
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

#### timeline

- `GET /api/timeline?year=2026&limit=30&offset=0` → 所选年份的有保存时间的平台，按时间从新到旧
- `GET /api/timeline?year=2026&day=2026-11-20` → 只返回该年份该本地日期的记录
- `GET /api/timeline/heatmap?year=2026` → `{"year": 2026, "years": [2026, 2025, ...], "start": "...", "end": "...", "days": [{"date": "2026-11-20", "count": 3}], "total": 1497, "max": 100}`，缺数据的日期补 0；不传 `year` 时默认当前年或最近有数据的年份
- 响应结构：`{"items": [{"platform", "table", "pk", "title", "subtitle", "cover", "occurred_at", "time_label", "day"}], "total", "limit", "offset", "has_more"}`

### 前端

- Vue 3 + Vite + TypeScript + Vue Router + OpenVue 1.1.1（`openvue/datatable`、`openvue/column`、`openvue/tag`、`openvue/image`、`openvue/tree`、`openvue/toolbar`、`openvue/skeleton`）；`dayjs` 时间格式化，`DOMPurify` 清洗 HTML，`marked` 渲染 Markdown；不引入 Pinia/Axios，查询状态放路由 query。
- 依赖锁精确版本：`openvue@1.1.1`、`@openvue/themes@1.1.1`；OpenVue 是 2026-07 的年轻 fork，升级前跑全量冒烟。`main.ts` 用 `definePreset` 把 Aura 的 emerald 主色固定到 indigo，避免按钮/焦点环与自定义链接颜色两套强调色。
- 布局：左侧“总览 + 平台”导航，顶部品牌与只读状态，主区看板/列表/详情；`html,body,#app` 锁定视口高度，`app-main` 独立滚动，列表页的 DataTable 用 `scrollHeight="flex"` 占满剩余高度，分页器固定在底部。
- 列表用 OpenVue `DataTable` 的 lazy 模式：`:lazy="true"`、`:totalRecords`、`@page`、`@sort`；搜索/过滤由自定义 `FilterBar` 生成并传给后端，不用 DataTable 的本地过滤。未填值的过滤条件保留在 UI/URL 中但不发送到 SQLite，避免列表闪成 0 行。
- 路由：
  - `/` 看板：平台主内容数量、平台分布、最近同步、近期成功率；表目录收进“数据说明”弹窗。
  - `/timeline` 时间线：年份选择热力图、按天筛选、无限滚动活动动态；与看板平级。
  - `/t/:table` 列表：平台主视图、分页、排序、搜索、列选择、过滤条；Bangumi / Bilibili 支持照片墙 / 表格切换；状态同步到 URL。次要表只从“数据说明”目录进入。
  - `/t/:table/:pk` 详情：`pk` 为 base64url(JSON)，支持复合主键。
  - `/raw`：run 列表。
  - `/raw/runs/:id`：该 run 的 response 列表。
  - `/raw/responses/:id`：response 详情。
- 字段可读性由 `src/config/columns.ts` 统一处理：列名中文标签、平台特定取值字典（如知乎 `answer` → 回答、Bangumi 收藏类型）、布尔/时长/时间/ID 的格式化。未知列回退到原始列名。
- 投影表列表默认隐藏行 ID、`response_id` 和 `db_created_at`；主键仍随查询请求，用于行点击进入详情。列表时间列按平台覆盖：发布时间（`created_at` / `published_at` / `pubtime` / `publish_time`）、收藏时间（`date_added` / `starred_at` / `fav_time` / Bangumi `updated_at` / 知乎收藏项 `created`）、同步时间（`db_updated_at`）。
- 关联表（`twitter_like`、`twitter_bookmark`、`v2ex_favorite`、`zhihu_collection_item`、`bilibili_fav_item`、`netease_playlist_song`、`netease_play_record`、`cnblog_post`、`qireader_article`）在 `config/tables.ts` 声明 `relation`，每页用一次 `IN` 查询批量取目标记录，列表显示目标标题、作者和发布时间，而不是裸外键。目标行缺失时优先回退到源行内嵌快照（如网易云 `song_json`），再显示“关联记录缺失”。
- 详情布局由 `src/config/details.ts` 按表声明标题、副标题、封面、正文、互动数、元信息、外链、播放器、关联记录和预览目标：
  - 文章/主题/推文：标题、作者、时间、互动数、清洗后的正文。
  - 视频：封面、UP 主、播放/收藏/弹幕数、Bilibili iframe 播放器、简介。
  - 音乐：专辑封面、歌手、专辑、时长、网易云播放器；歌单显示曲目数并链接到曲目表。
  - GitHub：仓库名、描述、Stars/Forks/Issues、标签、README（相对图片按 `raw.githubusercontent.com/<repo>/HEAD/` 解析）。
  - 关联表（`twitter_like`、`v2ex_favorite`、`zhihu_collection_item`、`bilibili_fav_item`、`netease_playlist_song`）：加载目标行并用 `PreviewCard` 展示标题、摘要和互动数，再链接到完整详情。
  - 没有平台配置的表回退到通用字段视图，并默认展开“全部字段（技术视图）”。
  - `lookup` 合并正文：CNBlog 详情按 `link_url` 取 `cnblog_post.body`，QiReader 详情按 `url` 取 `qireader_article.content`，不再重复展示摘要。
  - `sources` 来源：Twitter 显示喜欢/书签，V2EX 显示收藏/感谢，知乎显示“知乎收藏夹”和收藏时间。
  - `children` 子记录：V2EX 主题详情内嵌回复列表，最多 200 条。
  - `folders` 收藏夹：Bilibili 媒体详情显示全部收藏夹及收藏时间。
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

### 平台化视图与照片墙（2026-11）

数据库仍按 raw / 投影表组织，但前端不再把同一平台的每张投影表当成并列模块。每个平台只暴露一个主视图；`bangumi_subject`、`bilibili_fav`、`cnblog_post`、`qireader_article`、`twitter_like` / `twitter_bookmark`、`v2ex_favorite` / `v2ex_thanks` / `v2ex_reply`、`zhihu_collection_item` 等次要表收进“数据说明”的表目录，只在排查时进入。

| 平台 | 主视图 | 列表形态 | 详情合并 |
| --- | --- | --- | --- |
| Bangumi | `bangumi_collection` | 照片墙（默认）/ 表格 | 条目快照 + 收藏状态、评分、收藏时间 |
| 哔哩哔哩 | `bilibili_media` | 照片墙（默认）/ 表格 | 收藏时间 + 全部收藏夹 |
| 博客园 | `cnblog_bookmark` | 表格 | 按 `link_url` 取 `cnblog_post.body` |
| QiReader | `qireader_entry` | 表格 | 按 `url` 取 `qireader_article.content` |
| Twitter / X | `twitter_tweet` | 表格 | 来源：`twitter_like` / `twitter_bookmark` |
| V2EX | `v2ex_topic` | 表格 | 来源：`v2ex_favorite` / `v2ex_thanks`；内嵌 `v2ex_reply` |
| 知乎 | `zhihu_content` | 表格 | 来源：`zhihu_collection_item` |

- 平台导航和首页卡片只指向主视图；`/t/:table` 仍可打开任意表，`/t/:table/:pk` 的详情 URL 不变。
- Bangumi 顶部两组单选 facet：
  - 收藏状态：全部 / 想看 / 在看 / 看过 / 搁置 / 抛弃。
  - 条目类型：全部 / 书籍 / 动画 / 音乐 / 游戏 / 三次元。
  - 当前 facet 的计数按另一组 facet 的当前选择计算；选中项写入现有 `filters` URL 状态，过滤抽屉仍可看到同一条件。
- 照片墙由 `config/tables.ts` 的 `layout: 'gallery'` 和 `gallery` 配置驱动；`?view=table` 切回表格，默认照片墙。卡片显示封面、标题、副标题、状态/类型/评分等 badge、收藏/发布时间；封面失败显示占位块。Bangumi 表格模式增加虚拟“条目”列，Bilibili 表格模式增加虚拟“收藏夹”列，虚拟列不进入列选择器且不可排序。
- Bilibili 收藏夹通过 `bilibili_fav_item`（`media_id` / `fav_id` / `fav_time`）和 `bilibili_fav`（`fav_id` / `title`）两次批量查询补全；照片墙卡片和详情都显示全部收藏夹与收藏时间。
- 详情合并由 `config/details.ts` 的三个新配置驱动：
  - `lookup`：按源行 URL 查目标表一行，取第一个非空正文列；CNBlog / QiReader 不再显示摘要，正文为空或缺失时显示明确提示，并保留原站链接。
  - `sources`：按主键查询来源表，按表分组显示“喜欢 / 书签 / 收藏 / 感谢 / 知乎收藏夹”和最近时间；同一来源多行显示数量。
  - `children`：V2EX 主题详情内嵌回复，按时间升序，最多 200 条，并显示实际总数。
- 搜索使用新增的 `search_columns` 请求字段：Bangumi 显式传 `['subject_json', 'comment']`，从而支持按条目名搜索；不传时保持原来的“非 JSON 文本列”行为，避免默认搜索命中 JSON 键名。
- 深色模式：自定义 UI 的颜色统一走 `styles/main.css` 的语义变量；`@media (prefers-color-scheme: dark)` 与 OpenVue Aura 默认的 `system` 深色选择器对齐，页面背景、面板、表格、输入框和照片墙同时切换。未增加手动主题切换，跟随操作系统。
- 平台切换与列表状态（2026-11 修复）：
  - 切换平台时先清空上一张表的行并重置 `loaded`，避免旧行短暂出现在新表头下；同时移除 DataTable 的白色 loading 遮罩，改为空表“正在加载…”提示，分页/搜索时保留现有行直到新结果返回，避免深色模式下的白光和整表闪烁。
  - `sessionStorage` 按表记住最近一次查询（分页、排序、搜索、过滤、列、照片墙/表格），并按键记住滚动位置；URL 仍是唯一可分享的状态源。侧栏平台切换、详情页“返回”、浏览器前进/后退都会恢复页码和滚动位置，仅在 URL 没有 query 且该表有记忆时用 `router.replace` 回填。
  - QiReader 列表隐藏恒为“是”的 `is_saved`；`published_at` 实际是 epoch 毫秒，时间单位从 `iso` 修正为 `epoch_ms`。
  - Twitter 投影表只保存正文和互动数，媒体在 raw response 里；详情页用 `twitter_tweet.response_id` 读取对应 raw body，递归找到该推文并提取 `legacy.extended_entities.media` / `legacy.entities.media` 的图片和最高码率 mp4。不修改 `src/` 的投影结构。

### 视觉系统与详情阅读（2026-11）

- 设计基线：Aura 主题主色用 `definePreset` 覆盖为 indigo，OpenVue 按钮、焦点环、分页器与自定义链接共用一套强调色；页面背景加轻微径向渐变，面板、表格和侧栏统一使用语义色变量与 `--radius-lg`。侧栏每个平台显示品牌色方块标记，当前项有左侧强调条；列表页标题也显示平台标记。
- 列表工具栏收进独立面板，搜索、筛选、列选择和照片墙/表格切换保持原有行为；DataTable 表头、行距、hover 和分页器做轻度覆盖，不改变 lazy 分页/排序协议。
- 详情页重排为“编辑型”阅读布局：
  - 顶部 `Toolbar` 吸顶，包含返回列表、平台/表名、当前记录位置（如 `31 / 839`）和上一条/下一条。滚动长文时始终可切换。
  - 上方 hero 区显示平台色顶部条、封面、标题、副标题、互动数卡片、原站链接和最近同步时间。
  - 主体在宽屏上分成两栏：左侧 680px 阅读列，右侧 288px sticky 侧栏；侧栏放记录信息、来源、相关链接和 raw response 入口。宽度低于 1080px 时合并为单栏，侧栏内容变成两列/单列块。
  - 正文排版：16px / 1.85 行高，段落与 `<section>` 段落间距 1.15em；标题、引用、代码块、表格、图片、链接都有统一样式。抓取 HTML 中大量 `<section>` 段落不再挤成一块。
  - V2EX 回复改为头像首字母 + 上下文的列表；Twitter 图片改为两列网格；技术字段仍收在“全部字段（技术视图）”。
- 上一条/下一条不新增后端端点：列表加载成功后把当前页的 `QueryRequest` 和主键列表写入 `sessionStorage`；详情页命中当前页时直接切换。走到页首/页尾时用同一个 request（保留排序、过滤、搜索）请求相邻页，再跳到第一/最后一条。直接打开详情 URL 时没有列表上下文，隐藏切换按钮，只保留返回列表。
- CNBlog `body` 在投影里是 JSON 编码字符串（外层引号、`\\n` 和转义引号）；渲染前在 `utils/format.ts` 的 `decodeStoredText` 解一层 JSON，再交给 DOMPurify，避免详情出现 `\"`、`\\n` 字面量。只影响展示，不改 `src/` 投影。
- 移动端侧栏改成可换行的紧凑平台列表，避免横向滚动把 GitHub 之后的平台藏起来。

### 时间线页面与收藏热力图（2026-11）

- 侧栏在平台列表上方提供“总览”和“时间线”两个平级入口：`/` 是原有看板，`/timeline` 是独立时间线页；active 状态分别判断 `route.name`。
- `/timeline` 包含热力图和活动动态：
  - 热力图按自然年渲染，起点是 1 月 1 日所在周的周日，终点是 12 月 31 日所在周的周六，缺数据的日期补 0；顶部 `Select` 可在数据库有数据的年份之间切换，写入 `?year=YYYY`。
  - 颜色按所选年份非零天数的四分位分 4 档，避免单日大批量数据把其他日期压平。
  - 点击某一天把 `?day=YYYY-MM-DD` 写入 URL 并重置活动流；再次点击该天或点“清除”回到全部。切年时清除日期；URL 可分享，浏览器后退可恢复筛选。
  - 活动流按所选年份过滤，每页 30 条，`IntersectionObserver` 在距离底部 400px 时加载下一页；按 `day` 插入日期分隔，显示平台标记、标题、副标题、封面缩略图、时间和动作标签。
  - 每条活动点击后复用现有 `/t/:table/:pk` 详情页，不需要新的预览路由。
  - 热力图和列表都使用本机时区日期；时间统一在 SQLite 内转成 epoch 秒，再按 `localtime` 分组。
- 时间来源只纳入数据库里存有真实保存/收藏时间的 6 个平台：

| 平台 | 来源 | 时间字段 | 显示标签 |
| --- | --- | --- | --- |
| Bangumi | `bangumi_collection` | `updated_at`（收藏记录更新时间） | 收藏更新 |
| 哔哩哔哩 | `bilibili_media` + `bilibili_fav_item` | 同一视频取 `MAX(fav_time)` | 收藏 |
| 博客园 | `cnblog_bookmark` | `date_added`（无时区，按本机时间解释） | 收藏 |
| GitHub | `github_star` | `starred_at` | Star |
| QiReader | `qireader_entry` | `timestamp`（纳秒字符串，QiReader 保存时间） | 稍后读 |
| 知乎 | `zhihu_content` + `zhihu_collection_item` | 同一内容取 `MAX(created)` | 收藏 |

- QiReader 有一个容易误用的字段：`crawled_at` 是 eto 抓取正文的时间，不是用户保存到稍后读的时间。2026-11-25 修正为使用 QiReader API 的 `timestamp`（`/1e9` 得到 epoch 秒），周末才不再被批量正文抓取填满。
- Twitter、V2EX、微博、网易云目前只有同步时间（`db_created_at` / `db_updated_at`），加入时间线会让一次同步变成一个虚假的收藏尖峰，因此暂不进入热力图和活动流；它们仍可从侧栏和平台卡片浏览。
- 后端 `timeline.py` 用静态 SQL 把 6 个来源 `UNION ALL` 成统一列，表不存在时自动跳过该来源；`day` 只做格式/日期校验后绑定参数，`limit` 最大 100。没有新增规范化表，也没有让前端拼接 SQL。
- CNBlog 的 `date_added` 是无时区文本，SQL 用 `'utc'` 修饰符按服务器本地时间解释，避免上海时区被多加 8 小时。

### CNBlog 正文缺口排查（2026-11）

- `cnblog_post` 当前 153 行，其中 20 行 `body` 为空；另有 5 条收藏在 `cnblog_post` 里找不到对应记录。
- 空正文对应的 raw 响应都是 HTTP 200 + 0 字节，线上复测仍返回空，不是 zlib 解压或 HTML 解析丢了内容。
- 有正文的 post id 从 16,640,095 起，空正文的 post id 最大 15,708,682；缺口集中在旧文章，边界与 CNBlogs 的文章 ID/发布时间相关。
- 结论：CNBlogs `api/blogposts/{id}/body` 对旧文章返回 200 空 body。本分支不修，详情页显示“正文抓取为空”并保留原文链接。
- 后续修复方向：空 body 时回退抓取文章 HTML，或把空 body 视为失败、不写 `cnblog_post` 并在下次同步重试。

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
- **DEC-011**：前端按“平台主实体”组织，后端继续用通用表 API — 10 个平台只有 7 个需要合并展示，且合并主要发生在详情；为每个平台写 join API 会重复 SQL 和测试，前端批量查询已够用。只有 Bangumi 标题搜索需要新增 `search_columns`。
- **DEC-012**：照片墙是 `TableView` 的一种布局，不新建路由 — 复用现有 URL 状态、分页、搜索和过滤；`view` 查询参数保存照片墙/表格选择。
- **DEC-013**：`search_columns` 显式指定搜索列，不让所有 JSON 列默认参与搜索 — `subject_json` 里含 `"name"` 等键名，默认搜索会命中整表；显式配置更可预测。
- **DEC-014**：详情合并用客户端 `lookup` / `sources` / `children` 批量查询，不新增后端 join 端点 — 详情一次只打开一条记录，额外 1-3 个查询；保持通用 API 的简单性和可复用性。
- **DEC-015**：CNBlog 空正文不在本分支修复 — 已确认是上游 `blogposts/{id}/body` 对旧文章返回 HTTP 200 + 空 body；本次只在 UI 显示“正文抓取为空”，修复留给独立分支。
- **DEC-016**：深色模式跟随系统，不新增手动切换 — OpenVue Aura 默认使用 `prefers-color-scheme: dark`，自定义 UI 用同一媒体查询和语义色变量即可对齐；手动切换需要额外的持久化和首屏防闪逻辑，等用户明确需要再做。
- **DEC-017**：表格查询与滚动位置放 `sessionStorage`，不放数据库或后端 — 这是单标签页的浏览状态，刷新/返回时恢复即可；跨标签页共享反而会让两个窗口互相覆盖。URL 继续承载可分享的查询。
- **DEC-018**：Twitter 媒体从 raw response 读取，不改投影表 — 投影表没有媒体列，但 `twitter_tweet.response_id` 指向包含完整推文的 raw 页面；读取一条 raw body 即可恢复图片/视频，避免为前端展示改 `src/` 的 schema 和重建投影。
- **DEC-019**：用 `definePreset` 统一 OpenVue 主色，而不是逐个覆盖组件 CSS — Aura 默认 emerald 与自定义 indigo 链接冲突；在主题层改 primary 让按钮、焦点环、分页器和自定义 UI 一次对齐，后续换主题也只需改一处。
- **DEC-020**：详情页上一条/下一条复用列表页快照和 `QueryRequest`，不新增 neighbor API — 当前页数据已经在浏览器里，越界时一次普通分页查询即可；后端不需要窗口函数、游标或额外的排序语义，过滤/搜索行为与列表完全一致。代价是直接打开详情 URL 时没有上下文。
- **DEC-021**：长文详情用 680px 阅读列 + 侧栏，不再整页铺满 — 纯堆叠在宽屏上每行过长；固定阅读宽度、正文字号/行距和段落间距比堆组件更能改善可读性，同时把元信息移到侧栏，正文不再被技术字段打断。
- **DEC-022**：CNBlog 双编码 body 在前端解一层 JSON — 投影层保持原样，避免为显示问题改 `src/` 并重建 153 条投影；`decodeStoredText` 只在字符串以 `"` 开头且 JSON 解析结果为字符串时生效，普通文本和异常数据保持原值。
- **DEC-023**：总览时间线只纳入有真实收藏/入库时间的平台 — Twitter、V2EX、微博、网易云只有同步时间，混入后一次同步会变成数万条同一日期的“收藏”，热力图失真。宁可少 4 个平台，也不把同步时间伪装成收藏时间；以后 raw 里补上真实时间再扩。
- **DEC-024**：时间线用后端静态 SQL `UNION ALL`，不建规范化表 — 6 个平台的 SELECT 固定、表不存在自动跳过；新增来源只改一个列表，不改主库 schema。当前 5,382 行上列表查询约 25ms，不值得为单用户引入跨平台 item 表。
- **DEC-025**：日期筛选进 URL，滚动分页不进 URL — `?day=` 和 `?year=` 是可分享状态且浏览器后退应恢复；已加载页数和滚动位置是当前标签页的临时状态，写进 URL 会产生大量不可分享的历史记录。期望以后像表格一样用 `sessionStorage` 补。
- **DEC-026**：热力图按非零天数的四分位着色 — 直接用 `count / max` 会让单日尖峰把其余日期压成同一档；分位数能保留日常差异，同时给尖峰最高档。
- **DEC-027**：时间线复用 `/t/:table/:pk` 详情页 — 不新建弹窗预览或第二套详情渲染；点击后仍可看到正文、来源、媒体和上一条/下一条，代价是离开时间线滚动位置。
- **DEC-028**：时间线是独立 `/timeline` 页面，不挂在总览底部 — 热力图 + 无限列表本身有独立筛选状态（年份、日期）和很长的滚动区，继续塞在首页会让首页变成两个产品；侧栏提供平级入口，首页只保留一个快捷链接。
- **DEC-029**：热力图按自然年而不是滚动 53 周 — 用户需要明确选择年份，自然年边界和月份标签比“最近 371 天”更可解释；起始周向前补到周日、结束周向后补到周六，保证 7 行网格。
- **DEC-030**：QiReader 使用 API `timestamp` 而不是 `crawled_at` — `crawled_at` 是 eto 抓正文的时间，按同步批次分布，会把周末/每天填满；`timestamp` 是 QiReader 的纳秒保存时间（`/1e9`），与用户实际加入稍后读的日期一致。Bangumi 只有 `updated_at`，在标签上明确为“收藏更新”，不当作首次收藏。

## 备选方案

- **ALT-001**：Go + Vue — 单二进制和 `embed.FS` 很香，但需要第二套工具链/CI，且 schema 知识要在 Go 和 Python 各写一遍；当前性能数据不支持。
- **ALT-002**：Rust + Vue — 更极端的性能选择；编译和迭代成本高，单用户场景没有收益。
- **ALT-003**：Datasette — 零代码、只读、自带 JSON API；但服务端渲染、无法做自定义 Vue 和未来写入，只适合开发期对照。
- **ALT-004**：每平台一套 REST 接口 — 类型更强、详情更定制；但 10 个平台重复代码，新增表要改后端。先通用，遇到通用 API 表达不了的交互再加平台专用端点。
- **ALT-005**：把数据加载进内存 — 297MB 可放下，但会引入陈旧数据和同步复杂度；SQLite page cache 已足够。
- **ALT-006**：`eto serve` 子命令 — 对用户更方便，但把 web 依赖带进主包；独立目录更干净。以后需要再包一层。
- **ALT-007**：Element Plus — MIT、最新、中文资料最多；DataTable 能力弱于 OpenVue，服务端分页/排序/过滤要自己接，故未选。
- **ALT-008**：PrimeVue 5.x — 组件最完整，但 PrimeUI License 需要 license key/年度续期，与公开 AGPL 分发冲突，未选。
- **ALT-009**：为每个平台新增 SQL join 视图/端点 — 列表筛选和排序更强，但需要 7 套 SQL、主键声明和测试；本次只有 Bangumi 搜索必须后端参与，先用 `search_columns` 解决。
- **ALT-010**：新增 `/p/:platform` 路由 — 语义更清楚，但会让现有 `/t/:table`、详情 URL、书签和导航全部迁移；主表已经能表达平台主视图，保持 URL 稳定。

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
- **RISK-012**：照片墙一次加载 50 张远程封面，慢网下首屏变慢；图片使用 `loading="lazy"`，失败显示占位块，必要时再下调分页大小。
- **RISK-013**：Bangumi facet 每次加载额外发约 11 个 `COUNT(*)` 请求；当前 1,092 行、本地 SQLite 下可接受，数据量上来再合并成后端 group-by 接口。
- **RISK-014**：Bilibili 收藏夹补全每页多 2 个批量查询；当前 611 个媒体、1 个收藏夹，开销可忽略。
- **RISK-015**：V2EX 详情一次取最多 200 条回复，长主题页面较长且响应较大；已限制上限并显示总数。
- **RISK-016**：CNBlog 旧文章正文为空，详情只能显示提示和原文链接；修复需要 exporter 侧 HTML fallback 或把空 body 视为失败重试。
- **RISK-017**：`subject_json` 搜索按 JSON 文本匹配，可能命中字段名；Bangumi 搜索词通常是标题/短评，影响可接受。
- **RISK-018**：抓取正文可能自带内联颜色或白底图片；深色模式下正文外框是深色，但内容内部的作者自定义颜色不受控制。未强制覆盖内联样式，避免破坏原排版。
- **RISK-019**：表格状态只在当前浏览器标签页内记忆；新标签页、清空站点数据或隐私模式会回到默认视图。滚动位置按“表 + 查询”保存，深页改动数据后可能落在一个略短/略长的位置。
- **RISK-020**：Twitter 媒体依赖 raw response 仍保留原页面且 `response_id` 未变；重建投影后 id 会指向新响应，通常仍可用。若 raw 被清理或推文在页内结构变化，详情会静默隐藏媒体，正文不受影响。
- **RISK-021**：直接打开或分享详情 URL 时没有列表页快照，上一条/下一条不显示；从列表进入或刷新过列表后才有。列表数据变化后，快照可能指向已删除的主键，此时只显示“记录不存在”，不会自动修正游标。
- **RISK-022**：详情切换跨页时使用一次额外查询；快速连点由 `navBusy` 串行化，不会并发翻页。若相邻页在两次请求之间被同步改写，位置数字可能与实际顺序略有偏差。
- **RISK-023**：视觉层依赖 `color-mix()`、`backdrop-filter` 和动态视口单位 `dvh`；现代 Chrome/Edge/Firefox/Safari 支持，极旧浏览器会退化为普通透明背景或固定高度。
- **RISK-024**：移动端平台导航换行后约占 158px 高度；10 个平台加 raw 入口在 390px 宽度下为 4 行。平台继续增加时需要在移动端改成抽屉或横向滚动。
- **RISK-025**：时间线只覆盖 6 个平台；Twitter、V2EX、微博、网易云的收藏/喜欢记录暂时看不到。它们的投影层没有真实收藏时间，只有同步时间，补数据需要在 exporter/raw 层增加时间字段。
- **RISK-026**：热力图按所选自然年展示；更早/更晚的记录仍可在活动流（全部时间）和平台列表里看到。日期按后端所在机器的本地时区分组，跨时区访问 LAN 服务时可能与浏览器日期相差一天。
- **RISK-027**：活动流使用 offset 分页；同步任务在两页之间写入新行时，可能出现重复或漏掉一条。当前单用户、数据量 5,382 行，暂不引入游标；以后可改为 `(occurred_at, platform, pk)` 复合游标。
- **RISK-028**：从活动流打开详情再返回时间线时，页面会重新挂载、只加载第一页并回到热力图顶部；已滚动的页数和位置没有保存。`?year=` / `?day=` 会保留，深滚动位置会丢失。
- **RISK-029**：CNBlog `date_added` 无时区，按服务器本地时间解释；如果导出机和 Web 服务不在同一时区，日期可能偏移。
- **RISK-030**：时间线保留真实的批量操作：2025-12-28 有 279 个 B 站收藏集中在 23:19-23:21，2026-04-23 有 97 个 Bangumi 收藏更新集中在 23:06-23:07。这些是收藏/更新记录本身的时间，热力图会显示为尖峰，不是抓取日期错位。

## 验证方式

- **TEST-001**：后端 pytest 覆盖 schema、查询构建、API、raw 解压/截断；未知表/列/操作符和 SQL 注入字符串必须 400 或参数化。
- **TEST-002**：前端 `vue-tsc --noEmit`、`vitest run`、`vite build` 通过。
- **TEST-003**：手工冒烟覆盖 10 个平台：OpenVue DataTable lazy 分页/排序、搜索、过滤、详情、图片/HTML/JSON/时间渲染。
- **TEST-004**：raw 冒烟：run 列表、run 详情、response 列表、JSON/文本详情、截断提示、复制/下载。
- **TEST-005**：并发：`eto --db-only zhihu` 运行时浏览 zhihu 数据不报错。
- **TEST-006**：性能：当前 297MB 库上列表查询 p95 < 100ms；2MB raw 详情 < 500ms。
- **TEST-007**：展示层冒烟：首页看板与“数据说明”、字段中文标签、全高列表、空过滤条件不触发 0 行、详情正文/视频/音乐/关联预览、raw 页面标签与滚动。
- **TEST-008**：后端 `search_columns` 覆盖指定 JSON 列、未知列、空搜索和默认搜索行为。
- **TEST-009**：前端配置测试覆盖主表、照片墙、facet、虚拟列、收藏夹和详情 `lookup` / `sources` / `children`；工具函数测试覆盖图片 URL、来源分组和收藏夹合并。
- **TEST-010**：Playwright 冒烟覆盖 Bangumi / Bilibili 照片墙与表格切换、Bangumi facet、CNBlog / QiReader 正文、Twitter / V2EX / 知乎来源、V2EX 回复。
- **TEST-011**：Playwright 分别在 `colorScheme: dark` 和 `colorScheme: light` 下检查首页、表格、照片墙、详情和 raw 页面，确认页面/表格/文字对比度正常。
- **TEST-012**：Vitest 覆盖表格状态记忆、Twitter 媒体提取、QiReader 时间单位与隐藏列；Playwright 验证 QiReader 列/时间、页码与滚动恢复、切换平台无白色 loading 遮罩、Twitter 推文图片实际加载（`naturalWidth > 0`）。
- **TEST-013**：Vitest 覆盖详情页快照的存取、主键查找和上一条/下一条边界（页内切换、跨页 offset、首页/末页停止），以及 CNBlog JSON 字符串解码。
- **TEST-014**：Playwright 在深色和浅色下检查首页、列表、文章、推文、V2EX 回复、Bilibili 播放器、raw 页面；验证从列表进入详情后 `位置 / 总数` 正确、上一条/下一条跨页、返回列表保留查询、文章段落间距、Twitter 图片、390px 移动端无横向溢出。
- **TEST-015**：后端 pytest 覆盖时间线的排序/分页、关系去重取最新时间、`day` 过滤与非法日期、热力图按自然年周日对齐/周六收尾和补零、年份列表与非法年份、缺少平台表时返回空列表；Ruff 通过。
- **TEST-016**：前端 Vitest 覆盖热力图四分位阈值/档位和月份分组；Playwright 验证侧栏总览/时间线双入口、`/timeline` 首屏、年份下拉 16 个年份、切到 2024 后热力图重渲染、日期筛选/清除保留年份、点击活动进入详情、390px 纵向无溢出且热力图可横向滚动。
