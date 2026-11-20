<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'openvue/button'
import Column from 'openvue/column'
import DataTable from 'openvue/datatable'
import type { DataTablePageEvent, DataTableSortEvent } from 'openvue/datatable'
import InputText from 'openvue/inputtext'
import MultiSelect from 'openvue/multiselect'

import { ApiError, api } from '@/api/client'
import type { ColumnMeta, SortSpec, TableMeta } from '@/api/types'
import { useSchema } from '@/composables/useSchema'
import { defaultListColumns } from '@/config/tables'

const route = useRoute()
const router = useRouter()
const { schema, error: schemaError } = useSchema()

const tableName = computed(() => String(route.params.table ?? ''))
const table = computed<TableMeta | undefined>(() =>
  schema.value?.tables.find((item) => item.name === tableName.value),
)

const visibleColumns = computed<ColumnMeta[]>(
  () => table.value?.columns.filter((column) => !column.hidden) ?? [],
)
const columnOptions = computed(() => visibleColumns.value.map((column) => column.name))

const rows = ref<Array<Record<string, unknown>>>([])
const total = ref(0)
const limit = ref(50)
const offset = ref(0)
const search = ref('')
const searchDraft = ref('')
const selectedColumns = ref<string[]>([])
const sortSpecs = ref<SortSpec[]>([])
const loading = ref(false)
const loadError = ref('')

// Guards against out-of-order responses when the user pages or searches quickly.
let requestSequence = 0

const displayedColumns = computed<ColumnMeta[]>(() =>
  selectedColumns.value
    .map((name) => visibleColumns.value.find((column) => column.name === name))
    .filter((column): column is ColumnMeta => Boolean(column)),
)
const sortField = computed(() => sortSpecs.value[0]?.column ?? '')
const sortOrder = computed(() => {
  const first = sortSpecs.value[0]
  if (!first) return 0
  return first.dir === 'desc' ? -1 : 1
})

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
    selectedColumns.value = defaultListColumns(table.value)
  }
  sortSpecs.value = parseSort(readString(query.sort))
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
      columns: selectedColumns.value,
      search: search.value || undefined,
      sort: sortSpecs.value,
      limit: limit.value,
      offset: offset.value,
    })
    if (sequence !== requestSequence) return
    rows.value = response.rows
    total.value = response.total
  } catch (caught) {
    if (sequence !== requestSequence) return
    rows.value = []
    total.value = 0
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
  const selected = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  // An empty selection would make the backend reject the request; keep the
  // current columns instead of navigating to an invalid state.
  if (!selected.length) return
  navigate({ cols: selected.join(','), offset: undefined })
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

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
</script>

<template>
  <section class="table-view">
    <p v-if="schemaError" class="error">无法读取 schema：{{ schemaError }}</p>
    <p v-else-if="!schema" class="muted">正在读取 schema…</p>
    <p v-else-if="!table" class="error">未知表：{{ tableName }}</p>

    <template v-else>
      <div class="table-heading">
        <h1>{{ table.name }}</h1>
        <span class="muted">{{ total }} 行</span>
      </div>

      <form class="toolbar" @submit.prevent="submitSearch">
        <InputText
          v-model="searchDraft"
          placeholder="搜索文本列…"
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
        <MultiSelect
          :model-value="selectedColumns"
          :options="columnOptions"
          placeholder="选择列"
          :max-selected-labels="2"
          display="chip"
          size="small"
          aria-label="选择列"
          @update:model-value="changeColumns"
        />
      </form>

      <p v-if="loadError" class="error">查询失败：{{ loadError }}</p>

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
        @page="changePage"
        @sort="changeSort"
      >
        <Column
          v-for="column in displayedColumns"
          :key="column.name"
          :field="column.name"
          :header="column.name"
          :sortable="!column.json"
        >
          <template #body="{ data }">
            <span class="cell">{{ cellText(data[column.name]) }}</span>
          </template>
        </Column>
      </DataTable>
    </template>
  </section>
</template>

<style scoped>
.table-heading {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 10px;
}

.table-heading h1 {
  margin: 0;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.cell {
  display: inline-block;
  max-width: 420px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}
</style>
