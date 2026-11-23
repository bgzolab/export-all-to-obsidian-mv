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
├── components/     PlatformNav、CellValue、PreviewCard、FilterBar、FieldRenderer、JsonTree
├── composables/    useSchema（页面级 schema 缓存）
├── config/         平台看板、表/字段标签、详情布局、渲染与时间单位覆盖
├── utils/          主键编解码、时间/数值格式化、HTML/Markdown 清洗、渲染器选择
└── views/          首页看板、列表、详情、raw run/response 页面
```

列表页使用 OpenVue DataTable 的 lazy 模式，分页/排序/搜索/过滤全部交给后端；查询条件同步到 URL，刷新与浏览器前进/后退可恢复，`utils/tableState.ts` 另在 `sessionStorage` 按表记住查询和滚动位置，供侧栏切换和详情返回使用。字段名和取值通过 `config/columns.ts` 中文化，行 ID 不进入列表但主键仍用于详情跳转；关联表通过 `config/tables.ts` 的 `relation` 配置批量补全目标标题、作者和发布时间。Bangumi 和 Bilibili 使用 `layout: 'gallery'` 与 `gallery` 配置渲染照片墙，`?view=table` 可切回表格；Bangumi 的 `facets` 驱动收藏状态/条目类型筛选，Bilibili 的 `folders` 配置批量补全收藏夹。详情布局在 `config/details.ts`，由 `DetailView` 按平台渲染正文、封面、播放器、互动数、`lookup` 正文、`sources` 来源、`folders` 收藏夹和 `children` 子记录；Twitter 详情通过 `utils/twitter.ts` 从 raw response 提取图片和视频。HTML/Markdown 一律经 DOMPurify 清洗。自定义 UI 的颜色统一走 `styles/main.css` 的语义变量，跟随 `prefers-color-scheme` 切换深色/浅色模式。

## 依赖与版本策略

- `openvue` / `@openvue/themes` 精确锁定 `1.1.1`，不使用 `^`。OpenVue 是 PrimeVue 4.5.5 的 MIT fork，但项目较年轻；升级前必须跑全量冒烟。
- 不使用 Pinia/Axios，查询状态放 URL；不引入 ORM 或额外 UI 框架。
- 若 OpenVue 维护停滞，回退 PrimeVue 4.5.5 或 Element Plus。

## 测试

`npm run test` 覆盖纯函数：主键编解码、时间格式化、渲染器选择。组件与页面交互通过手工冒烟或 Playwright 检查，尚未接入 CI。
