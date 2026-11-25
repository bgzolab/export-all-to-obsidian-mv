<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import type { RouteLocationRaw } from 'vue-router'
import Button from 'openvue/button'
import Skeleton from 'openvue/skeleton'
import Toolbar from 'openvue/toolbar'

import { ApiError, api } from '@/api/client'
import type { ColumnMeta, TableMeta } from '@/api/types'
import FieldRenderer from '@/components/FieldRenderer.vue'
import PreviewCard from '@/components/PreviewCard.vue'
import { useDetailExtras } from '@/composables/useDetailExtras'
import { useSchema } from '@/composables/useSchema'
import { columnLabel } from '@/config/columns'
import {
  detailConfigFor,
  detailFieldLabel,
  detailFieldValue,
  detailUrl,
  firstDetailValue,
} from '@/config/details'
import type { DetailFieldSpec } from '@/config/details'
import { platformConfigForTable, platformLabel } from '@/config/platforms'
import { tableLabel, titleColumnFor } from '@/config/tables'
import { specTextFor } from '@/utils/extras'
import { formatCompact, formatNumber } from '@/utils/format'
import { decodePk, encodePk } from '@/utils/pk'
import {
  detailMove,
  detailPageIndex,
  rememberDetailPage,
  rememberedDetailPage,
  rememberedTableQuery,
} from '@/utils/tableState'
import type { DetailPageState } from '@/utils/tableState'
import { findTweetMedia } from '@/utils/twitter'
import type { TweetMedia } from '@/utils/twitter'

const route = useRoute()
const router = useRouter()
const { schema, error: schemaError } = useSchema()

const tableName = computed(() => String(route.params.table ?? ''))
const pkParam = computed(() => String(route.params.pk ?? ''))
const decodedPk = computed(() => decodePk(pkParam.value))
const table = computed<TableMeta | undefined>(() =>
  schema.value?.tables.find((item) => item.name === tableName.value),
)
const config = computed(() => detailConfigFor(tableName.value))
const platform = computed(() =>
  table.value ? platformConfigForTable(table.value.name) : undefined,
)

const {
  lookupConfig,
  lookupValue,
  lookupColumn,
  lookupLoading,
  sourceItems,
  folderItems,
  childrenConfig,
  childrenTotal,
  childrenLoading,
  childrenError,
  childViews,
  reset: resetExtras,
  load: loadExtras,
} = useDetailExtras(config, schema)

const row = ref<Record<string, unknown> | null>(null)
const previewRow = ref<Record<string, unknown> | null>(null)
const previewLoading = ref(false)
const mediaItems = ref<TweetMedia[]>([])
const mediaLoading = ref(false)
const loading = ref(false)
const notFound = ref(false)
const loadError = ref('')
const pageState = ref<DetailPageState | null>(null)
const navBusy = ref(false)
const navError = ref('')

let requestSequence = 0
let previewSequence = 0
let mediaSequence = 0

const title = computed(() => {
  const value = firstDetailValue(row.value, config.value?.title)
  if (value !== undefined) return String(value)
  if (config.value?.heading) return config.value.heading
  const fallback = titleColumnFor(tableName.value)
  const fallbackValue = fallback ? row.value?.[fallback] : undefined
  return fallbackValue ? String(fallbackValue) : tableLabel(tableName.value)
})

const kicker = computed(() => {
  const platform = platformLabel(table.value?.platform ?? '')
  const label = tableLabel(tableName.value)
  // Avoid "网易云音乐 · 网易云歌曲" when the table label already names the
  // platform; the first few characters are enough for this check.
  return label.startsWith(platform.slice(0, 3)) ? label : `${platform} · ${label}`
})

function fieldText(spec: string | DetailFieldSpec): string {
  if (!table.value || !row.value) return ''
  return specTextFor(table.value, row.value, spec)
}

const subtitle = computed(() => {
  const parts: string[] = []
  for (const spec of config.value?.subtitle ?? []) {
    const text = fieldText(spec)
    if (text) parts.push(text)
    if (parts.length === 2) break
  }
  return parts.join(' · ')
})

function metaText(spec: string | DetailFieldSpec): string {
  const value = detailFieldValue(row.value, spec)
  if (value === undefined || value === null || value === '') return ''
  if (Array.isArray(value)) {
    const names = value
      .slice(0, 6)
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object') {
          const record = item as Record<string, unknown>
          return String(record.name ?? record.title ?? record.username ?? '')
        }
        return String(item)
      })
      .filter(Boolean)
    return names.join('、')
  }
  if (typeof value === 'object') return ''
  return fieldText(spec)
}

