<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import Button from 'openvue/button'
import Column from 'openvue/column'
import DataTable from 'openvue/datatable'
import type {
  DataTableRowClickEvent,
  DataTableSortEvent,
} from 'openvue/datatable'
import InputText from 'openvue/inputtext'
import MultiSelect from 'openvue/multiselect'
import Paginator from 'openvue/paginator'

import { ApiError, api } from '@/api/client'
import type { ColumnMeta, FilterSpec, SortSpec, TableMeta } from '@/api/types'
import CellValue from '@/components/CellValue.vue'
import FacetBar from '@/components/FacetBar.vue'
import FilterBar from '@/components/FilterBar.vue'
import GalleryGrid from '@/components/GalleryGrid.vue'
import { useSchema } from '@/composables/useSchema'
import { columnLabel, isIdColumn } from '@/config/columns'
import { firstDetailValue } from '@/config/details'
import type { DetailFieldSpec } from '@/config/details'
import { platformConfigForTable, platformLabel } from '@/config/platforms'
import { platformIcon, platformIconStyle } from '@/config/icons'
import {
  defaultSortFor,
  facetsFor,
  foldersFor,
  galleryFor,
  hiddenColumnsFor,
  listColumnsFor,
  searchColumnsFor,
  tableCountUnit,
  tableDescription,
  tableLabel,
  tableLayout,
  tableRelation,
  virtualColumnsFor,
} from '@/config/tables'
import type { VirtualColumn } from '@/config/tables'
import { foldersBySourceKey } from '@/utils/extras'
import type { FolderEntry } from '@/utils/extras'
import { formatNumber } from '@/utils/format'
import { relationDisplay, relationFieldColumn } from '@/utils/relation'
import { encodePk } from '@/utils/pk'
import {
  rememberDetailPage,
  rememberTableQuery,
  rememberTableScroll,
  rememberedTableQuery,
  rememberedTableScroll,
  tableQuery,
  tableQueryKey,
} from '@/utils/tableState'

const route = useRoute()
const router = useRouter()
const { schema, error: schemaError } = useSchema()

const tableName = computed(() => String(route.params.table ?? ''))
const table = computed<TableMeta | undefined>(() =>
  schema.value?.tables.find((item) => item.name === tableName.value),
)
const platform = computed(() =>
  table.value ? platformConfigForTable(table.value.name) : undefined,
)
const relation = computed(() => tableRelation(tableName.value))
const layout = computed(() => tableLayout(tableName.value))
const galleryConfig = computed(() => galleryFor(tableName.value))
const facets = computed(() => facetsFor(tableName.value))
const virtualColumns = computed(() => virtualColumnsFor(tableName.value))
const leadingVirtualColumns = computed(() =>
  virtualColumns.value.filter((column) => column.kind !== 'folders'),
)
const trailingVirtualColumns = computed(() =>
  virtualColumns.value.filter((column) => column.kind === 'folders'),
)
const folderSpec = computed(() => foldersFor(tableName.value))
const viewMode = ref<'gallery' | 'table'>('table')
const folders = ref(new Map<string, FolderEntry[]>())
const facetCounts = ref(new Map<string, Map<string, number>>())

const visibleColumns = computed<ColumnMeta[]>(() => {
  const hidden = hiddenColumnsFor(tableName.value)
  const compact = table.value?.kind === 'projection'
  return (
    table.value?.columns.filter(
      (column) =>
        !column.hidden &&
        !hidden.has(column.name) &&
        !(compact && (isIdColumn(column.name) || column.name === 'db_created_at')),
    ) ?? []
  )
})
const columnOptions = computed(() =>
  visibleColumns.value.map((column) => ({
    label: columnLabel(tableName.value, column.name),
    value: column.name,
  })),
)

const rows = ref<Array<Record<string, unknown>>>([])
const total = ref(0)
const loaded = ref(false)
const limit = ref(50)
const offset = ref(0)
const search = ref('')
const searchDraft = ref('')
const selectedColumns = ref<string[]>([])
const sortSpecs = ref<SortSpec[]>([])
const filters = ref<FilterSpec[]>([])
const filtersOpen = ref(false)
const loading = ref(false)
const loadError = ref('')
const relationRows = ref(new Map<string, Record<string, unknown>>())
const relationError = ref('')

// Guards against out-of-order responses when the user pages or searches quickly.
let requestSequence = 0
let facetSequence = 0

