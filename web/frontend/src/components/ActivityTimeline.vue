<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import Select from 'openvue/select'
import Skeleton from 'openvue/skeleton'

import { ApiError, api } from '@/api/client'
import type {
  TimelineHeatmapDay,
  TimelineHeatmapResponse,
  TimelineItem,
} from '@/api/types'
import { platformConfigFor, platformLabel } from '@/config/platforms'
import { formatNumber } from '@/utils/format'
import { encodePk } from '@/utils/pk'
import { heatmapLevel, heatmapMonths, heatmapThresholds } from '@/utils/timeline'
import { formatTime } from '@/utils/time'

const PAGE_SIZE = 30
const route = useRoute()
const router = useRouter()

const heatmap = ref<TimelineHeatmapResponse | null>(null)
const heatmapError = ref('')
const items = ref<TimelineItem[]>([])
const total = ref(0)
const loading = ref(false)
const ended = ref(false)
const loadError = ref('')
const sentinel = ref<HTMLElement | null>(null)

let offset = 0
let timelineSequence = 0
let observer: IntersectionObserver | null = null

const selectedDay = computed(() =>
  typeof route.query.day === 'string' ? route.query.day : '',
)
const yearQuery = computed(() => {
  const raw = route.query.year
  const value = typeof raw === 'string' ? Number(raw) : NaN
  return Number.isInteger(value) ? value : undefined
})
const yearOptions = computed(() =>
  (heatmap.value?.years ?? []).map((year) => ({
    label: `${year} 年`,
    value: year,
  })),
)
const currentYear = computed(() => heatmap.value?.year ?? yearQuery.value)
const thresholds = computed(() => heatmapThresholds(heatmap.value?.days ?? []))
const months = computed(() => {
  const year = heatmap.value?.year
  return heatmapMonths(heatmap.value?.days ?? []).filter(
    (month) => !year || month.key.startsWith(`${year}-`),
  )
})
const selectedCount = computed(
  () => heatmap.value?.days.find((day) => day.date === selectedDay.value)?.count ?? 0,
)

function levelFor(count: number): number {
  return heatmapLevel(count, thresholds.value)
}

function monthWidth(startWeek: number, endWeek: number): string {
  return `${(endWeek - startWeek + 1) * 14 - 3}px`
}

function selectDay(day: TimelineHeatmapDay) {
  if (!day.count) return
  const year = yearQuery.value ?? heatmap.value?.year
  const query: Record<string, string> = {}
  if (year) query.year = String(year)
  if (selectedDay.value !== day.date) query.day = day.date
  void router.push({ name: 'timeline', query })
}

function clearDay() {
  const year = yearQuery.value ?? heatmap.value?.year
  void router.push({
    name: 'timeline',
    query: year ? { year: String(year) } : {},
  })
}

function changeYear(value: unknown) {
  const year = Number(value)
  if (!Number.isInteger(year)) return
  void router.push({ name: 'timeline', query: { year: String(year) } })
}

function detailRoute(item: TimelineItem) {
  return {
    name: 'detail',
    params: { table: item.table, pk: encodePk(item.pk) },
  }
}

function markFor(item: TimelineItem): string {
  return platformConfigFor(item.platform)?.mark ?? platformLabel(item.platform).slice(0, 1)
}

function colorFor(item: TimelineItem): string {
  return platformConfigFor(item.platform)?.color ?? 'var(--text-tertiary)'
}

function clock(item: TimelineItem): string {
  return formatTime(item.occurred_at, 'epoch_s').slice(11, 16)
}

function dayLabel(day: string): string {
  const date = new Date(`${day}T00:00:00`)
  if (Number.isNaN(date.getTime())) return day
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  })
}

function dropCover(item: TimelineItem) {
  item.cover = ''
}

async function loadHeatmap() {
  try {
    heatmap.value = await api.timelineHeatmap(
      yearQuery.value ? { year: yearQuery.value } : {},
    )
  } catch (caught) {
    heatmapError.value = caught instanceof ApiError ? caught.message : String(caught)
  }
}

