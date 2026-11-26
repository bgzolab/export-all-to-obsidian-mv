<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import Button from 'openvue/button'
import Dialog from 'openvue/dialog'
import Tag from 'openvue/tag'

import { ApiError, api } from '@/api/client'
import type { HealthResponse, RunSummary, TableMeta } from '@/api/types'
import { useSchema } from '@/composables/useSchema'
import {
  platformConfigFor,
  platformKeys,
  platformLabel,
} from '@/config/platforms'
import { platformIcon, platformIconStyle } from '@/config/icons'
import { tableLabel } from '@/config/tables'
import { operationLabel, statusLabel, statusSeverity } from '@/config/columns'
import {
  formatCompact,
  formatNumber,
  formatRelative,
} from '@/utils/format'
import { formatTime } from '@/utils/time'

interface Metric {
  label: string
  table: string
  unit: string
  count: number
}

interface PlatformCard {
  key: string
  label: string
  mark: string
  icon: string | undefined
  color: string
  description: string
  primaryTable: string
  primary: Metric
  extra: Metric[]
  lastRun: RunSummary | undefined
}

const { schema, error } = useSchema()
const runs = ref<RunSummary[]>([])
const health = ref<HealthResponse | null>(null)
const runsError = ref('')
const infoVisible = ref(false)

onMounted(async () => {
  try {
    const response = await api.runs({ limit: 200 })
    runs.value = response.runs
  } catch (caught) {
    runsError.value = caught instanceof ApiError ? caught.message : String(caught)
  }
  try {
    health.value = await api.health()
  } catch {
    // The dashboard still works without the storage details in the info dialog.
  }
})

const tableCounts = computed(
  () => new Map((schema.value?.tables ?? []).map((table) => [table.name, table.row_count])),
)

function tableCount(table: string): number {
  return tableCounts.value.get(table) ?? 0
}

const platformCards = computed<PlatformCard[]>(() => {
  const current = schema.value
  if (!current) return []
  return platformKeys(Object.keys(current.platforms))
    .map((key) => {
      const tables = current.tables.filter((table) => table.platform === key)
      const config = platformConfigFor(key)
      const primaryTable = config?.primaryTable ?? tables[0]?.name
      if (!primaryTable) return null

      const configured = (config?.metrics ?? []).map((metric) => ({
        ...metric,
        count: tableCount(metric.table),
      }))
      const metrics = configured.length
        ? configured
        : [{ label: '记录', table: primaryTable, unit: '条', count: tableCount(primaryTable) }]
      const primary = metrics[0]
      if (!primary) return null

      return {
        key,
        label: platformLabel(key),
        mark: config?.mark ?? platformLabel(key).slice(0, 1),
        icon: platformIcon(key),
        color: config?.color ?? 'var(--text-tertiary)',
        description: config?.description ?? '数据库中的记录。',
        primaryTable,
        primary,
        extra: metrics.slice(1, 3),
        lastRun: runs.value.find((run) => run.platform === key),
      }
    })
    .filter((card): card is PlatformCard => Boolean(card))
})

const totalItems = computed(() =>
  platformCards.value.reduce((sum, card) => sum + card.primary.count, 0),
)

const distribution = computed(() =>
  [...platformCards.value]
    .filter((card) => card.primary.count > 0)
    .sort((a, b) => b.primary.count - a.primary.count),
)

const distributionMax = computed(() =>
  Math.max(1, ...distribution.value.map((card) => card.primary.count)),
)

const today = Date.now()

const latestRun = computed(() =>
  [...runs.value].sort(
    (a, b) => Date.parse(b.started_at) - Date.parse(a.started_at),
  )[0],
)

const healthRate = computed(() => {
  const finished = runs.value.filter((run) => run.status !== 'running')
  if (!finished.length) return null
  const ok = finished.filter((run) => run.status === 'success').length
  return Math.round((ok / finished.length) * 100)
})

const recentRuns = computed(() => runs.value.slice(0, 7))

const catalog = computed(() => {
  const groups = new Map<string, TableMeta[]>()
  for (const table of schema.value?.tables ?? []) {
    const list = groups.get(table.platform) ?? []
    list.push(table)
    groups.set(table.platform, list)
  }
  return [...groups.entries()].sort(([a], [b]) => {
    if (a === 'raw') return 1
    if (b === 'raw') return -1
    return a.localeCompare(b)
  })
})
</script>

