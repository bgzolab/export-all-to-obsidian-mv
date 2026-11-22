---
goal: 让 Web 浏览器跟随系统深色模式，修复白色页面与黑色表格的割裂
created: 2026-11-22
modified: 2026-11-22
status: Completed
design: docs/design/web-data-browser.md
---

# 深色模式

## 目标

系统处于深色模式时，页面、面板、表格、卡片、详情和 raw 页面一起切换为深色；浅色模式保持原样。

## 约束与前提

- **CON-001**：沿用 OpenVue Aura 默认的 `prefers-color-scheme` 深色选择器，不引入主题库或手动切换。
- **CON-002**：自定义颜色收敛到 `src/styles/main.css` 的语义变量；组件只引用变量。
- **CON-003**：抓取正文的内联颜色不强制覆盖，避免破坏原文排版。

## 实施步骤

| Task     | Status    | Description | Verification Steps | Date |
| -------- | --------- | ----------- | ------------------ | ---- |
| TASK-001 | Completed | 在 `styles/main.css` 定义浅色/深色语义变量（背景、面板、边框、文字、主色、状态色、阴影），设置 `color-scheme` 和 `body` 颜色。 | 检查 CSS 变量成对定义；`npm run build` | 2026-11-22 |
| TASK-002 | Completed | 把 `views/` 和 `components/` 中硬编码的颜色替换为语义变量；修正 FilterBar 原生输入框的文字颜色和 FieldRenderer 正文颜色。 | `npm run typecheck`；`npm run test`；深色/浅色 Playwright 截图 | 2026-11-22 |
| TASK-003 | Completed | 在 `index.html` 增加 `color-scheme` meta，减少首屏白闪。 | 构建后检查 HTML；深色首屏截图 | 2026-11-22 |

## 涉及文件

- **FILE-001**：`web/frontend/src/styles/main.css` — 语义色变量和深色媒体查询。
- **FILE-002**：`web/frontend/src/views/*.vue` — 首页、列表、详情、raw 页面颜色。
- **FILE-003**：`web/frontend/src/components/*.vue` — 导航、筛选、照片墙、预览、字段渲染颜色。
- **FILE-004**：`web/frontend/index.html` — `color-scheme` meta。

## 测试与验证

- **TEST-001**：`npm run typecheck && npm run test && npm run build` 通过。
- **TEST-002**：Playwright `colorScheme: dark` 检查首页、表格、照片墙、详情、raw 页面，无黑字黑底或白底黑字割裂。
- **TEST-003**：Playwright `colorScheme: light` 检查同样页面，确认浅色模式没有回归。

## 风险与遗留

- **RISK-001**：抓取正文若有内联深色/浅色样式，仍由原内容决定；只保证外框和普通文本可读。
- **RISK-002**：未提供手动主题切换；系统切换主题时页面会即时跟随。
