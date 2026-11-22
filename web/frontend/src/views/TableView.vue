<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import Button from 'openvue/button'
import Column from 'openvue/column'
import DataTable from 'openvue/datatable'
import type {
  DataTablePageEvent,
  DataTableRowClickEvent,
  DataTableSortEvent,
} from 'openvue/datatable'
import InputText from 'openvue/inputtext'
import MultiSelect from 'openvue/multiselect'

import { ApiError, api } from '@/api/client'
import type { ColumnMeta, FilterSpec, SortSpec, TableMeta } from '@/api/types'
import CellValue from '@/components/CellValue.vue'
import FilterBar from '@/components/FilterBar.vue'
import { useSchema } from '@/composables/useSchema'
import { columnLabel } from '@/config/columns'
import { platformConfigForTable, platformLabel } from '@/config/platforms'
import {
  defaultSortFor,
  hiddenColumnsFor,
  listColumnsFor,
  tableCountUnit,
  tableDescription,
  tableLabel,
} from '@/config/tables'
import { formatNumber } from '@/utils/format'
import { encodePk } from '@/utils/pk'

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

const siblings = computed(() => {
  if (!table.value) return []
  return (schema.value?.tables ?? []).filter((item) => item.platform === table.value?.platform)
})

const visibleColumns = computed<ColumnMeta[]>(() => {
  const hidden = hiddenColumnsFor(tableName.value)
  return table.value?.columns.filter((column) => !column.hidden && !hidden.has(column.name)) ?? []
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

// Guards against out-of-order responses when the user pages or searches quickly.
let requestSequence = 0

const displayedColumns = computed<ColumnMeta[]>(() =>
  selectedColumns.value
    .map((name) => visibleColumns.value.find((column) => column.name === name))
    .filter((column): column is ColumnMeta => Boolean(column)),
)
// Always request the primary key, even when the user hides it, so a row click
// can build the detail URL without a second query.
const requestColumns = computed(() => {
  const names = [...selectedColumns.value]
  for (const name of table.value?.primary_key ?? []) {
    if (!names.includes(name)) names.push(name)
  }
  return names
})
const sortField = computed(() => sortSpecs.value[0]?.column ?? '')
const sortOrder = computed(() => {
  const first = sortSpecs.value[0]
  if (!first) return 0
  return first.dir === 'desc' ? -1 : 1
})
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

/**
 * Copy the URL into component state. URL is the single source of truth so the
 * browser back button and a full page refresh restore the exact same query.
 */
function hydrate() {
  if (!table.value) return
  const query = route.query
  limit.value = Math.min(200, Math.max(1, readNumber(query.limit, 50)))
  offset.value = Math.max(0, readNumber(query.offset, 0))
  search.value = readString(query.q) ?? ''
  searchDraft.value = search.value

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
  if (filters.value.length) filtersOpen.value = true
}

function navigate(patch: Record<string, string | undefined>) {
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

async function load() {
  if (!table.value || !selectedColumns.value.length) return
  const sequence = ++requestSequence
  loading.value = true
  loadError.value = ''
  try {
    const response = await api.queryTable(tableName.value, {
      columns: requestColumns.value,
      filters: activeFilters.value,
      search: search.value || undefined,
      sort: sortSpecs.value,
      limit: limit.value,
      offset: offset.value,
    })
    if (sequence !== requestSequence) return
    rows.value = response.rows
    total.value = response.total
    loaded.value = true
  } catch (caught) {
    if (sequence !== requestSequence) return
    rows.value = []
    total.value = 0
    loaded.value = true
    loadError.value = caught instanceof ApiError ? caught.message : String(caught)
  } finally {
    if (sequence === requestSequence) loading.value = false
  }
}

watch(
  () => [table.value, route.query] as const,
  () => {
    hydrate()
    void load()
  },
  { immediate: true, deep: true },
)

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

function changePage(event: DataTablePageEvent) {
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

function openRow(event: DataTableRowClickEvent) {
  if (!table.value) return
  const pk: Record<string, unknown> = {}
  for (const name of table.value.primary_key) {
    const value = event.data?.[name]
    if (value === undefined) return
    pk[name] = value
  }
  router.push({
    name: 'detail',
    params: { table: tableName.value, pk: encodePk(pk) },
  })
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
          <div>
            <h1>{{ tableLabel(table.name) }}</h1>
            <p class="description">{{ tableDescription(table.name) }}</p>
          </div>
          <span class="count-pill">
            <template v-if="loaded">{{ formatNumber(total) }} {{ tableCountUnit(table.name) }}</template>
            <template v-else>…</template>
          </span>
        </div>
        <nav v-if="siblings.length > 1" class="table-tabs" aria-label="同平台数据表">
          <RouterLink
            v-for="sibling in siblings"
            :key="sibling.name"
            :to="`/t/${sibling.name}`"
            :class="{ active: sibling.name === table.name }"
          >
            {{ tableLabel(sibling.name) }}
          </RouterLink>
        </nav>
      </header>

      <form class="toolbar" @submit.prevent="submitSearch">
        <InputText
          v-model="searchDraft"
          placeholder="搜索标题或正文…"
          size="small"
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

      <FilterBar
        v-if="filtersOpen"
        :table="table.name"
        :columns="visibleColumns"
        :filters="filters"
        @update:filters="changeFilters"
      />

      <p v-if="loadError" class="error">查询失败：{{ loadError }}</p>

      <div class="table-frame">
        <DataTable
          :value="rows"
          :lazy="true"
          :paginator="true"
          :rows="limit"
          :first="offset"
          :total-records="total"
          :rows-per-page-options="[25, 50, 100, 200]"
          :loading="loading"
          :sort-field="sortField"
          :sort-order="sortOrder"
          size="small"
          scrollable
          scroll-height="flex"
          @page="changePage"
          @sort="changeSort"
          @row-click="openRow"
        >
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
          <template #empty>
            <p class="empty-message">没有匹配的记录。</p>
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
  margin-bottom: 12px;
}

.breadcrumb {
  display: flex;
  gap: 7px;
  margin: 0 0 6px;
  color: #9ca3af;
  font-size: 12px;
}

.breadcrumb a {
  color: #6b7280;
  text-decoration: none;
}

.breadcrumb a:hover {
  color: #4338ca;
}

.title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.description {
  margin: 2px 0 0;
  color: #6b7280;
  font-size: 13px;
}

.count-pill {
  flex: none;
  padding: 5px 10px;
  border-radius: 999px;
  background: #eef2ff;
  color: #4338ca;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.table-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 12px;
}

.table-tabs a {
  padding: 4px 9px;
  border-radius: 6px;
  color: #6b7280;
  font-size: 12px;
  text-decoration: none;
}

.table-tabs a:hover {
  background: #f3f4f6;
}

.table-tabs a.active {
  background: #eef2ff;
  color: #3730a3;
  font-weight: 600;
}

.toolbar {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.toolbar-spacer {
  flex: 1;
}

.table-frame {
  flex: 1;
  min-height: 0;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 4px 10px 0;
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
  color: #9ca3af;
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