<template>
  <p v-if="error" class="error">无法读取数据目录：{{ error }}</p>
  <p v-else-if="!schema" class="muted">正在读取数据目录…</p>

  <div v-else class="dashboard">
    <header class="hero page-header panel">
      <div>
        <p class="eyebrow">ETO · 本地收藏库</p>
        <h1>我的数字收藏</h1>
        <p class="hero-lede">
          从 {{ platformCards.length }} 个平台收拢到一起的 {{ formatNumber(totalItems) }} 条主内容。
          这是 eto 导出到本地 SQLite 的只读副本。
        </p>
      </div>
      <div class="hero-actions">
        <Button
          label="数据说明"
          severity="secondary"
          outlined
          size="small"
          @click="infoVisible = true"
        />
        <RouterLink to="/timeline" class="ghost-link">时间线</RouterLink>
        <RouterLink to="/raw" class="ghost-link">同步记录</RouterLink>
      </div>
    </header>

    <section class="stat-grid" aria-label="总览">
      <article class="stat-card panel">
        <span class="stat-label">总收藏</span>
        <strong class="stat-value">{{ formatNumber(totalItems) }}</strong>
        <span class="stat-hint">按各平台主内容表统计</span>
      </article>
      <article class="stat-card panel">
        <span class="stat-label">覆盖平台</span>
        <strong class="stat-value">{{ platformCards.length }}</strong>
        <span class="stat-hint">包含 {{ formatNumber(distribution.length) }} 个有数据的平台</span>
      </article>
      <article class="stat-card panel">
        <span class="stat-label">最近同步</span>
        <strong class="stat-value small">
          {{ latestRun ? formatRelative(latestRun.started_at, today) : '从未同步' }}
        </strong>
        <span class="stat-hint">
          {{ latestRun ? formatTime(latestRun.started_at, 'iso') : '运行 eto 后这里会出现记录' }}
        </span>
      </article>
      <article class="stat-card panel">
        <span class="stat-label">同步健康度</span>
        <strong class="stat-value">{{ healthRate === null ? '—' : `${healthRate}%` }}</strong>
        <div v-if="healthRate !== null" class="stat-meter">
          <span :style="{ width: `${healthRate}%` }" />
        </div>
        <span class="stat-hint">最近 {{ runs.length }} 次同步的成功率</span>
      </article>
    </section>

    <p v-if="runsError" class="error small-error">同步记录读取失败：{{ runsError }}</p>

    <div class="dashboard-grid">
      <section class="panel distribution-panel">
        <header class="panel-head">
          <div>
            <h2>平台分布</h2>
            <p>按主内容数量排序</p>
          </div>
          <span class="panel-total">{{ formatNumber(totalItems) }} 条</span>
        </header>
        <div class="bars">
          <div v-for="card in distribution" :key="card.key" class="bar-row">
            <span class="bar-name">
              <span
                v-if="card.icon"
                class="bar-mark"
                :style="{ background: card.color }"
              >
                <span
                  class="mask-icon"
                  aria-hidden="true"
                  :style="platformIconStyle(card.key)"
                />
              </span>
              <span v-else class="dot" :style="{ background: card.color }" />
              {{ card.label }}
            </span>
            <div class="bar-track">
              <div
                class="bar-fill"
                :style="{
                  width: `${Math.max(3, (card.primary.count / distributionMax) * 100)}%`,
                  background: card.color,
                }"
              />
            </div>
            <span class="bar-value">{{ formatNumber(card.primary.count) }}</span>
          </div>
        </div>
        <p v-if="!distribution.length" class="muted empty-note">还没有可统计的内容。</p>
      </section>

      <section class="panel activity-panel">
        <header class="panel-head">
          <div>
            <h2>最近同步</h2>
            <p>最新 {{ recentRuns.length }} 次执行</p>
          </div>
          <RouterLink to="/raw" class="panel-link">全部记录 →</RouterLink>
        </header>
        <div class="run-list">
          <RouterLink
            v-for="run in recentRuns"
            :key="run.id"
            :to="`/raw/runs/${run.id}`"
            class="run-row"
          >
            <span class="run-main">
              <strong>{{ platformLabel(run.platform) }}</strong>
              <span>{{ operationLabel(run.operation) }} · {{ formatRelative(run.started_at, today) }}</span>
            </span>
            <Tag :value="statusLabel(run.status)" :severity="statusSeverity(run.status)" />
          </RouterLink>
          <p v-if="!recentRuns.length" class="muted empty-note">还没有同步记录。</p>
        </div>
      </section>
    </div>

    <section class="platform-section">
      <header class="section-head">
        <div>
          <h2>平台收藏</h2>
          <p>点击卡片进入平台视图；次要表和字段名收在“数据说明”里。</p>
        </div>
      </header>
      <div class="platform-grid">
        <RouterLink
          v-for="card in platformCards"
          :key="card.key"
          :to="`/t/${card.primaryTable}`"
          class="platform-card panel"
        >
          <div class="platform-head">
            <span class="platform-mark" :style="{ background: card.color }">
              <span
                v-if="card.icon"
                class="mask-icon"
                aria-hidden="true"
                :style="platformIconStyle(card.key)"
              />
              <template v-else>{{ card.mark }}</template>
            </span>
            <div class="platform-copy">
              <h3>{{ card.label }}</h3>
              <p>{{ card.description }}</p>
            </div>
          </div>
          <div class="platform-count">
            <strong>{{ formatNumber(card.primary.count) }}</strong>
            <span>{{ card.primary.unit }} {{ card.primary.label }}</span>
          </div>
          <div v-if="card.extra.length" class="platform-extra">
            <span v-for="metric in card.extra" :key="metric.table">
              {{ metric.label }}
              <b>{{ formatCompact(metric.count) }}</b>
            </span>
          </div>
          <div class="platform-foot">
            <span>{{ card.lastRun ? `最近同步 ${formatRelative(card.lastRun.started_at, today)}` : '尚未同步' }}</span>
            <span v-if="card.lastRun" class="status-dot" :class="card.lastRun.status" />
          </div>
        </RouterLink>
      </div>
    </section>

    <Dialog
      v-model:visible="infoVisible"
      header="数据说明"
      modal
      dismissable-mask
      :style="{ width: 'min(760px, 94vw)' }"
    >
      <div class="info-body">
        <p>
          这里是 <strong>eto</strong> 的只读浏览界面。卡片上的数字来自各平台的主内容表：
          收藏、Star、喜欢、稍后读等；关联表（书签、回复、收藏关系）折叠进详情，
          表目录里仍可单独排查。
        </p>
        <p>
          详情页会按平台重新排版：文章显示正文，视频显示播放器，音乐显示封面和播放器，
          外链可以跳回原站。Bangumi 和 Bilibili 默认照片墙；博客园与 QiReader 直接显示抓取正文，
          Twitter、V2EX、知乎在详情页展示来源，V2EX 主题内嵌回复。
          raw 层保留每次同步的接口响应，只在排查数据问题时使用。
        </p>
        <dl v-if="health" class="storage-facts">
          <dt>数据库</dt>
          <dd>{{ health.db }}</dd>
          <dt>schema 版本</dt>
          <dd>{{ health.user_version }}</dd>
          <dt>访问模式</dt>
          <dd>{{ health.readonly ? '只读' : '可写' }}</dd>
        </dl>

        <h3>表目录</h3>
        <div class="catalog">
          <section v-for="[platform, tables] in catalog" :key="platform">
            <h4>{{ platform === 'raw' ? '原始数据' : platformLabel(platform) }}</h4>
            <ul>
              <li v-for="table in tables" :key="table.name">
                <RouterLink :to="`/t/${table.name}`" @click="infoVisible = false">
                  {{ tableLabel(table.name) }}
                </RouterLink>
                <span>{{ formatNumber(table.row_count) }}</span>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </Dialog>
  </div>
