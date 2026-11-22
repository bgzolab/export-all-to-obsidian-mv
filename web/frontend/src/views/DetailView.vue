<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import type { RouteLocationRaw } from 'vue-router'

import { ApiError, api } from '@/api/client'
import type { ColumnMeta, TableMeta } from '@/api/types'
import FieldRenderer from '@/components/FieldRenderer.vue'
import PreviewCard from '@/components/PreviewCard.vue'
import { useSchema } from '@/composables/useSchema'
import { columnLabel } from '@/config/columns'
import {
  detailConfigFor,
  detailFieldLabel,
  detailFieldPrefix,
  detailFieldValue,
  detailUrl,
  firstDetailValue,
} from '@/config/details'
import type { DetailFieldSpec } from '@/config/details'
import { platformLabel } from '@/config/platforms'
import { tableLabel, titleColumnFor } from '@/config/tables'
import { formatCellValue, formatCompact } from '@/utils/format'
import { decodePk, encodePk } from '@/utils/pk'

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

const row = ref<Record<string, unknown> | null>(null)
const previewRow = ref<Record<string, unknown> | null>(null)
const previewLoading = ref(false)
const loading = ref(false)
const notFound = ref(false)
const loadError = ref('')

let requestSequence = 0
let previewSequence = 0

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
  const current = table.value
  if (!current || !row.value) return ''
  const value = detailFieldValue(row.value, spec)
  if (value === undefined || value === null || value === '') return ''
  const columnName = typeof spec === 'string' ? spec.split('.', 1)[0] : spec.column
  const column = current.columns.find((item) => item.name === columnName)
  // A path read from a JSON column is already a scalar; passing it through
  // formatCellValue would label it "JSON" because the source column is JSON.
  const derived = typeof spec !== 'string' ? Boolean(spec.path?.length) : spec.includes('.')
  const text = derived
    ? String(value)
    : column
      ? formatCellValue(current.name, column, value)
      : String(value)
  return `${detailFieldPrefix(spec)}${text}`
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

async function load() {
  if (!table.value) return
  if (!decodedPk.value) {
    loadError.value = '主键参数无效'
    row.value = null
    return
  }
  const sequence = ++requestSequence
  loading.value = true
  notFound.value = false
  loadError.value = ''
  row.value = null
  previewRow.value = null
  try {
    const response = await api.getRow(tableName.value, decodedPk.value)
    if (sequence !== requestSequence) return
    row.value = response.row
    void loadPreview(response.row)
  } catch (caught) {
    if (sequence !== requestSequence) return
    row.value = null
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
  router.push({ name: 'table', params: { table: tableName.value } })
}
</script>

<template>
  <section class="detail-view">
    <button type="button" class="back" @click="goBack">← 返回 {{ tableLabel(tableName) }}</button>

    <p v-if="schemaError" class="error">无法读取数据目录：{{ schemaError }}</p>
    <p v-else-if="!schema" class="muted">正在读取数据目录…</p>
    <p v-else-if="!table" class="error">未知表：{{ tableName }}</p>
    <p v-else-if="loading" class="muted">正在加载…</p>
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
          <p class="eyebrow">
            {{ kicker }}
          </p>
          <h1>{{ title }}</h1>
          <p v-if="subtitle" class="hero-subtitle">{{ subtitle }}</p>

          <div v-if="stats.length" class="hero-stats">
            <span v-for="stat in stats" :key="stat.label">
              <strong>{{ stat.value }}</strong>
              {{ stat.label }}
            </span>
          </div>

          <div v-if="metaItems.length" class="hero-meta">
            <span v-for="item in metaItems" :key="item.label">
              <b>{{ item.label }}</b>
              {{ item.value }}
            </span>
          </div>

          <a
            v-if="externalUrl"
            :href="externalUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="external-link"
          >
            打开原文 ↗
          </a>
        </div>
      </header>

      <div v-if="previewTable" class="preview-section">
        <p class="section-label">关联内容</p>
        <p v-if="previewLoading" class="muted">正在读取关联记录…</p>
        <PreviewCard v-else-if="previewRow" :table="previewTable" :row="previewRow" />
      </div>

      <div v-if="embedUrl" class="embed-section">
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
      </div>

      <div v-if="contentItems.length" class="content-section">
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

      <div v-if="relatedLinks.length" class="related-links">
        <RouterLink
          v-for="link in relatedLinks"
          :key="link.label"
          :to="link.to"
          class="related-link"
        >
          {{ link.label }} →
        </RouterLink>
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
  max-width: 1060px;
  margin: 0 auto;
}