async function loadTimeline(reset = false) {
  if (!reset && (loading.value || ended.value)) return
  if (reset) {
    items.value = []
    offset = 0
    total.value = 0
    ended.value = false
  }
  const sequence = ++timelineSequence
  loading.value = true
  loadError.value = ''
  try {
    const response = await api.timeline({
      day: selectedDay.value || undefined,
      year: currentYear.value,
      limit: PAGE_SIZE,
      offset,
    })
    if (sequence !== timelineSequence) return
    items.value = reset ? response.items : [...items.value, ...response.items]
    offset += response.items.length
    total.value = response.total
    ended.value = !response.has_more
  } catch (caught) {
    if (sequence === timelineSequence) {
      loadError.value = caught instanceof ApiError ? caught.message : String(caught)
    }
  } finally {
    if (sequence === timelineSequence) loading.value = false
  }
}

onMounted(async () => {
  await loadHeatmap()
  void loadTimeline(true)
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadTimeline()
    },
    { rootMargin: '400px 0px' },
  )
  await nextTick()
  if (sentinel.value) observer.observe(sentinel.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
})

watch(selectedDay, () => {
  void loadTimeline(true)
})

watch(yearQuery, async () => {
  items.value = []
  total.value = 0
  await loadHeatmap()
  void loadTimeline(true)
})
</script>

<template>
  <section class="timeline">
    <header class="timeline-head">
      <div>
        <p class="eyebrow">收藏时间线</p>
        <h2>你保存过的东西</h2>
        <p class="timeline-lede">
          {{ heatmap ? `${heatmap.year} 年` : '所选年份' }}
          <strong>{{ heatmap ? formatNumber(heatmap.total) : '—' }}</strong>
          条收藏。点击热力图的某一天筛选下方动态。
        </p>
      </div>
      <div v-if="selectedDay" class="day-filter">
        <span>{{ selectedDay }} · {{ formatNumber(selectedCount) }} 条</span>
        <button type="button" aria-label="清除日期筛选" @click="clearDay">×</button>
      </div>
    </header>

    <div class="timeline-panel panel">
      <div class="heatmap-wrap">
        <div class="heatmap-head">
          <div>
            <p class="section-label">收藏热力图</p>
            <p class="heatmap-summary">
              {{ heatmap ? `${heatmap.year} 年 · 仅统计有保存时间的平台` : '正在读取收藏日期…' }}
            </p>
          </div>
          <div class="heatmap-tools">
            <Select
              v-if="yearOptions.length"
              :model-value="heatmap?.year ?? null"
              :options="yearOptions"
              option-label="label"
              option-value="value"
              size="small"
              class="year-select"
              aria-label="热力图年份"
              @update:model-value="changeYear"
            />
            <div class="heatmap-legend" aria-hidden="true">
              <span>少</span>
              <i class="level-0" />
              <i class="level-1" />
              <i class="level-2" />
              <i class="level-3" />
              <i class="level-4" />
              <span>多</span>
            </div>
          </div>
        </div>

        <p v-if="heatmapError" class="error">热力图读取失败：{{ heatmapError }}</p>
        <Skeleton v-else-if="!heatmap" width="100%" height="130px" borderRadius="10px" />
        <div v-else class="heatmap-layout">
          <div class="heatmap-weekdays" aria-hidden="true">
            <span />
            <span>一</span>
            <span />
            <span>三</span>
            <span />
            <span>五</span>
            <span />
          </div>
          <div class="heatmap-scroll">
            <div class="heatmap-months" aria-hidden="true">
              <span
                v-for="month in months"
                :key="month.key"
                class="heatmap-month"
                :style="{ width: monthWidth(month.startWeek, month.endWeek) }"
              >
                {{ month.label }}
              </span>
            </div>
            <div class="heatmap-grid" role="group" aria-label="每日收藏数量">
              <button
                v-for="day in heatmap.days"
                :key="day.date"
                type="button"
                class="heatmap-cell"
                :class="[`level-${levelFor(day.count)}`, { selected: selectedDay === day.date }]"
                :disabled="day.count === 0"
                :title="`${day.date} · ${day.count} 条`"
                :aria-label="`${day.date}，${day.count} 条收藏`"
                @click="selectDay(day)"
              />
            </div>
          </div>
        </div>
      </div>

      <div class="feed">
        <header class="feed-head">
          <p class="section-label">
            活动动态<span v-if="heatmap" class="feed-year"> · {{ heatmap.year }}</span>
          </p>
          <span class="feed-total">{{ formatNumber(total) }} 条</span>
        </header>

        <p v-if="loadError" class="error">
          活动读取失败：{{ loadError }}
          <button type="button" class="retry" @click="loadTimeline()">重试</button>
        </p>
        <p v-else-if="!items.length && loading" class="muted">正在加载活动…</p>
        <p v-else-if="!items.length" class="muted">
          {{ selectedDay ? '这一天没有收藏记录。' : '还没有可展示的收藏记录。' }}
        </p>

        <div v-else class="feed-list">
          <template v-for="(item, index) in items" :key="item.key">
            <p
              v-if="index === 0 || item.day !== items[index - 1]?.day"
              class="feed-day"
            >
              <span>{{ dayLabel(item.day) }}</span>
              <span class="feed-day-line" />
            </p>
            <RouterLink :to="detailRoute(item)" class="feed-row">
              <span class="feed-time">{{ clock(item) }}</span>
              <span class="feed-mark" :style="{ background: colorFor(item) }">
                {{ markFor(item) }}
              </span>
              <span v-if="item.cover" class="feed-cover">
                <img
                  :src="item.cover"
                  alt=""
                  loading="lazy"
                  referrerpolicy="no-referrer"
                  @error="dropCover(item)"
                />
              </span>
              <span class="feed-copy">
                <span class="feed-title">{{ item.title || '（无标题）' }}</span>
                <span class="feed-meta">
                  <span>{{ platformLabel(item.platform) }}</span>
                  <span v-if="item.subtitle" class="feed-subtitle">{{ item.subtitle }}</span>
                  <span>{{ item.time_label }}</span>
                </span>
              </span>
              <span class="feed-arrow" aria-hidden="true">→</span>
            </RouterLink>
          </template>
        </div>

        <div ref="sentinel" class="feed-sentinel" aria-hidden="true" />
        <p v-if="loading && items.length" class="feed-status">正在加载更早的收藏…</p>
        <p v-else-if="ended && items.length" class="feed-status">
          已经到底了 · 共 {{ formatNumber(total) }} 条
        </p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.timeline {
  min-width: 0;
}

