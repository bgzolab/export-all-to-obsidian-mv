# Web 数据浏览器

`web/` 提供一个独立的只读数据浏览器，直接读取 `data/eto.db`，覆盖 10 个平台的投影表与 raw 层。后端是 FastAPI，前端是 Vue 3 + Vite + OpenVue 1.1.1，前后端分离；不修改主包、`eto` CLI 或 Markdown 导出流程。

## 能力

- 首页看板：按平台展示主内容数量、平台分布、最近同步与近期成功率；所有表结构收进“数据说明”弹窗，默认不打扰阅读。
- schema 驱动：新增投影表无需改后端代码，表名、列、主键、行数从 SQLite 实时读取。
- 列表：字段名中文化，行 ID 不进入列表（仍用于详情跳转），时间列按平台展示发布时间、收藏/Star/播放时间、同步时间；时间/时长/布尔/类型等值做可读格式化。关联表用一次批量 `IN` 查询补全目标标题、作者与发布时间，不显示裸外键。服务端分页/排序、文本搜索、按列过滤（`eq/ne/gt/gte/lt/lte/like/is_null/not_null`）、列选择；状态同步到 URL。表格占满剩余视口并在内部滚动，分页器始终可见。
- 详情：按平台重组信息，文章显示正文，视频显示播放器与封面，音乐显示封面和播放器；关联表（喜欢、书签、收藏项、歌单曲目）自动加载目标记录预览。技术字段折叠在“全部字段（技术视图）”。
- raw：run 列表与过滤、run 内 response 列表、zlib 解压后的 JSON/文本详情、2MB 截断提示、复制与下载。
- 默认只读，所有查询走参数化 SQL 与 allowlist，不提供任意 SQL 接口。

## 环境要求

- Python 3.12
- Node.js 20+（开发与构建前端）
- 可访问的 `data/eto.db`（与 `eto` 使用同一 OS 用户运行）

## 快速开始（生产模式，单进程）

```shell
cd web/frontend
npm ci
npm run build

cd ../backend
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8787
```

打开 <http://127.0.0.1:8787/> 或同一局域网内的 `http://<LAN-IP>:8787/`。FastAPI 会托管 `web/frontend/dist`，并支持 `/t/zhihu_content` 这类 SPA 深链刷新。

本项目默认按局域网访问启动；只在本机使用时去掉 `--host 0.0.0.0`。如果端口 8787 已被占用，换一个端口即可，例如 `--port 8788`；前端开发代理也支持通过 `VITE_API_TARGET` 指向该端口。

## 开发模式

```shell
# 终端 1：后端
cd web/backend
.venv/bin/uvicorn app.main:app --reload --port 8787

# 终端 2：前端
cd web/frontend
npm run dev
```

Vite 默认把 `/api` 代理到 `http://127.0.0.1:8787`。后端端口不同时：

```shell
VITE_API_TARGET=http://127.0.0.1:8788 npm run dev
```

## 配置

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `ETO_DB` | `<仓库根>/data/eto.db` | SQLite 文件路径；相对路径按仓库根解析 |
| `VITE_API_TARGET` | `http://127.0.0.1:8787` | 仅开发模式，Vite `/api` 代理目标 |

数据库只读打开（`mode=ro` + `PRAGMA query_only=ON`），不会写入投影表或 raw 层。数据库文件不存在时 API 返回 503。

## 局域网访问与安全

推荐局域网启动：

```shell
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8787
```

只在本机使用时去掉 `--host 0.0.0.0`，uvicorn 默认绑定 `127.0.0.1`。

> **风险警告**：v1 没有登录、没有 token，任何能访问该端口的人都能读取数据库中的全部私人数据（包括 raw 响应）。只应在可信局域网内临时使用，不要暴露到公网。未来加入写入功能前必须先实现共享 token 或最小鉴权。

## 测试

```shell
cd web/backend
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/pytest -q

cd ../frontend
npm run typecheck
npm run test
npm run build
```

后端测试使用临时 SQLite 文件，不会触碰真实数据库；前端纯函数测试（主键编解码、时间格式化、渲染器选择）使用 Vitest。

## 为什么使用 OpenVue 1.1.1

OpenVue 是 PrimeVue 4.5.5 的 MIT fork，DataTable 支持服务端分页/排序/过滤，适合本项目。PrimeVue 5.x 改为 PrimeUI License（需要 license key 和年度续期），与公开 AGPL 仓库分发不兼容，因此没有采用。

OpenVue 仍较年轻（2026-07 创建）。`openvue` 与 `@openvue/themes` 在 `package.json` 中锁定精确版本 `1.1.1`，升级前必须跑全量冒烟；如果维护停滞，回退 PrimeVue 4.5.5 或 Element Plus。

## 目录结构

```text
web/
├── backend/     FastAPI 只读 API（app/ + tests/）
└── frontend/    Vue 3 + Vite + OpenVue 前端
```

## 非目标

- 不写数据库、不做标签/笔记/评分/删除；未来扩展数据单独放 `data/user.db`。
- 不做登录、多用户、多账号、移动端适配。
- 不建 FTS5 全文索引；v1 搜索使用 `LIKE`。
- 不做删除检测与数据脱敏。