.back {
  display: inline-block;
  margin: 0 0 12px;
  padding: 0;
  border: 0;
  background: none;
  color: #4338ca;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
}

.back:hover {
  text-decoration: underline;
}

.detail-card {
  overflow: hidden;
}

.detail-hero {
  display: flex;
  gap: 26px;
  padding: 26px 28px;
  border-bottom: 1px solid #eef0f3;
}

.hero-cover {
  width: 180px;
  flex: none;
  align-self: flex-start;
  border-radius: 10px;
  overflow: hidden;
  background: #eef0f3;
}

.hero-cover img {
  display: block;
  width: 100%;
  height: auto;
}

.hero-main {
  min-width: 0;
  flex: 1;
}

.detail-hero h1 {
  margin: 0;
  font-size: 28px;
  line-height: 1.3;
}

.hero-subtitle {
  margin: 7px 0 0;
  color: #6b7280;
  font-size: 14px;
  line-height: 1.6;
}

.hero-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  margin-top: 16px;
  color: #6b7280;
  font-size: 12px;
}

.hero-stats span {
  display: flex;
  align-items: baseline;
  gap: 5px;
}

.hero-stats strong {
  color: #111827;
  font-size: 19px;
  font-variant-numeric: tabular-nums;
}

.hero-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 15px;
}

.hero-meta span {
  padding: 4px 8px;
  border-radius: 6px;
  background: #f8fafc;
  color: #4b5563;
  font-size: 12px;
}

.hero-meta b {
  margin-right: 4px;
  color: #9ca3af;
  font-weight: 500;
}

.external-link {
  display: inline-block;
  margin-top: 16px;
  color: #4338ca;
  font-size: 13px;
  text-decoration: none;
}

.external-link:hover {
  text-decoration: underline;
}

.preview-section {
  padding: 18px 28px 0;
}

.section-label {
  margin: 0 0 8px;
  color: #9ca3af;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.embed-section {
  padding: 18px 28px 0;
}

.video-embed {
  display: block;
  width: 100%;
  max-width: 820px;
  aspect-ratio: 16 / 9;
  border: 0;
  border-radius: 10px;
  background: #000000;
}

.audio-embed {
  display: block;
  width: 100%;
  max-width: 820px;
  height: 86px;
  border: 0;
  border-radius: 10px;
}

.playlist-embed {
  display: block;
  width: 100%;
  max-width: 820px;
  height: 430px;
  border: 0;
  border-radius: 10px;
}

.content-section {
  padding: 24px 28px;
}

.content-block + .content-block {
  margin-top: 20px;
}

.related-links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 28px 22px;
}

.related-link {
  padding: 6px 11px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  color: #4338ca;
  font-size: 12px;
  text-decoration: none;
}

.related-link:hover {
  background: #eef2ff;
}

.all-fields {
  padding: 14px 28px 22px;
  border-top: 1px solid #eef0f3;
  background: #fbfcfd;
}

.all-fields summary {
  cursor: pointer;
  color: #6b7280;
  font-size: 12px;
  user-select: none;
}

.all-fields dl {
  display: grid;
  grid-template-columns: minmax(150px, max-content) 1fr;
  gap: 7px 20px;
  margin: 16px 0 0;
}

.all-fields dt {
  color: #6b7280;
  font-size: 12px;
}

.all-fields dd {
  margin: 0;
  font-size: 13px;
  overflow-wrap: anywhere;
}

@media (max-width: 720px) {
  .detail-hero {
    flex-direction: column;
    padding: 18px;
  }

  .hero-cover {
    width: 100%;
    max-width: 220px;
  }

  .detail-hero h1 {
    font-size: 22px;
  }

  .preview-section,
  .embed-section,
  .content-section,
  .related-links,
  .all-fields {
    padding-left: 18px;
    padding-right: 18px;
  }

  .all-fields dl {
    grid-template-columns: 1fr;
  }
}
</style>
