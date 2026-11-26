# 后端：只读 FastAPI API

## 安装与运行

```shell
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --port 8787
```

默认读取仓库根目录的 `data/eto.db`，可用 `ETO_DB` 覆盖。只读连接使用 `mode=ro`、`PRAGMA query_only=ON` 和 5 秒 busy timeout，因此 `eto` 同步期间浏览不会被短暂写锁打断。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 数据库路径、`user_version`、只读标记；库缺失 503 |
| GET | `/api/schema` | 表、平台分组、行数、主键、JSON/hidden 列 |
| POST | `/api/tables/{table}/query` | 通用分页/搜索/过滤/排序查询 |
| POST | `/api/tables/{table}/row` | 按主键（支持复合）取单行 |
| GET | `/api/timeline` | 活动动态，支持 `year`/`day`/`limit`/`offset` |
| GET | `/api/timeline/heatmap` | 某年逐日收藏数量，支持 `year` |
| GET | `/api/runs` | raw run 列表，支持 `platform`/`status` |
| GET | `/api/runs/{id}` | run 详情 + response 数量 |
| GET | `/api/responses` | response 列表，不返回 `body` |
| GET | `/api/responses/{id}` | 解压 body，JSON/文本识别，2MB 截断 |

表名、列名、排序方向、操作符全部走 live schema allowlist；值使用绑定参数。`sync_response.body` 只能通过 response 详情读取，不能出现在通用表 API 中。未知表/列/操作符返回 400，行不存在返回 404。

## 配置

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `ETO_DB` | `<仓库根>/data/eto.db` | SQLite 路径；相对路径按仓库根解析 |

生产模式由本服务托管 `web/frontend/dist`，并为 Vue Router 提供 SPA fallback；dist 不存在时只提供 API。CORS 仅允许 `http://localhost:5173` 和 `http://127.0.0.1:5173`，生产同源不需要 CORS。

## 测试

```shell
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/pytest -q
```

测试使用临时 SQLite 数据库，覆盖健康检查、schema、查询构建、分页/过滤/排序、主键详情、raw 解压与静态托管。
