<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import Column from 'openvue/column'
import DataTable from 'openvue/datatable'
import type { DataTablePageEvent, DataTableRowClickEvent } from 'openvue/datatable'
import Tag from 'openvue/tag'

import { ApiError, api } from '@/api/client'
import type { ResponseSummary, RunDetailResponse } from '@/api/types'
import { operationLabel, statusLabel, statusSeverity } from '@/config/columns'
import { platformLabel } from '@/config/platforms'
import { formatTime } from '@/utils/time'

const route = useRoute()
const router = useRouter()

const runId = computed(() => Number(route.params.id))
const detail = ref<RunDetailResponse | null>(null)
const responses = ref<ResponseSummary[]>([])
const total = ref(0)
const limit = ref(50)
const offset = ref(0)
const loading = ref(false)
const loadError = ref('')
let responseSequence = 0

function readString(value: unknown): string | undefined {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : undefined
  return typeof value === 'string' ? value : undefined
}

function readNumber(value: unknown, fallback: number): number {
  const parsed = Number(readString(value))
  return Number.isFinite(parsed) ? parsed : fallback
}

function hydrate() {
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
  router.push({ name: 'raw-run', params: { id: String(runId.value) }, query })
}

async function loadRun() {
  if (!Number.isFinite(runId.value)) return
  try {
    detail.value = await api.run(runId.value)
  } catch (caught) {
    detail.value = null
    loadError.value = caught instanceof ApiError ? caught.message : String(caught)
  }
}

async function loadResponses() {
  const sequence = ++responseSequence
  loading.value = true
  try {
    const response = await api.responses({
      run_id: runId.value,
      limit: limit.value,
      offset: offset.value,
    })
    if (sequence !== responseSequence) return
    responses.value = response.responses
    total.value = response.total
  } catch (caught) {
    if (sequence !== responseSequence) return
    responses.value = []
    total.value = 0
    loadError.value = caught instanceof ApiError ? caught.message : String(caught)
  } finally {
    if (sequence === responseSequence) loading.value = false
  }
}

watch(
  () => route.params.id,
  () => {
    loadError.value = ''
    void loadRun()
  },
  { immediate: true },
)

watch(
  () => [route.params.id, route.query] as const,
  () => {
    hydrate()
    void loadResponses()
  },
  { immediate: true, deep: true },
)

function changePage(event: DataTablePageEvent) {
  navigate({ offset: String(event.first), limit: String(event.rows) })
}

function openResponse(event: DataTableRowClickEvent) {
  router.push(`/raw/responses/${event.data.id}`)
}
</script>

<template>
  <section class="raw-run">
    <RouterLink to="/raw" class="back">← 返回同步记录</RouterLink>

    <p v-if="loadError" class="error">加载失败：{{ loadError }}</p>
    <template v-else-if="detail">
      <div class="heading">
        <h1>同步批次 #{{ detail.run.id }}</h1>
        <Tag :value="platformLabel(detail.run.platform)" severity="secondary" />
        <Tag :value="statusLabel(detail.run.status)" :severity="statusSeverity(detail.run.status)" />
      </div>
      <dl class="summary">
        <dt>操作</dt>
        <dd>{{ operationLabel(detail.run.operation) }}</dd>
        <dt>范围</dt>
        <dd>{{ detail.run.scope ?? '—' }}</dd>
        <dt>开始时间</dt>
        <dd>{{ formatTime(detail.run.started_at, 'iso') }}</dd>
        <dt>结束时间</dt>
        <dd>{{ detail.run.finished_at ? formatTime(detail.run.finished_at, 'iso') : '—' }}</dd>
        <dt>命令</dt>
        <dd>{{ detail.run.command ?? '—' }}</dd>
        <dt>错误</dt>
        <dd>{{ detail.run.error ?? '—' }}</dd>
      </dl>

      <h2>接口响应（{{ total }}）</h2>
      <div class="table-frame">
        <DataTable
          :value="responses"
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
          @row-click="openResponse"
        >
          <Column field="id" header="响应 ID" />
          <Column field="endpoint" header="接口" />
          <Column field="status_code" header="HTTP 状态" />
          <Column field="fetched_at" header="抓取时间">
            <template #body="{ data }">
              {{ formatTime(data.fetched_at, 'iso') }}
            </template>
          </Column>
          <Column field="error" header="错误" />
        </DataTable>
      </div>
    </template>
    <p v-else class="muted">正在加载…</p>
  </section>
</template>

<style scoped>
.raw-run {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.back {
  flex: none;
  display: inline-block;
  margin-bottom: 12px;
  color: var(--primary);
  text-decoration: none;
  font-size: 13px;
}

.heading {
  flex: none;
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 8px;
}

.heading h1 {
  margin: 0;
}

.summary {
  flex: none;
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 4px 16px;
  font-size: 13px;
  margin: 0 0 18px;
}

.summary dt {
  color: var(--muted);
}

.summary dd {
  margin: 0;
  overflow-wrap: anywhere;
}

h2 {
  flex: none;
  font-size: 15px;
  margin: 0 0 8px;
}

.table-frame {
  flex: 1;
  min-height: 240px;
  background: var(--surface);
  border: 1px solid var(--border);
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
  .raw-run {
    height: auto;
    min-height: 60vh;
  }

  .table-frame {
    min-height: 60vh;
  }
}
</style>