</template>

<style scoped>
.dashboard {
  max-width: 1280px;
}

.hero {
  position: relative;
  padding: 26px 28px;
  margin-bottom: 18px;
  overflow: hidden;
  background:
    radial-gradient(560px 200px at 0% 0%, rgb(99 102 241 / 12%), transparent 68%),
    var(--surface);
}

.hero::after {
  content: '';
  position: absolute;
  inset: auto -60px -120px auto;
  width: 260px;
  height: 260px;
  border-radius: 50%;
  background: radial-gradient(circle, rgb(14 165 233 / 9%), transparent 65%);
  pointer-events: none;
}

.hero-lede {
  max-width: 680px;
  color: var(--text-tertiary);
  font-size: 14px;
  line-height: 1.75;
}

.hero-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ghost-link {
  color: var(--primary);
  font-size: 13px;
  text-decoration: none;
}

.ghost-link:hover {
  text-decoration: underline;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 16px;
}

.stat-card {
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stat-label {
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
}

.stat-value {
  font-size: 30px;
  line-height: 1.15;
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
}

.stat-value.small {
  font-size: 22px;
  padding: 5px 0;
}

.stat-hint {
  color: var(--muted-light);
  font-size: 12px;
}

.stat-meter {
  height: 5px;
  margin: 2px 0 1px;
  border-radius: 999px;
  background: var(--surface-hover);
  overflow: hidden;
}

.stat-meter span {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--success-bright), var(--success));
}