const displayedColumns = computed<ColumnMeta[]>(() =>
  selectedColumns.value
    .map((name) => visibleColumns.value.find((column) => column.name === name))
    .filter((column): column is ColumnMeta => Boolean(column)),
)
// Always request the primary key, even when the user hides it, so a row click
// can build the detail URL without a second query.
const requestColumns = computed(() => {
  const names = [...selectedColumns.value]
  const add = (name: string | undefined) => {
    if (name && !names.includes(name)) names.push(name)
  }
  const addSpec = (spec: string | DetailFieldSpec) => add(relationFieldColumn(spec))
  for (const name of table.value?.primary_key ?? []) add(name)
  // The relation column is rendered from a second query; fetch its join key
  // even though it is not displayed as a normal column.
  add(relation.value?.localColumn)
  const relationConfig = relation.value
  if (relationConfig) {
    const fallbackSpecs = [
      ...(relationConfig.fallbackTitles ?? []),
      ...(relationConfig.fallbackSubtitle ? [relationConfig.fallbackSubtitle] : []),
    ]
    for (const spec of fallbackSpecs) addSpec(spec)
  }
  // Photo-wall cards need columns that are not in the table-mode column picker.
  const gallery = galleryConfig.value
  if (gallery && viewMode.value === 'gallery') {
    for (const spec of gallery.cover ?? []) addSpec(spec)
    for (const spec of gallery.title) addSpec(spec)
    for (const spec of gallery.subtitle ?? []) addSpec(spec)
    for (const spec of gallery.badges ?? []) addSpec(spec)
    for (const item of gallery.meta ?? []) addSpec(item.spec)
  }
  if (viewMode.value === 'table') {
    for (const column of virtualColumns.value) {
      for (const spec of column.spec ?? []) addSpec(spec)
    }
  }
  add(folderSpec.value?.linkColumn)
  return names
})
const sortField = computed(() => sortSpecs.value[0]?.column ?? '')
const sortOrder = computed(() => {
  const first = sortSpecs.value[0]
  if (!first) return 0
  return first.dir === 'desc' ? -1 : 1
})
const searchPlaceholder = computed(() =>
  tableName.value === 'bangumi_collection'
    ? '搜索条目名称或短评…'
    : '搜索表格中的文本…',
)
// A just-added filter row starts empty. Keep it in the URL/UI, but do not send
// it to SQLite until it has a value; otherwise the list flashes to zero rows.
const activeFilters = computed(() =>
  filters.value.filter(
    (filter) =>
      filter.op === 'is_null' ||
      filter.op === 'not_null' ||
      (filter.value !== '' && filter.value !== null && filter.value !== undefined),
  ),
)

function readString(value: unknown): string | undefined {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : undefined
  return typeof value === 'string' ? value : undefined
}

function readNumber(value: unknown, fallback: number): number {
  const parsed = Number(readString(value))
  return Number.isFinite(parsed) ? parsed : fallback
}

function parseSort(raw: string | undefined): SortSpec[] {
  if (!raw) return []
  const [column, dir] = raw.split(':')
  if (!column || (dir !== 'asc' && dir !== 'desc')) return []
  return [{ column, dir }]
}

const KNOWN_OPERATORS = new Set([
  'eq',
  'ne',
  'gt',
  'gte',
  'lt',
  'lte',
  'like',
  'in',
  'is_null',
  'not_null',
])

/**
 * Filters travel as a JSON array in the `filters` query parameter. Invalid or
 * stale entries are dropped so an old link cannot break the whole page.
 */
function parseFilters(raw: string | undefined): FilterSpec[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is FilterSpec =>
        Boolean(item) &&
        typeof item.column === 'string' &&
        typeof item.op === 'string' &&
        KNOWN_OPERATORS.has(item.op),
    )
  } catch {
    return []
  }
}

function currentScrollElement(): HTMLElement | null {
  const selector =
    viewMode.value === 'gallery' ? '.gallery-scroll' : '.table-frame .p-datatable-table-container'
  return document.querySelector<HTMLElement>(selector)
}

let activeTable = ''
let activeQueryKey = ''

/** Remember how far this table+query was scrolled before leaving it. */
function saveScrollPosition() {
  if (!activeTable) return
  rememberTableScroll(activeTable, activeQueryKey, currentScrollElement()?.scrollTop ?? 0)
}