const metaItems = computed(() => {
  const specs: Array<string | DetailFieldSpec> = [...(config.value?.meta ?? [])]
  const hasSyncColumn = table.value?.columns.some((column) => column.name === 'db_updated_at')
  const hasSyncSpec = specs.some((spec) => {
    const name = typeof spec === 'string' ? spec.split('.', 1)[0] : spec.column
    return name === 'db_updated_at'
  })
  if (hasSyncColumn && !hasSyncSpec) specs.push('db_updated_at')
  return specs
    .map((spec) => ({
      label: detailFieldLabel(tableName.value, spec),
      value: metaText(spec),
    }))
    .filter((item) => item.value)
})

const stats = computed(() => {
  const items: Array<{ label: string; value: string }> = []
  for (const spec of config.value?.stats ?? []) {
    const value = detailFieldValue(row.value, spec)
    if (typeof value !== 'number') continue
    items.push({
      label: detailFieldLabel(tableName.value, spec),
      value: formatCompact(value),
    })
  }
  return items
})

const cover = computed(() => detailUrl(row.value, config.value?.cover) ?? '')
const coverFailed = ref(false)
watch(cover, () => {
  coverFailed.value = false
})

const externalUrl = computed(() => detailUrl(row.value, config.value?.url))

const contentItems = computed(() => {
  const current = table.value
  if (!current) return []
  const items: Array<{
    key: string
    label: string
    value: unknown
    column: ColumnMeta
  }> = []
  const groups = config.value?.content ?? []
  groups.forEach((group, index) => {
    const specs = Array.isArray(group) ? group : [group]
    for (const spec of specs) {
      const value = detailFieldValue(row.value, spec)
      if (
        value === null ||
        value === undefined ||
        value === '' ||
        (Array.isArray(value) && value.length === 0)
      ) {
        continue
      }
      const columnName = typeof spec === 'string' ? spec.split('.', 1)[0] : spec.column
      const column = current.columns.find((item) => item.name === columnName)
      if (!column) continue
      items.push({
        key: `${column.name}-${index}`,
        label: detailFieldLabel(current.name, spec),
        value,
        column,
      })
      break
    }
  })
  return items
})

const allFields = computed<ColumnMeta[]>(
  () => table.value?.columns.filter((column) => !column.hidden) ?? [],
)

/** GitHub README images are stored as repository-relative paths. */
function baseUrlFor(columnName: string): string | undefined {
  if (table.value?.name !== 'github_star' || columnName !== 'readme') return undefined
  const fullName = row.value?.full_name
  return typeof fullName === 'string' && fullName
    ? `https://raw.githubusercontent.com/${fullName}/HEAD/`
    : undefined
}

const embedUrl = computed(() => {
  if (!row.value) return ''
  const id = row.value
  if (config.value?.embed === 'bilibili') {
    const bvid = id.bvid ?? id.bv_id
    return bvid ? `https://player.bilibili.com/player.html?bvid=${bvid}&autoplay=0` : ''
  }
  if (config.value?.embed === 'netease-song' && id.song_id) {
    return `https://music.163.com/outchain/player?type=2&id=${id.song_id}&auto=0&height=86`
  }
  if (config.value?.embed === 'netease-playlist' && id.playlist_id) {
    return `https://music.163.com/outchain/player?type=0&id=${id.playlist_id}&auto=0&height=430`
  }
  return ''
})

const relatedLinks = computed(() => {
  const current = table.value
  const currentRow = row.value
  if (!current || !currentRow) return []
  const links: Array<{ label: string; to: RouteLocationRaw }> = []
  for (const spec of config.value?.related ?? []) {
    const value = currentRow[spec.column]
    if (value === undefined || value === null || value === '') continue
    if (spec.mode === 'detail') {
      const target = schema.value?.tables.find((item) => item.name === spec.table)
      if (!target) continue
      const targetColumn = spec.targetColumn ?? spec.column
      if (!target.primary_key.includes(targetColumn)) continue
      links.push({
        label: spec.label,
        to: {
          name: 'detail',
          params: { table: spec.table, pk: encodePk({ [targetColumn]: value }) },
        },
      })
      continue
    }
    const targetColumn = spec.targetColumn ?? spec.column
    links.push({
      label: spec.label,
      to: {
        name: 'table',
        params: { table: spec.table },
        query: {
          filters: JSON.stringify([{ column: targetColumn, op: 'eq', value }]),
        },
      },
    })
  }
  return links
})

