<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Column from 'openvue/column'
import DataTable from 'openvue/datatable'
import type { DataTablePageEvent, DataTableRowClickEvent } from 'openvue/datatable'
import Select from 'openvue/select'
import Tag from 'openvue/tag'

import { ApiError, api } from '@/api/client'
import type { RunSummary } from '@/api/types'
import { useSchema } from '@/composables/useSchema'
import { operationLabel, statusLabel, statusSeverity } from '@/config/columns'
import { platformLabel } from '@/config/platforms'
import { formatTime } from '@/utils/time'

const route = useRoute()
const router = useRouter()
const { schema } = useSchema()

const STATUS_OPTIONS = ['success', 'partial', 'failed', 'running']

const platform = ref('')
const status = ref('')
const limit = ref(50)
const offset = ref(0)
const runs = ref<RunSummary[]>([])
const total = ref(0)
const loading = ref(false)
const loadError = ref('')
let requestSequence = 0

const platformOptions = computed(() => [
  { label: '全部平台', value: '' },
  ...[...new Set(Object.keys(schema.value?.platforms ?? {}))]
    .filter((name) => name !== 'raw')
    .sort()
    .map((name) => ({ label: platformLabel(name), value: name })),
])
const statusOptions = computed(() => [
  { label: '全部状态', value: '' },
  ...STATUS_OPTIONS.map((name) => ({ label: statusLabel(name), value: name })),
])

function readString(value: unknown): string | undefined {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : undefined
  return typeof value === 'string' ? value : undefined
}

function readNumber(value: unknown, fallback: number): number {
  const parsed = Number(readString(value))
  return Number.isFinite(parsed) ? parsed : fallback
}

function hydrate() {
  platform.value = readString(route.query.platform) ?? ''
  status.value = readString(route.query.status) ?? ''
  limit.value = Math.min(200, Math.max(1, readNumber(route.query.limit, 50)))
  offset.value = Math.max(0, readNumber(route.query.offset, 0))
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
  router.push({ name: 'raw-runs', query })
}

async function load() {
  const sequence = ++requestSequence
  loading.value = true
  loadError.value = ''
  try {
    const response = await api.runs({
      platform: platform.value || undefined,
      status: status.value || undefined,
      limit: limit.value,
      offset: offset.value,
    })
    if (sequence !== requestSequence) return
    runs.value = response.runs
    total.value = response.total
  } catch (caught) {
    if (sequence !== requestSequence) return
    runs.value = []
    total.value = 0
    loadError.value = caught instanceof ApiError ? caught.message : String(caught)
  } finally {
    if (sequence === requestSequence) loading.value = false
  }
}

watch(
  () => route.query,
  () => {
    hydrate()
    void load()
  },
  { immediate: true, deep: true },
)

function changeFilter(key: 'platform' | 'status', value: unknown) {
  navigate({ [key]: value ? String(value) : undefined, offset: undefined })
}

function changePage(event: DataTablePageEvent) {
  navigate({ offset: String(event.first), limit: String(event.rows) })
}

function openRun(event: DataTableRowClickEvent) {
  router.push(`/raw/runs/${event.data.id}`)
}
</script>

<template>
  <section class="raw-runs">
    <div class="heading">
      <div>
        <h1>同步记录</h1>
        <p class="muted">每次 eto 同步的执行记录；点开一行可以查看原始接口响应。</p>
      </div>
      <span class="count-pill">{{ total }} 次</span>
    </div>

    <div class="filters">
      <Select
        :model-value="platform"
        :options="platformOptions"
        option-label="label"
        option-value="value"
        placeholder="全部平台"
        size="small"
        aria-label="平台过滤"
        @update:model-value="changeFilter('platform', $event)"
      />
      <Select
        :model-value="status"
        :options="statusOptions"
        option-label="label"
        option-value="value"
        placeholder="全部状态"
        size="small"
        aria-label="状态过滤"
        @update:model-value="changeFilter('status', $event)"
      />
    </div>

    <p v-if="loadError" class="error">加载失败：{{ loadError }}</p>

    <div class="table-frame">
      <DataTable
        :value="runs"
        :lazy="true"
        :paginator="true"
        :rows="limit"
        :first="offset"
        :total-records="total"
        :rows-per-page-options="[25, 50, 100]"
        :loading="loading"
        size="small"
        scrollable
        scroll-height="flex"
        @page="changePage"
        @row-click="openRun"
      >
        <Column field="id" header="批次" />
        <Column field="platform" header="平台">
          <template #body="{ data }">{{ platformLabel(data.platform) }}</template>
        </Column>
        <Column field="operation" header="操作">
          <template #body="{ data }">{{ operationLabel(data.operation) }}</template>
        </Column>
        <Column field="status" header="状态">
          <template #body="{ data }">
            <Tag :value="statusLabel(data.status)" :severity="statusSeverity(data.status)" />
          </template>
        </Column>
        <Column field="started_at" header="开始时间">
          <template #body="{ data }">{{ formatTime(data.started_at, 'iso') }}</template>
        </Column>
        <Column field="finished_at" header="结束时间">
          <template #body="{ data }">
            {{ data.finished_at ? formatTime(data.finished_at, 'iso') : '—' }}
          </template>
        </Column>
      </DataTable>
    </div>
  </section>
</template>

<style scoped>
.raw-runs {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.heading {
  flex: none;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.heading h1 {
  margin: 0;
}

.heading p {
  margin: 3px 0 0;
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
}

.filters {
  flex: none;
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
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

:deep(tbody tr) {
  cursor: pointer;
}

@media (max-width: 760px) {
  .raw-runs {
    height: auto;
    min-height: 60vh;
  }

  .table-frame {
    min-height: 60vh;
  }
}
</style>