function restoreScrollPosition(table: string, queryKey: string) {
  const top = rememberedTableScroll(table, queryKey)
  void nextTick(() => {
    requestAnimationFrame(() => {
      const element = currentScrollElement()
      if (element) element.scrollTop = top
    })
  })
}

/**
 * Copy the URL into component state. URL is the single source of truth so the
 * browser back button and a full page refresh restore the exact same query.
 * When a sidebar link arrives without a query, restore the last state for that
 * table from sessionStorage instead of resetting to page one.
 */
function hydrate(): boolean {
  if (!table.value) return false
  const routeQuery = tableQuery(route.query)
  const hasRouteQuery = Object.keys(routeQuery).length > 0
  const remembered = rememberedTableQuery(tableName.value)
  const query = hasRouteQuery ? routeQuery : remembered
  limit.value = Math.min(200, Math.max(1, readNumber(query.limit, 50)))
  offset.value = Math.max(0, readNumber(query.offset, 0))
  search.value = readString(query.q) ?? ''
  searchDraft.value = search.value
  viewMode.value =
    layout.value === 'gallery' && readString(query.view) !== 'table' ? 'gallery' : 'table'

  const allowed = new Set(visibleColumns.value.map((column) => column.name))
  const fromUrl = (readString(query.cols) ?? '').split(',').filter(Boolean)
  selectedColumns.value = fromUrl.filter((name) => allowed.has(name))
  if (!selectedColumns.value.length) {
    selectedColumns.value = listColumnsFor(table.value)
  }
  const parsedSort = parseSort(readString(query.sort))
  const configuredSort = defaultSortFor(table.value.name)
  sortSpecs.value = parsedSort.length ? parsedSort : configuredSort ? [configuredSort] : []
  filters.value = parseFilters(readString(query.filters))
  // Facet selections live in the same filter list; don't pop the drawer open
  // every time a chip is clicked.
  if (filters.value.length && !facets.value.length) filtersOpen.value = true

  if (!hasRouteQuery && Object.keys(remembered).length) {
    // Put the restored state back into the URL without adding a history entry;
    // the watcher will run again with a normal query.
    void router.replace({
      name: 'table',
      params: { table: tableName.value },
      query: remembered,
    })
    return false
  }
  rememberTableQuery(tableName.value, query)
  return true
}

function navigate(patch: Record<string, string | undefined>) {
  saveScrollPosition()
  const query: Record<string, string> = {}
  for (const [key, value] of Object.entries(route.query)) {
    if (typeof value === 'string') query[key] = value
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === '') delete query[key]
    else query[key] = value
  }
  router.push({ name: 'table', params: { table: tableName.value }, query })
}

/** Load target rows for join-like tables with one `IN` query per page. */
async function loadRelation(sourceRows: Array<Record<string, unknown>>, sequence: number) {
  const config = relation.value
  relationRows.value = new Map()
  relationError.value = ''
  if (!config) return

  const ids = [
    ...new Set(
      sourceRows
        .map((row) => row[config.localColumn])
        .filter((value) => value !== null && value !== undefined && value !== '')
        .map((value) => String(value)),
    ),
  ]
  if (!ids.length) return

  const columns = new Set<string>([config.targetColumn])
  for (const title of config.titles) columns.add(relationFieldColumn(title))
  if (config.subtitle) columns.add(relationFieldColumn(config.subtitle))
  if (config.timeColumn) columns.add(config.timeColumn)

  try {
    const response = await api.queryTable(config.table, {
      columns: [...columns],
      filters: [{ column: config.targetColumn, op: 'in', value: ids }],
      limit: Math.min(200, ids.length),
    })
    if (sequence !== requestSequence) return
    relationRows.value = new Map(
      response.rows.map((row) => [String(row[config.targetColumn]), row]),
    )
  } catch {
    if (sequence !== requestSequence) return
    relationError.value = '关联内容加载失败'
  }
}

function relationTarget(row: Record<string, unknown>): Record<string, unknown> | undefined {
  const config = relation.value
  if (!config) return undefined
  return relationRows.value.get(String(row[config.localColumn]))
}

function relationView(row: Record<string, unknown>) {
  const config = relation.value
  if (!config) return { title: '', meta: '', hasTarget: false }
  const targetTable = schema.value?.tables.find((item) => item.name === config.table)
  return relationDisplay(
    config,
    row,
    relationTarget(row),
    targetTable,
    Boolean(relationError.value),
  )
}

function relationTitle(row: Record<string, unknown>): string {
  return relationView(row).title
}