const previewTable = computed(() => config.value?.preview?.table ?? '')

const responseId = computed(() => row.value?.response_id)

const hasAside = computed(
  () =>
    metaItems.value.length > 0 ||
    sourceItems.value.length > 0 ||
    folderItems.value.length > 0 ||
    relatedLinks.value.length > 0 ||
    responseId.value !== undefined,
)

/** Current row as a primary-key object; the detail URL already encodes one. */
const currentPk = computed<Record<string, unknown> | null>(() => {
  const meta = table.value
  const current = row.value
  if (!meta || !current) return null
  const pk: Record<string, unknown> = {}
  for (const name of meta.primary_key) {
    if (current[name] === undefined) return null
    pk[name] = current[name]
  }
  return pk
})

const navIndex = computed(() =>
  pageState.value && currentPk.value
    ? detailPageIndex(pageState.value.pks, currentPk.value)
    : -1,
)

const positionText = computed(() => {
  const page = pageState.value
  if (!page || navIndex.value < 0) return ''
  const offset = page.request.offset ?? 0
  return `${formatNumber(offset + navIndex.value + 1)} / ${formatNumber(page.total)}`
})

const canPrev = computed(
  () =>
    Boolean(pageState.value && currentPk.value) &&
    detailMove(pageState.value!, currentPk.value!, 'prev').type !== 'none',
)

const canNext = computed(
  () =>
    Boolean(pageState.value && currentPk.value) &&
    detailMove(pageState.value!, currentPk.value!, 'next').type !== 'none',
)

function scrollMainToTop() {
  document.querySelector('.app-main')?.scrollTo({ top: 0 })
}

function openDetail(pk: Record<string, unknown>) {
  void router.push({
    name: 'detail',
    params: { table: tableName.value, pk: encodePk(pk) },
  })
}

/**
 * Move inside the page captured by TableView. At a page edge, fetch the
 * neighbouring page with the same request so filters and sorting survive.
 */
async function moveDetail(direction: 'prev' | 'next') {
  const meta = table.value
  const page = pageState.value
  if (!meta || !page || !currentPk.value || navBusy.value) return
  const move = detailMove(page, currentPk.value, direction)
  if (move.type === 'none') return
  if (move.type === 'row') {
    openDetail(move.pk)
    return
  }

  navBusy.value = true
  navError.value = ''
  try {
    const request = {
      ...page.request,
      columns: [...meta.primary_key],
      offset: move.offset,
    }
    const response = await api.queryTable(tableName.value, request)
    const pks = response.rows
      .map((item) => {
        const pk: Record<string, unknown> = {}
        for (const name of meta.primary_key) {
          if (item[name] === undefined) return null
          pk[name] = item[name]
        }
        return pk
      })
      .filter((pk): pk is Record<string, unknown> => Boolean(pk))
    if (!pks.length) {
      navError.value = '相邻页没有记录。'
      return
    }
    const next: DetailPageState = { request, total: response.total, pks }
    pageState.value = next
    rememberDetailPage(tableName.value, next)
    const target = direction === 'prev' ? pks[pks.length - 1] : pks[0]
    if (target) openDetail(target)
  } catch (caught) {
    navError.value = caught instanceof ApiError ? caught.message : String(caught)
  } finally {
    navBusy.value = false
  }
}

async function loadPreview(currentRow: Record<string, unknown>) {
  const spec = config.value?.preview
  if (!spec) return
  const value = currentRow[spec.column]
  if (value === undefined || value === null || value === '') return
  const sequence = ++previewSequence
  previewLoading.value = true
  previewRow.value = null
  try {
    const response = await api.getRow(spec.table, {
      [spec.targetColumn ?? spec.column]: value,
    })
    if (sequence !== previewSequence) return
    previewRow.value = response.row
  } catch (caught) {
    if (sequence !== previewSequence) return
    if (!(caught instanceof ApiError && caught.status === 404)) {
      // A missing relation is normal; other failures stay silent so the main
      // record remains readable.
    }
  } finally {
    if (sequence === previewSequence) previewLoading.value = false
  }
}

