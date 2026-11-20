# 前端：Vue 3 + OpenVue

## 安装与命令

```shell
npm ci
npm run dev        # Vite 开发服务器，默认 5173
npm run typecheck  # vue-tsc --noEmit
npm run test       # Vitest
npm run build      # typecheck + 生产构建到 dist/
```

开发服务器把 `/api` 代理到 `http://127.0.0.1:8787`；后端端口不同可用 `VITE_API_TARGET` 覆盖。生产构建由 FastAPI 托管，不需要单独的静态服务器。

## 结构

```text
src/
├── api/            fetch client 与类型
├── components/     PlatformNav、DataTable 页面组件、FilterBar、FieldRenderer、JsonTree
├── composables/    useSchema（页面级 schema 缓存）
├── config/         平台/表展示配置、渲染与时间单位覆盖
├── utils/          主键编解码、时间格式化、HTML/Markdown 清洗、渲染器选择
└── views/          首页、列表、详情、raw run/response 页面
```

列表页使用 OpenVue DataTable 的 lazy 模式，分页/排序/搜索/过滤全部交给后端；查询条件同步到 URL，刷新与浏览器前进/后退可恢复。详情字段由 `FieldRenderer` 按列类型选择渲染器，HTML/Markdown 一律经 DOMPurify 清洗。

## 依赖与版本策略

- `openvue` / `@openvue/themes` 精确锁定 `1.1.1`，不使用 `^`。OpenVue 是 PrimeVue 4.5.5 的 MIT fork，但项目较年轻；升级前必须跑全量冒烟。
- 不使用 Pinia/Axios，查询状态放 URL；不引入 ORM 或额外 UI 框架。
- 若 OpenVue 维护停滞，回退 PrimeVue 4.5.5 或 Element Plus。

## 测试

`npm run test` 覆盖纯函数：主键编解码、时间格式化、渲染器选择。组件与页面交互通过手工冒烟或 Playwright 检查，尚未接入 CI。