function relationMeta(row: Record<string, unknown>): string {
  return relationView(row).meta
}

/** Enrich the current page with Bilibili favorite folders in two batch queries. */
async function loadFolders(sourceRows: Array<Record<string, unknown>>, sequence: number) {
  const spec = folderSpec.value
  folders.value = new Map()
  if (!spec) return
  const keys = [
    ...new Set(
      sourceRows
        .map((row) => row[spec.linkColumn])
        .filter((value) => value !== null && value !== undefined && value !== '')
        .map((value) => String(value)),
    ),
  ]
  if (!keys.length) return
  const linkTable = schema.value?.tables.find((item) => item.name === spec.linkTable)
  try {
    const linkColumns = [
      ...new Set([
        spec.linkTargetColumn,
        spec.linkKeyColumn,
        ...(spec.linkTimeColumn ? [spec.linkTimeColumn] : []),
      ]),
    ]
    const linkResponse = await api.queryTable(spec.linkTable, {
      columns: linkColumns,
      filters: [{ column: spec.linkTargetColumn, op: 'in', value: keys }],
      limit: 200,
    })
    if (sequence !== requestSequence) return
    const folderKeys = [
      ...new Set(
        linkResponse.rows
          .map((row) => row[spec.linkKeyColumn])
          .filter((value) => value !== null && value !== undefined && value !== '')
          .map((value) => String(value)),
      ),
    ]
    if (!folderKeys.length) return
    const folderColumns = [
      ...new Set([
        spec.folderKeyColumn,
        ...spec.folderTitle.map((spec) => relationFieldColumn(spec)),
      ]),
    ]
    const folderResponse = await api.queryTable(spec.folderTable, {
      columns: folderColumns,
      filters: [{ column: spec.folderKeyColumn, op: 'in', value: folderKeys }],
      limit: 200,
    })
    if (sequence !== requestSequence) return
    folders.value = foldersBySourceKey(
      spec,
      linkResponse.rows,
      folderResponse.rows,
      linkTable,
    )
  } catch {
    if (sequence === requestSequence) folders.value = new Map()
  }
}

/** Facet counts include the other facet and the search term. */
async function loadFacetCounts() {
  const configs = facets.value
  const current = table.value
  if (!configs.length || !current?.primary_key.length) {
    facetCounts.value = new Map()
    return
  }
  const sequence = ++facetSequence
  const baseFilters = activeFilters.value
  const jobs: Array<Promise<{ column: string; key: string; total: number }>> = []
  for (const facet of configs) {
    const other = baseFilters.filter((filter) => filter.column !== facet.column)
    for (const option of [{ value: '', label: '全部' }, ...facet.options]) {
      const filters =
        option.value === ''
          ? other
          : [...other, { column: facet.column, op: 'eq', value: option.value }]
      jobs.push(
        api
          .queryTable(tableName.value, {
            columns: current.primary_key,
            filters,
            search: search.value || undefined,
            search_columns: search.value ? searchColumnsFor(tableName.value) : undefined,
            limit: 1,
          })
          .then((response) => ({
            column: facet.column,
            key: String(option.value),
            total: response.total,
          })),
      )
    }
  }
  const results = await Promise.allSettled(jobs)
  if (sequence !== facetSequence) return
  const next = new Map<string, Map<string, number>>()
  for (const result of results) {
    if (result.status !== 'fulfilled') continue
    const { column, key, total } = result.value
    const bucket = next.get(column) ?? new Map<string, number>()
    bucket.set(key, total)
    next.set(column, bucket)
  }
  facetCounts.value = next
}

function selectFacet(column: string, value: string | number | null) {
  const next = filters.value.filter((item) => item.column !== column)
  if (value !== null) next.push({ column, op: 'eq', value })
  changeFilters(next)
}

function setView(mode: 'gallery' | 'table') {
  navigate({ view: mode === 'gallery' ? undefined : 'table' })
}

function virtualValue(column: VirtualColumn, row: Record<string, unknown>): string {
  const value = firstDetailValue(row, column.spec)
  return value === undefined || value === null || value === '' ? '—' : String(value)
}

function folderEntries(row: Record<string, unknown>): FolderEntry[] {
  const spec = folderSpec.value
  if (!spec) return []
  const key = row[spec.linkColumn]
  if (key === null || key === undefined) return []
  return folders.value.get(String(key)) ?? []
}