async function loadMedia(currentRow: Record<string, unknown>) {
  if (config.value?.media !== 'twitter') return
  const responseId = currentRow.response_id
  const tweetId = currentRow.tweet_id
  if (responseId === undefined || responseId === null || tweetId === undefined) return
  const sequence = ++mediaSequence
  mediaLoading.value = true
  mediaItems.value = []
  try {
    const response = await api.response(responseId as number | string)
    if (sequence !== mediaSequence) return
    mediaItems.value = findTweetMedia(response.body, String(tweetId))
  } catch {
    if (sequence === mediaSequence) mediaItems.value = []
  } finally {
    if (sequence === mediaSequence) mediaLoading.value = false
  }
}

function resetMedia() {
  mediaSequence += 1
  mediaItems.value = []
  mediaLoading.value = false
}

async function load() {
  if (!table.value) return
  scrollMainToTop()
  pageState.value = null
  navError.value = ''
  if (!decodedPk.value) {
    loadError.value = '主键参数无效'
    row.value = null
    resetExtras()
    resetMedia()
    return
  }
  const sequence = ++requestSequence
  loading.value = true
  notFound.value = false
  loadError.value = ''
  row.value = null
  previewRow.value = null
  resetExtras()
  resetMedia()
  try {
    const response = await api.getRow(tableName.value, decodedPk.value)
    if (sequence !== requestSequence) return
    row.value = response.row
    pageState.value = rememberedDetailPage(tableName.value)
    void loadPreview(response.row)
    void loadExtras(response.row)
    void loadMedia(response.row)
  } catch (caught) {
    if (sequence !== requestSequence) return
    row.value = null
    resetExtras()
    resetMedia()
    if (caught instanceof ApiError && caught.status === 404) {
      notFound.value = true
    } else {
      loadError.value = caught instanceof ApiError ? caught.message : String(caught)
    }
  } finally {
    if (sequence === requestSequence) loading.value = false
  }
}

watch(() => [table.value, pkParam.value] as const, load, { immediate: true })

function goBack() {
  router.push({
    name: 'table',
    params: { table: tableName.value },
    query: rememberedTableQuery(tableName.value),
  })
}
</script>

