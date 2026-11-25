---
goal: 增加独立的收藏时间线页面、按年热力图和可无限滚动的活动流，并修正 QiReader 收藏日期
created: 2026-11-24
modified: 2026-11-26
status: Completed
design: docs/design/web-data-browser.md
---

# 时间线页面与收藏热力图

## 目标

- 左侧导航增加“总览”和“时间线”两个平级入口。
- `/timeline` 独立页面：可选年份的收藏热力图 + 按天筛选 + 从新到旧无限滚动的活动动态。
- 时间线只使用真实保存/收藏时间；点击活动直接进入现有详情页。
- 修正 QiReader 把“正文抓取时间”误当收藏时间的问题。

## 约束与前提

- **CON-001**：保持 `web/` 只读，不修改 `src/`、`pyproject.toml` 或 `eto` CLI。
- **CON-002**：不新增跨平台规范化表；时间线由 web 后端的静态 SQL union 提供。
- **CON-003**：不把同步时间伪装成收藏时间。Twitter、V2EX、微博、网易云暂不进入时间线。

## 实施步骤

| Task     | Status    | Description | Verification Steps | Date |
| -------- | --------- | ----------- | ------------------ | ---- |
| TASK-001 | Completed | 新增 `web/backend/app/timeline.py`：5 个平台的保存时间 union、表缺失自动跳过、limit/offset/day 校验；`main.py` 增加 `/api/timeline` 和 `/api/timeline/heatmap`。 | pytest 时间线契约；真实库 curl 返回 2,414 条 | 2026-11-24 |
| TASK-002 | Completed | 新增 `ActivityTimeline.vue`：热力图分档/月份标签/日期筛选、活动流按日分组、IntersectionObserver 每页 30 条加载、封面失败回退。 | Playwright 首屏 30 条、滚动到 180 条、日期筛选/清除 | 2026-11-24 |
| TASK-003 | Completed | 新增 `api.timeline` / `api.timelineHeatmap` 与类型；`utils/timeline.ts` 提供四分位阈值、档位和月份分组。 | Vitest 热力图工具；typecheck/build | 2026-11-24 |
| TASK-004 | Completed | 侧栏增加“总览”“时间线”入口和 active 状态；移动端保持换行紧凑布局。 | Playwright 两个入口 active；390px 无横向溢出 | 2026-11-25 |
| TASK-005 | Completed | 时间线从首页底部移到独立 `/timeline` 页面，首页只保留快捷链接；新增 `TimelineView` 和路由。 | 首页无时间线、侧栏可进入、URL 直接打开 | 2026-11-25 |
| TASK-006 | Completed | 热力图支持自然年选择和 `?year=`：后端返回 `year` / `years`，按周日对齐、周六收尾补零；前端用 `Select` 切换，活动流也按同一 `year` 过滤并保留日期筛选。 | Playwright 年份下拉覆盖有数据的年份、切到 2024 后热力图和活动流都是 2024、日期筛选保留年份 | 2026-11-25 |
| TASK-007 | Completed | QiReader 时间从 `crawled_at` 改为 API `timestamp`（纳秒 `/1e9`）；Bangumi 标为“收藏更新”，QiReader 标为“稍后读”。 | 周末收藏分布与真实保存日期一致；API/界面标签正确 | 2026-11-25 |
| TASK-008 | Completed | 更新设计文档、`web/README.md` 和前端 README，记录独立页面、年份筛选、QiReader 时间字段和批量操作风险。 | `git diff --check`；文档路径存在 | 2026-11-25 |
| TASK-009 | Completed | 排查知乎：collection item `created` 与 `content.created_time` 2,659/2,659 完全一致，确认是内容发布时间而不是收藏时间；将知乎从时间线来源移除，平台页保留。 | API 抽样核对；时间线不再出现 2011 年知乎记录；2026 年 669 条 | 2026-11-26 |

## 涉及文件

- **FILE-001**：`web/backend/app/timeline.py`、`web/backend/app/main.py`。
- **FILE-002**：`web/backend/tests/test_timeline.py`。
- **FILE-003**：`web/frontend/src/components/ActivityTimeline.vue`、`components/PlatformNav.vue`、`views/HomeView.vue`、`views/TimelineView.vue`、`router.ts`。
- **FILE-004**：`web/frontend/src/api/client.ts`、`api/types.ts`、`utils/timeline.ts`。

## 测试与验证

- **TEST-001**：后端 `pytest tests/test_timeline.py` 7 个用例通过；Web 后端共 72 个 pytest，Ruff 通过。
- **TEST-002**：前端 `npm run typecheck && npm run test && npm run build` 通过（75 个 Vitest）。
- **TEST-003**：Playwright 验证 `/timeline` 首屏、年份下拉覆盖有数据的年份、切到 2024 后热力图和活动流都变为 2024（67 条）、日期筛选 `?year=2024&day=...`、清除保留年份、活动进入详情、移动端无横向溢出。
- **TEST-004**：真实库核对：QiReader `timestamp` 解出 2026-10-30 等保存日期；2026 年热力图 669 条；真实批量收藏（2025-12-28 B 站 279 条）保留为尖峰。

## 风险与遗留

- **RISK-001**：时间线只覆盖 5 个有真实保存时间的平台；知乎因 API 只提供内容发布时间，已从时间线移除。
- **RISK-002**：活动流 offset 分页在同步写入时可能重复/漏条；以后可换复合游标。
- **RISK-003**：从详情返回时间线会重新加载第一页并回到顶部；`?year=` / `?day=` 保留，深滚动位置不保留。
- **RISK-004**：Bangumi 只有 `updated_at`，表示收藏记录更新时间而不是首次收藏时间，已在标签显示“收藏更新”。