function primaryKeyOf(row: Record<string, unknown>): Record<string, unknown> | null {
  const meta = table.value
  if (!meta) return null
  const pk: Record<string, unknown> = {}
  for (const name of meta.primary_key) {
    const value = row[name]
    if (value === undefined) return null
    pk[name] = value
  }
  return pk
}

async function load() {
  if (!table.value || !selectedColumns.value.length) return
  const sequence = ++requestSequence
  loading.value = true
  loadError.value = ''
  try {
    const request = {
      columns: requestColumns.value,
      filters: activeFilters.value,
      search: search.value || undefined,
      search_columns: search.value ? searchColumnsFor(tableName.value) : undefined,
      sort: sortSpecs.value,
      limit: limit.value,
      offset: offset.value,
    }
    const response = await api.queryTable(tableName.value, request)
    if (sequence !== requestSequence) return
    rows.value = response.rows
    total.value = response.total
    loaded.value = true
    // A detail page needs the visible page and its query for prev/next; keep
    // only primary keys so the session entry stays small.
    rememberDetailPage(tableName.value, {
      request,
      total: response.total,
      pks: response.rows
        .map(primaryKeyOf)
        .filter((pk): pk is Record<string, unknown> => Boolean(pk)),
    })
    void loadRelation(response.rows, sequence)
    void loadFolders(response.rows, sequence)
    void loadFacetCounts()
  } catch (caught) {
    if (sequence !== requestSequence) return
    rows.value = []
    total.value = 0
    loaded.value = true
    relationRows.value = new Map()
    folders.value = new Map()
    facetCounts.value = new Map()
    loadError.value = caught instanceof ApiError ? caught.message : String(caught)
  } finally {
    if (sequence === requestSequence) loading.value = false
  }
}

watch(
  () => [table.value, route.query] as const,
  async () => {
    const previousTable = activeTable
    saveScrollPosition()
    if (!hydrate()) return
    // Switching platforms must not show the previous table's rows under the
    // new headers while the request is in flight.
    if (previousTable && previousTable !== tableName.value) {
      rows.value = []
      total.value = 0
      loaded.value = false
      relationRows.value = new Map()
      folders.value = new Map()
      facetCounts.value = new Map()
      loadError.value = ''
    }
    activeTable = tableName.value
    activeQueryKey = tableQueryKey(route.query)
    await load()
    if (activeTable === tableName.value) {
      restoreScrollPosition(activeTable, activeQueryKey)
    }
  },
  { immediate: true, deep: true },
)

onBeforeUnmount(saveScrollPosition)
// Vue Router runs this before the old view is detached, so the DataTable scroll
// container is still readable here.
onBeforeRouteLeave(saveScrollPosition)

function submitSearch() {
  navigate({ q: searchDraft.value.trim() || undefined, offset: undefined })
}

function clearSearch() {
  searchDraft.value = ''
  navigate({ q: undefined, offset: undefined })
}

function changeColumns(value: unknown) {
  const selected = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
  // An empty selection would make the backend reject the request; keep the
  // current columns instead of navigating to an invalid state.
  if (!selected.length) return
  navigate({ cols: selected.join(','), offset: undefined })
}

function changeFilters(next: FilterSpec[]) {
  // Empty filters are removed from the URL so the default view stays clean.
  navigate({
    filters: next.length ? JSON.stringify(next) : undefined,
    offset: undefined,
  })
}

function changePage(event: { first: number; rows: number }) {
  navigate({ offset: String(event.first), limit: String(event.rows) })
}

function changeSort(event: DataTableSortEvent) {
  const field = Array.isArray(event.sortField) ? event.sortField[0] : event.sortField
  if (!field || !event.sortOrder) {
    navigate({ sort: undefined, offset: undefined })
    return
  }
  navigate({
    sort: `${String(field)}:${event.sortOrder === -1 ? 'desc' : 'asc'}`,
    offset: undefined,
  })
}

function openRowData(data: Record<string, unknown>) {
  if (!table.value) return
  saveScrollPosition()
  const pk: Record<string, unknown> = {}
  for (const name of table.value.primary_key) {
    const value = data[name]
    if (value === undefined) return
    pk[name] = value
  }
  router.push({
    name: 'detail',
    params: { table: tableName.value, pk: encodePk(pk) },
  })
}

function openRow(event: DataTableRowClickEvent) {
  if (event.data) openRowData(event.data)
}
</script>