<template>
  <section
    class="detail-view"
    :style="{ '--platform-color': platform?.color ?? 'var(--primary)' }"
  >
    <Toolbar class="detail-toolbar">
      <template #start>
        <Button
          text
          size="small"
          severity="secondary"
          label="← 返回列表"
          @click="goBack"
        />
        <span class="toolbar-divider" aria-hidden="true" />
        <span class="toolbar-crumb">
          <span>{{ platformLabel(table?.platform ?? '') }}</span>
          <em>/</em>
          <strong>{{ tableLabel(tableName) }}</strong>
        </span>
      </template>
      <template #end>
        <div v-if="positionText" class="detail-pager">
          <span class="pager-position">{{ positionText }}</span>
          <Button
            text
            size="small"
            severity="secondary"
            label="上一条"
            :disabled="!canPrev || navBusy"
            @click="moveDetail('prev')"
          />
          <Button
            text
            size="small"
            label="下一条"
            :disabled="!canNext || navBusy"
            @click="moveDetail('next')"
          />
        </div>
      </template>
    </Toolbar>

    <p v-if="navError" class="error nav-error">上/下一条加载失败：{{ navError }}</p>

    <p v-if="schemaError" class="error">无法读取数据目录：{{ schemaError }}</p>
    <p v-else-if="!schema" class="muted">正在读取数据目录…</p>
    <p v-else-if="!table" class="error">未知表：{{ tableName }}</p>

    <div v-else-if="loading" class="detail-skeleton panel" aria-busy="true">
      <Skeleton width="26%" height="12px" />
      <Skeleton width="68%" height="38px" />
      <Skeleton width="100%" height="180px" borderRadius="14px" />
      <Skeleton width="82%" height="14px" />
      <Skeleton width="74%" height="14px" />
    </div>

    <p v-else-if="notFound" class="error">记录不存在。</p>
    <p v-else-if="loadError" class="error">加载失败：{{ loadError }}</p>

    <article v-else-if="row" class="detail-card panel">
      <header class="detail-hero" :class="{ 'with-cover': cover && !coverFailed }">
        <div v-if="cover && !coverFailed" class="hero-cover">
          <img
            :src="cover"
            :alt="title"
            referrerpolicy="no-referrer"
            @error="coverFailed = true"
          />
        </div>
        <div class="hero-main">
          <p class="eyebrow">{{ kicker }}</p>
          <h1>{{ title }}</h1>
          <p v-if="subtitle" class="hero-subtitle">{{ subtitle }}</p>

          <div v-if="stats.length" class="hero-stats">
            <span v-for="stat in stats" :key="stat.label">
              <strong>{{ stat.value }}</strong>
              <em>{{ stat.label }}</em>
            </span>
          </div>

          <div class="hero-actions">
            <a
              v-if="externalUrl"
              :href="externalUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="external-link"
            >
              打开原站 <span aria-hidden="true">↗</span>
            </a>
            <span v-if="metaItems.length" class="hero-sync">
              {{ metaItems[metaItems.length - 1]?.label }}
              {{ metaItems[metaItems.length - 1]?.value }}
            </span>
          </div>
        </div>
      </header>

      <div class="detail-body" :class="{ 'single-column': !hasAside }">
        <main class="detail-main">
          <section v-if="previewTable" class="detail-section">
            <p class="section-label">关联内容</p>
            <p v-if="previewLoading" class="muted">正在读取关联记录…</p>
            <PreviewCard v-else-if="previewRow" :table="previewTable" :row="previewRow" />
          </section>

          <section v-if="embedUrl" class="detail-section">
            <iframe
              v-if="config?.embed === 'bilibili'"
              :src="embedUrl"
              class="video-embed"
              scrolling="no"
              frameborder="0"
              allowfullscreen
              loading="lazy"
              title="视频播放器"
            />
            <iframe
              v-else
              :src="embedUrl"
              :class="config?.embed === 'netease-playlist' ? 'playlist-embed' : 'audio-embed'"
              frameborder="no"
              allow="autoplay"
              loading="lazy"
              title="音乐播放器"
            />
          </section>

          <section v-if="lookupConfig" class="detail-section content-section">
            <div class="section-head">
              <p class="section-label">{{ lookupConfig.label }}</p>
              <span class="section-hint">已抓取的正文副本</span>
            </div>
            <p v-if="lookupLoading" class="muted">正在读取正文…</p>
            <div
              v-else-if="lookupValue !== undefined && lookupColumn"
              class="reading-column"
            >
              <FieldRenderer
                :table="lookupConfig.table"
                :column="lookupColumn"
                :value="lookupValue"
                expanded
              />
            </div>
            <p v-else class="content-empty">{{ lookupConfig.emptyText }}</p>
          </section>

          <section v-if="contentItems.length" class="detail-section content-section">
            <div class="section-head">
              <p class="section-label">正文</p>
              <span v-if="platform" class="section-hint">{{ platform.label }} · 只读副本</span>
            </div>
            <div class="reading-column">
              <section
                v-for="item in contentItems"
                :key="item.key"
                class="content-block"
              >
                <p v-if="contentItems.length > 1" class="section-label">{{ item.label }}</p>
                <FieldRenderer
                  :table="table.name"
                  :column="item.column"
                  :value="item.value"
                  :base-url="baseUrlFor(item.column.name)"
                  expanded
                />
              </section>
            </div>
          </section>

          <section
            v-if="config?.media === 'twitter' && (mediaLoading || mediaItems.length)"
            class="detail-section media-section"
          >
            <p class="section-label">图片与视频</p>
            <p v-if="mediaLoading" class="muted">正在读取图片…</p>
            <div v-else class="media-grid">
              <figure v-for="item in mediaItems" :key="item.url" class="media-item">
                <video
                  v-if="item.videoUrl"
                  :src="item.videoUrl"
                  :poster="item.url"
                  controls
                  preload="metadata"
                />
                <a v-else :href="item.url" target="_blank" rel="noopener noreferrer">
                  <img
                    :src="item.url"
                    alt="推文图片"
                    loading="lazy"
                    referrerpolicy="no-referrer"
                  />
                </a>
              </figure>
            </div>
          </section>

          <section v-if="childrenConfig" class="detail-section children-section">
            <header class="children-head">
              <p class="section-label">{{ childrenConfig.label }}</p>
              <span v-if="childrenTotal" class="children-count">
                {{ formatNumber(childrenTotal) }} 条
              </span>
            </header>
            <p v-if="childrenLoading" class="muted">正在读取{{ childrenConfig.label }}…</p>
            <p v-else-if="childrenError" class="error">读取失败：{{ childrenError }}</p>
            <p v-else-if="!childViews.length" class="muted">
              {{ childrenConfig.emptyText ?? '暂无记录。' }}
            </p>
            <div v-else class="child-list">
              <article v-for="view in childViews" :key="view.key" class="child-row">
                <span class="child-avatar">{{ (view.title || '·').slice(0, 1) }}</span>
                <div class="child-body">
                  <header class="child-head">
                    <strong class="child-title">{{ view.title }}</strong>
                    <span v-if="view.meta" class="child-meta">{{ view.meta }}</span>
                  </header>
                  <div
                    v-if="view.contentValue !== undefined && view.contentValue !== ''"
                    class="child-content"
                  >
                    <FieldRenderer
                      v-if="view.contentColumn"
                      :table="childrenConfig.table"
                      :column="view.contentColumn"
                      :value="view.contentValue"
                      expanded
                    />
                    <span v-else>{{ view.contentValue }}</span>
                  </div>
                </div>
              </article>
            </div>
            <p v-if="childrenTotal > childViews.length" class="muted children-more">
              已显示前 {{ childViews.length }} 条，共 {{ formatNumber(childrenTotal) }} 条。
            </p>
          </section>
        </main>

        <aside v-if="hasAside" class="detail-aside">
          <div class="aside-inner">
            <section v-if="metaItems.length" class="aside-block">
              <p class="section-label">记录信息</p>
              <dl class="fact-list">
                <template v-for="item in metaItems" :key="item.label">
                  <dt>{{ item.label }}</dt>
                  <dd>{{ item.value }}</dd>
                </template>
              </dl>
            </section>

            <section
              v-if="sourceItems.length || folderItems.length"
              class="aside-block"
            >
              <p class="section-label">来源</p>
              <ul class="source-list">
                <li v-for="source in sourceItems" :key="`source-${source.label}`">
                  <span class="source-name">
                    {{ source.label }}<em v-if="source.count > 1"> ×{{ source.count }}</em>
                  </span>
                  <span v-if="source.time" class="source-time">
                    {{ source.timeLabel }} {{ source.time }}
                  </span>
                </li>
                <li
                  v-for="folder in folderItems"
                  :key="`folder-${folder.folder}-${folder.time}`"
                >
                  <span class="source-name">{{ folder.folder }}</span>
                  <span v-if="folder.time" class="source-time">收藏 {{ folder.time }}</span>
                </li>
              </ul>
            </section>

            <section v-if="relatedLinks.length" class="aside-block">
              <p class="section-label">相关</p>
              <RouterLink
                v-for="link in relatedLinks"
                :key="link.label"
                :to="link.to"
                class="aside-link"
              >
                {{ link.label }}
                <span aria-hidden="true">→</span>
              </RouterLink>
            </section>

            <section v-if="responseId !== undefined" class="aside-block">
              <p class="section-label">数据</p>
              <RouterLink :to="`/raw/responses/${responseId}`" class="aside-link">
                原始响应 #{{ responseId }}
                <span aria-hidden="true">→</span>
              </RouterLink>
            </section>
          </div>
        </aside>
      </div>

      <details class="all-fields" :open="!config">
        <summary>全部字段（技术视图）</summary>
        <dl>
          <template v-for="column in allFields" :key="column.name">
            <dt :title="column.name">{{ columnLabel(table.name, column.name) }}</dt>
            <dd>
              <FieldRenderer
                :table="table.name"
                :column="column"
                :value="row[column.name]"
                :base-url="baseUrlFor(column.name)"
              />
            </dd>
          </template>
        </dl>
      </details>
    </article>
  </section>