.small-error {
  font-size: 13px;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(320px, 1fr);
  gap: 16px;
  margin-bottom: 22px;
}

.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px 10px;
}

.panel-head h2 {
  font-size: 15px;
}

.panel-head p,
.section-head p {
  margin: 3px 0 0;
  color: var(--muted-light);
  font-size: 12px;
}

.panel-total {
  color: var(--muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.panel-link {
  color: var(--primary);
  font-size: 12px;
  text-decoration: none;
  white-space: nowrap;
}

.bars {
  padding: 4px 18px 18px;
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.bar-row {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr) 58px;
  align-items: center;
  gap: 10px;
  font-size: 12px;
}

.bar-name {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex: none;
}

.bar-mark {
  width: 18px;
  height: 18px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 5px;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 22%);
  color: #ffffff;
}

.bar-track {
  height: 7px;
  border-radius: 999px;
  background: var(--surface-hover);
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 999px;
  opacity: 0.85;
}

.bar-value {
  text-align: right;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.run-list {
  padding: 0 10px 10px;
}

.run-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 8px;
  border-radius: 8px;
  text-decoration: none;
}

.run-row:hover {
  background: var(--surface-muted);
}

.run-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  font-size: 13px;
}

.run-main span {
  color: var(--muted-light);
  font-size: 12px;
}

.empty-note {
  padding: 8px 18px 18px;
  font-size: 13px;
}

.section-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 10px;
}

.section-head h2 {
  font-size: 16px;
}

.platform-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 14px;
}

.platform-card {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  text-decoration: none;
  transition:
    transform 120ms ease,
    box-shadow 120ms ease;
}

.platform-card:hover {
  transform: translateY(-1px);
  border-color: var(--border-strong);
  box-shadow: var(--shadow);
}

.platform-head {
  display: flex;
  align-items: flex-start;
  gap: 11px;
}

.platform-copy {
  min-width: 0;
}

.platform-copy h3 {
  margin: 1px 0 3px;
  font-size: 14px;
}

.platform-copy p {
  margin: 0;
  color: var(--muted-light);
  font-size: 12px;
  line-height: 1.5;
}

.platform-count {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.platform-count strong {
  font-size: 25px;
  line-height: 1;
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
}

.platform-count span {
  color: var(--muted-light);
  font-size: 12px;
}

.platform-extra {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.platform-extra span {
  padding: 3px 7px;
  border-radius: 6px;
  background: var(--surface-muted);
  color: var(--muted);
  font-size: 11px;
}

.platform-extra b {
  color: var(--text-secondary);
  font-weight: 600;
}

.platform-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: auto;
  padding-top: 4px;
  color: var(--muted-light);
  font-size: 11px;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--muted-light);
}

.status-dot.success {
  background: var(--success);
}

.status-dot.partial {
  background: var(--warning);
}

.status-dot.failed {
  background: var(--danger-strong);
}

.status-dot.running {
  background: var(--info);
}

.info-body {
  max-height: 68vh;
  overflow-y: auto;
  padding-right: 4px;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.7;
}

.info-body p {
  margin: 0 0 10px;
}

.storage-facts {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 4px 14px;
  margin: 14px 0 18px;
  padding: 10px 12px;
  background: var(--surface-muted);
  border-radius: 8px;
  font-size: 12px;
}

.storage-facts dt {
  color: var(--muted);
}

.storage-facts dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.info-body h3 {
  margin: 18px 0 8px;
  font-size: 14px;
}

.catalog {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
}

.catalog h4 {
  margin: 0 0 4px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
}

.catalog ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.catalog li {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 3px 0;
  font-size: 12px;
}

.catalog a {
  color: var(--primary);
  text-decoration: none;
}

.catalog a:hover {
  text-decoration: underline;
}

.catalog li span {
  color: var(--muted-light);
  font-variant-numeric: tabular-nums;
}

@media (max-width: 1050px) {
  .stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 860px) {
  .dashboard-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 520px) {
  .stat-grid {
    grid-template-columns: 1fr;
  }

  .bar-row {
    grid-template-columns: 76px minmax(0, 1fr) 48px;
  }
}
</style>