<template>
  <section class="table-view">
    <p v-if="schemaError" class="error">无法读取数据目录：{{ schemaError }}</p>
    <p v-else-if="!schema" class="muted">正在读取数据目录…</p>
    <p v-else-if="!table" class="error">未知表：{{ tableName }}</p>

    <template v-else>
      <header class="view-header">
        <p class="breadcrumb">
          <RouterLink to="/">总览</RouterLink>
          <span>/</span>
          <span>{{ platformLabel(table.platform) }}</span>
        </p>
        <div class="title-row">
          <div class="title-main">
            <span
              class="platform-mark sm"
              :style="{ background: platform?.color }"
            >
              <span
                v-if="platform && platformIcon(platform.key)"
                class="mask-icon"
                aria-hidden="true"
                :style="platformIconStyle(platform.key)"
              />
              <template v-else>{{ platform?.mark }}</template>
            </span>
            <div>
              <h1>{{ tableLabel(table.name) }}</h1>
              <p class="description">{{ tableDescription(table.name) }}</p>
            </div>
          </div>
          <span class="count-pill">
            <template v-if="loaded">{{ formatNumber(total) }} {{ tableCountUnit(table.name) }}</template>
            <template v-else>…</template>
          </span>
        </div>
      </header>

      <FacetBar
        v-if="facets.length"
        :facets="facets"
        :filters="filters"
        :counts="facetCounts"
        @select="selectFacet"
      />

      <div class="toolbar-panel">
        <form class="toolbar" @submit.prevent="submitSearch">
          <InputText
            v-model="searchDraft"
            :placeholder="searchPlaceholder"
            size="small"
            class="search-input"
            aria-label="搜索"
          />
          <Button type="submit" label="搜索" size="small" />
          <Button
            v-if="search"
            type="button"
            label="清空搜索"
            size="small"
            severity="secondary"
            text
            @click="clearSearch"
          />
          <span v-if="layout === 'gallery'" class="view-toggle" role="group" aria-label="列表形态">
            <Button
              type="button"
              label="照片墙"
              size="small"
              :severity="viewMode === 'gallery' ? 'primary' : 'secondary'"
              :outlined="viewMode !== 'gallery'"
              @click="setView('gallery')"
            />
            <Button
              type="button"
              label="表格"
              size="small"
              :severity="viewMode === 'table' ? 'primary' : 'secondary'"
              :outlined="viewMode !== 'table'"
              @click="setView('table')"
            />
          </span>
          <span class="toolbar-spacer" />
          <Button
            type="button"
            :label="filtersOpen ? '收起筛选' : `筛选${filters.length ? ` (${filters.length})` : ''}`"
            size="small"
            severity="secondary"
            outlined
            @click="filtersOpen = !filtersOpen"
          />
          <MultiSelect
            v-if="viewMode === 'table' && visibleColumns.length > 2"
            :model-value="selectedColumns"
            :options="columnOptions"
            option-label="label"
            option-value="value"
            selected-items-label="{0} 列已选"
            placeholder="显示列"
            :max-selected-labels="2"
            display="chip"
            size="small"
            aria-label="显示列"
            @update:model-value="changeColumns"
          />
        </form>
      </div>

      <FilterBar
        v-if="filtersOpen"
        :table="table.name"
        :columns="visibleColumns"
        :filters="filters"
        @update:filters="changeFilters"
      />

      <p v-if="loadError" class="error">查询失败：{{ loadError }}</p>

      <div v-if="viewMode === 'gallery' && galleryConfig" class="gallery-frame">
        <div class="gallery-scroll">
          <p v-if="loading && !loaded" class="muted">正在加载…</p>
          <GalleryGrid
            v-else
            :table="table"
            :rows="rows"
            :config="galleryConfig"
            :folders="folders"
            :folder-spec="folderSpec"
            @open="openRowData"
          />
          <p v-if="loaded && !rows.length" class="empty-message">没有匹配的记录。</p>
        </div>
        <Paginator
          class="gallery-paginator"
          :first="offset"
          :rows="limit"
          :total-records="total"
          :rows-per-page-options="[25, 50, 100, 200]"
          @page="changePage"
        />
      </div>

      <div v-else class="table-frame">
        <DataTable
          :value="rows"
          :lazy="true"
          :paginator="true"
          :rows="limit"
          :first="offset"
          :total-records="total"
          :rows-per-page-options="[25, 50, 100, 200]"
          :sort-field="sortField"
          :sort-order="sortOrder"
          size="small"
          scrollable
          scroll-height="flex"
          @page="changePage"
          @sort="changeSort"
          @row-click="openRow"
        >
          <Column v-if="relation" :header="relation.label" :sortable="false">
            <template #body="{ data }">
              <div class="relation-cell">
                <span class="relation-title" :title="relationTitle(data)">
                  {{ relationTitle(data) }}
                </span>
                <span v-if="relationMeta(data)" class="relation-meta">
                  {{ relationMeta(data) }}
                </span>
              </div>
            </template>
          </Column>
          <Column
            v-for="column in leadingVirtualColumns"
            :key="column.name"
            :header="column.label"
            :sortable="false"
          >
            <template #body="{ data }">
              <span class="virtual-text" :title="virtualValue(column, data)">
                {{ virtualValue(column, data) }}
              </span>
            </template>
          </Column>
          <Column
            v-for="column in displayedColumns"
            :key="column.name"
            :field="column.name"
            :sortable="!column.json"
          >
            <template #header>
              <span :title="column.name">{{ columnLabel(table.name, column.name) }}</span>
            </template>
            <template #body="{ data }">
              <CellValue :table="table.name" :column="column" :value="data[column.name]" />
            </template>
          </Column>
          <Column
            v-for="column in trailingVirtualColumns"
            :key="column.name"
            :header="column.label"
            :sortable="false"
          >
            <template #body="{ data }">
              <div v-if="folderEntries(data).length" class="folder-cell">
                <span
                  v-for="entry in folderEntries(data)"
                  :key="`${entry.folder}-${entry.time}`"
                  class="folder-entry"
                >
                  {{ entry.folder }}<em v-if="entry.time"> · {{ entry.time }}</em>
                </span>
              </div>
              <span v-else class="muted">—</span>
            </template>
          </Column>
          <template #empty>
            <p v-if="loading" class="empty-message">正在加载…</p>
            <p v-else-if="!loadError" class="empty-message">没有匹配的记录。</p>
          </template>
        </DataTable>
      </div>
    </template>
  </section>