</template>

<style scoped>
.detail-view {
  max-width: 1200px;
  margin: 0 auto;
  padding-bottom: 12px;
}

.detail-toolbar {
  position: sticky;
  top: calc(var(--main-pad-top) * -1);
  z-index: 4;
  margin-bottom: 16px;
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--surface) 90%, transparent);
  -webkit-backdrop-filter: blur(16px);
  backdrop-filter: blur(16px);
  box-shadow: var(--shadow-sm);
}

.detail-toolbar :deep(.p-toolbar-start),
.detail-toolbar :deep(.p-toolbar-end) {
  gap: 6px;
}

.toolbar-divider {
  width: 1px;
  height: 16px;
  background: var(--border);
}

.toolbar-crumb {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: var(--muted);
  font-size: 12px;
}

.toolbar-crumb em {
  color: var(--muted-light);
  font-style: normal;
}

.toolbar-crumb strong {
  overflow: hidden;
  color: var(--text-secondary);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-pager {
  display: flex;
  align-items: center;
  gap: 1px;
}

.pager-position {
  padding-right: 7px;
  color: var(--muted-light);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.nav-error {
  margin: -6px 2px 12px;
  font-size: 12px;
}

.detail-skeleton {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 980px;
  padding: 30px;
}

.detail-card {
  position: relative;
}

.detail-hero {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 28px;
  padding: 30px 34px 28px;
  border-bottom: 1px solid var(--border-soft);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  background:
    radial-gradient(620px 220px at 0% 0%, color-mix(in srgb, var(--platform-color) 12%, transparent), transparent 70%),
    linear-gradient(180deg, var(--surface-subtle), var(--surface));
}

.detail-hero::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 3px;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  background: linear-gradient(90deg, var(--platform-color), transparent 72%);
}

.hero-cover {
  width: 188px;
  flex: none;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface-sunken);
  box-shadow: 0 20px 40px -28px rgb(0 0 0 / 65%);
}