.timeline-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.timeline-head h2 {
  margin: 0;
  font-size: 20px;
  letter-spacing: -0.02em;
}

.timeline-lede {
  margin: 5px 0 0;
  color: var(--muted);
  font-size: 13px;
}

.timeline-lede strong {
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.day-filter {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px 6px 12px;
  border: 1px solid var(--primary-border);
  border-radius: 999px;
  background: var(--primary-soft);
  color: var(--primary-text);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.day-filter button {
  display: grid;
  width: 20px;
  height: 20px;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
}

.day-filter button:hover {
  background: var(--primary-border);
}

.timeline-panel {
  overflow: hidden;
}

.heatmap-wrap {
  padding: 20px 22px 18px;
  border-bottom: 1px solid var(--border-soft);
}

.heatmap-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.section-label {
  margin: 0 0 5px;
  color: var(--muted-light);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.heatmap-summary {
  margin: 0;
  color: var(--muted-light);
  font-size: 11.5px;
}

.heatmap-legend {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--muted-light);
  font-size: 10.5px;
}

.heatmap-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 14px;
}

.year-select {
  min-width: 98px;
}

.heatmap-legend i {
  width: 11px;
  height: 11px;
  border-radius: 2px;
}

.heatmap-layout {
  display: flex;
  align-items: flex-start;
  gap: 7px;
}

.heatmap-weekdays {
  display: grid;
  grid-template-rows: repeat(7, 11px);
  gap: 3px;
  width: 12px;
  flex: none;
  padding-top: 18px;
  color: var(--muted-light);
  font-size: 9px;
  line-height: 11px;
  text-align: right;
}

.heatmap-scroll {
  min-width: 0;
  overflow-x: auto;
  padding-bottom: 3px;
}

.heatmap-months {
  display: flex;
  height: 15px;
  margin-bottom: 3px;
  color: var(--muted-light);
  font-size: 9.5px;
  white-space: nowrap;
}

.heatmap-month {
  flex: none;
  overflow: hidden;
  text-overflow: clip;
}

.heatmap-grid {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 11px;
  grid-template-rows: repeat(7, 11px);
  gap: 3px;
  width: max-content;
}

.heatmap-cell {
  width: 11px;
  height: 11px;
  padding: 0;
  border: 0;
  border-radius: 2px;
  background: var(--surface-sunken);
  cursor: pointer;
  transition: box-shadow 80ms ease;
}

.heatmap-cell:disabled {
  cursor: default;
}

.heatmap-cell:not(:disabled):hover {
  box-shadow: 0 0 0 1.5px var(--muted);
}

.heatmap-cell.selected {
  box-shadow: 0 0 0 1.5px var(--primary);
}

.heatmap-cell.level-0 {
  background: var(--surface-sunken);
}

.heatmap-cell.level-1,
.heatmap-legend .level-1 {
  background: color-mix(in srgb, var(--primary) 24%, var(--surface-sunken));
}

.heatmap-cell.level-2,
.heatmap-legend .level-2 {
  background: color-mix(in srgb, var(--primary) 44%, var(--surface-sunken));
}

.heatmap-cell.level-3,
.heatmap-legend .level-3 {
  background: color-mix(in srgb, var(--primary) 67%, var(--surface-sunken));
}

.heatmap-cell.level-4,
.heatmap-legend .level-4 {
  background: var(--primary);
}

.heatmap-legend .level-0 {
  background: var(--surface-sunken);
}

.feed {
  padding: 18px 22px 22px;
}

.feed-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 4px;
}