</template>

<style scoped>
.table-view {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.view-header {
  flex: none;
  margin-bottom: 14px;
}

.breadcrumb {
  display: flex;
  gap: 7px;
  margin: 0 0 7px;
  color: var(--muted-light);
  font-size: 12px;
}

.breadcrumb a {
  color: var(--muted);
  text-decoration: none;
}

.breadcrumb a:hover {
  color: var(--primary);
}

.title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.title-main {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  min-width: 0;
}

.title-main h1 {
  margin-bottom: 3px;
}

.description {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
}

.count-pill {
  flex: none;
  margin-top: 4px;
  padding: 6px 11px;
  border: 1px solid var(--primary-border);
  border-radius: 999px;
  background: var(--primary-soft);
  color: var(--primary-text);
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.toolbar-panel {
  flex: none;
  margin-bottom: 10px;
  padding: 9px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.search-input {
  width: min(320px, 100%);
}

.toolbar-spacer {
  flex: 1;
}

.view-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.gallery-frame {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
  overflow: hidden;
}

.gallery-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 4px 12px 0;
}

.gallery-paginator {
  flex: none;
  border-top: 1px solid var(--border-soft);
  padding: 4px 8px;
}

.virtual-text {
  display: inline-block;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
  color: var(--text);
}

.folder-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 160px;
}

.folder-entry {
  color: var(--text-tertiary);
  font-size: 12px;
  white-space: nowrap;
}

.folder-entry em {
  color: var(--muted-light);
  font-style: normal;
}

.relation-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-width: 460px;
  min-width: 220px;
}

.relation-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text);
}

.relation-meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--muted-light);
  font-size: 11px;
}

.table-frame {
  flex: 1;
  min-height: 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
  padding: 2px 10px 0;
  overflow: hidden;
}

.table-frame :deep(.p-datatable) {
  height: 100%;
}

.table-frame :deep(.p-datatable-table-container) {
  min-height: 0;
}

.empty-message {
  padding: 22px;
  color: var(--muted-light);
  text-align: center;
}

:deep(tbody tr) {
  cursor: pointer;
}

@media (max-width: 760px) {
  .table-view {
    height: auto;
    min-height: 60vh;
  }

  .table-frame {
    min-height: 60vh;
  }

  .title-row {
    flex-direction: column;
    gap: 8px;
  }
}
</style>