.hero-cover img {
  display: block;
  width: 100%;
  max-height: 300px;
  object-fit: contain;
}

.hero-main {
  flex: 1;
  min-width: 0;
  padding-top: 4px;
}

.detail-hero h1 {
  max-width: 900px;
  margin: 2px 0 0;
  font-size: clamp(26px, 2.5vw, 36px);
  line-height: 1.22;
  letter-spacing: -0.03em;
}

.hero-subtitle {
  margin: 10px 0 0;
  color: var(--muted);
  font-size: 14.5px;
  line-height: 1.6;
}

.hero-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 18px;
}

.hero-stats span {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 76px;
  padding: 8px 12px;
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.hero-stats strong {
  color: var(--text);
  font-size: 17px;
  line-height: 1.2;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}

.hero-stats em {
  color: var(--muted);
  font-style: normal;
  font-size: 11px;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 18px;
}

.external-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border: 1px solid var(--primary-border);
  border-radius: 8px;
  background: var(--primary-soft);
  color: var(--primary-text);
  font-size: 12.5px;
  font-weight: 600;
  text-decoration: none;
}

.external-link:hover {
  border-color: var(--primary);
}

.hero-sync {
  color: var(--muted-light);
  font-size: 11.5px;
}

.detail-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 288px;
}

.detail-body.single-column {
  display: block;
}

.detail-main {
  min-width: 0;
  padding: 28px 34px 34px;
}

.single-column .detail-main {
  max-width: 900px;
  margin: 0 auto;
}

.detail-aside {
  min-width: 0;
  padding: 28px 28px 34px 0;
  border-left: 1px solid var(--border-soft);
}

.aside-inner {
  position: sticky;
  top: 35px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.detail-section {
  min-width: 0;
}

.detail-section + .detail-section {
  margin-top: 28px;
  padding-top: 26px;
  border-top: 1px solid var(--border-soft);
}

.section-label {
  margin: 0 0 10px;
  color: var(--muted-light);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  max-width: 780px;
  margin-bottom: 12px;
}

.section-head .section-label {
  margin: 0;
}

.section-hint {
  color: var(--muted-light);
  font-size: 11.5px;
  white-space: nowrap;
}

.reading-column {
  max-width: 680px;
}

.reading-column :deep(.text),
.child-content :deep(.text) {
  color: var(--text-reading);
  font-size: 16px;
  line-height: 1.85;
}

.content-block + .content-block {
  margin-top: 24px;
}

.content-empty {
  margin: 0;
  color: var(--muted);
  font-size: 13.5px;
  line-height: 1.8;
}

.video-embed {
  display: block;
  width: 100%;
  max-width: 820px;
  aspect-ratio: 16 / 9;
  border: 0;
  border-radius: 12px;
  background: #000000;
}

.audio-embed {
  display: block;
  width: 100%;
  max-width: 820px;
  height: 86px;
  border: 0;
  border-radius: 12px;
}

.playlist-embed {
  display: block;
  width: 100%;
  max-width: 820px;
  height: 430px;
  border: 0;
  border-radius: 12px;
}

.media-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  max-width: 760px;
}