.feed-head .section-label {
  margin: 0;
}

.feed-total {
  color: var(--muted-light);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.feed-day {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 20px 0 6px;
  color: var(--muted);
  font-size: 11.5px;
  font-weight: 600;
}

.feed-day:first-child {
  margin-top: 8px;
}

.feed-day-line {
  flex: 1;
  height: 1px;
  background: var(--border-soft);
}

.feed-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 52px;
  padding: 7px 8px;
  border-radius: 9px;
  color: inherit;
  text-decoration: none;
  transition: background-color 90ms ease;
}

.feed-row:hover {
  background: var(--surface-hover);
}

.feed-time {
  width: 36px;
  flex: none;
  color: var(--muted-light);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.feed-mark {
  width: 24px;
  height: 24px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 7px;
  color: #ffffff;
  font-size: 11px;
  font-weight: 700;
}

.feed-cover {
  width: 52px;
  height: 39px;
  flex: none;
  overflow: hidden;
  border-radius: 6px;
  background: var(--surface-sunken);
}

.feed-cover img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.feed-copy {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.feed-title {
  overflow: hidden;
  color: var(--text);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.feed-meta {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 4px 10px;
  color: var(--muted-light);
  font-size: 11px;
}

.feed-subtitle {
  overflow: hidden;
  max-width: 420px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.feed-arrow {
  flex: none;
  color: var(--muted-light);
  font-size: 13px;
}

.feed-status {
  margin: 16px 0 0;
  color: var(--muted-light);
  font-size: 11.5px;
  text-align: center;
}

.feed-sentinel {
  height: 1px;
}

.retry {
  margin-left: 8px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--primary);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
}

@media (max-width: 760px) {
  .timeline-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .heatmap-wrap,
  .feed {
    padding-right: 16px;
    padding-left: 16px;
  }

  .heatmap-head {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }

  .heatmap-tools {
    justify-content: flex-start;
  }

  .heatmap-legend {
    display: none;
  }

  .feed-time {
    display: none;
  }

  .feed-cover {
    width: 44px;
    height: 33px;
  }

  .feed-subtitle {
    max-width: 180px;
  }
}
</style>