.media-item {
  margin: 0;
  overflow: hidden;
  border: 1px solid var(--border-soft);
  border-radius: 12px;
  background: var(--surface-sunken);
}

.media-item img {
  display: block;
  width: 100%;
  max-height: 460px;
  object-fit: contain;
}

.media-item video {
  display: block;
  width: 100%;
  max-height: 460px;
  aspect-ratio: 16 / 9;
  object-fit: contain;
}

.children-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.children-head .section-label {
  margin: 0;
}

.children-count {
  color: var(--muted-light);
  font-size: 11px;
}

.child-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.child-row {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid var(--border-soft);
  border-radius: 12px;
  background: var(--surface-subtle);
}

.child-avatar {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 50%;
  background: var(--primary-soft);
  color: var(--primary-text);
  font-size: 12px;
  font-weight: 700;
}

.child-body {
  min-width: 0;
}

.child-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 12px;
}

.child-title {
  color: var(--text);
  font-size: 13px;
}

.child-meta {
  color: var(--muted-light);
  font-size: 11px;
}

.child-content {
  max-width: 720px;
  margin-top: 8px;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.8;
}

.child-content :deep(img) {
  max-width: 100%;
  height: auto;
}

.children-more {
  margin: 10px 0 0;
}

.aside-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fact-list {
  display: grid;
  grid-template-columns: minmax(60px, auto) 1fr;
  gap: 8px 12px;
  margin: 0;
}

.fact-list dt {
  color: var(--muted-light);
  font-size: 11.5px;
}

.fact-list dd {
  margin: 0;
  color: var(--text-secondary);
  font-size: 12.5px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.source-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.source-list li {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 9px 11px;
  border: 1px solid var(--border-soft);
  border-radius: 9px;
  background: var(--surface-subtle);
  font-size: 12px;
}

.source-name {
  color: var(--text-secondary);
  font-weight: 600;
}

.source-name em {
  color: var(--primary);
  font-style: normal;
}

.source-time {
  color: var(--muted-light);
  font-size: 11px;
}

.aside-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  background: var(--surface-subtle);
  color: var(--primary-text);
  font-size: 12px;
  text-decoration: none;
}

.aside-link span {
  color: var(--muted-light);
}

.aside-link:hover {
  border-color: var(--primary-border);
  background: var(--primary-soft);
}

.all-fields {
  padding: 14px 34px 20px;
  border-top: 1px solid var(--border-soft);
  border-radius: 0 0 var(--radius-lg) var(--radius-lg);
  background: var(--surface-subtle);
}

.all-fields summary {
  cursor: pointer;
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
  user-select: none;
}

.all-fields dl {
  display: grid;
  grid-template-columns: minmax(150px, max-content) 1fr;
  gap: 8px 20px;
  max-width: 900px;
  margin: 16px 0 0;
}

.all-fields dt {
  color: var(--muted);
  font-size: 12px;
}

.all-fields dd {
  margin: 0;
  font-size: 13px;
  overflow-wrap: anywhere;
}

@media (max-width: 1080px) {
  .detail-body {
    display: block;
  }

  .detail-aside {
    padding: 24px 34px 30px;
    border-top: 1px solid var(--border-soft);
    border-left: 0;
  }

  .aside-inner {
    position: static;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 22px;
  }
}

@media (max-width: 760px) {
  .detail-toolbar {
    top: 0;
  }
}

@media (max-width: 720px) {
  .detail-toolbar {
    padding: 4px 6px;
  }

  .toolbar-crumb,
  .toolbar-divider,
  .pager-position {
    display: none;
  }

  .detail-hero {
    flex-direction: column;
    gap: 18px;
    padding: 22px 20px;
  }

  .hero-cover {
    width: 100%;
    max-width: 200px;
  }

  .detail-hero h1 {
    font-size: 24px;
  }

  .detail-main {
    padding: 22px 20px 26px;
  }

  .detail-aside {
    padding: 20px;
  }

  .aside-inner {
    grid-template-columns: 1fr;
    gap: 20px;
  }

  .media-grid {
    grid-template-columns: 1fr;
  }

  .all-fields {
    padding: 14px 20px 20px;
  }

  .all-fields dl {
    grid-template-columns: 1fr;
    gap: 4px;
  }

  .all-fields dd {
    margin-bottom: 8px;
  }
}
</style>
