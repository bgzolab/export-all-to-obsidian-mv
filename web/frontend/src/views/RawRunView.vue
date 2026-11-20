<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import Column from 'openvue/column'
import DataTable from 'openvue/datatable'
import type { DataTablePageEvent, DataTableRowClickEvent } from 'openvue/datatable'
import Tag from 'openvue/tag'

import { ApiError, api } from '@/api/client'
import type { ResponseSummary, RunDetailResponse } from '@/api/types'
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

function statusSeverity(value: string): string {
  if (value === 'success') return 'success'
  if (value === 'failed') return 'danger'
  if (value === 'running') return 'info'
  return 'warn'
}
</script>

<template>
  <section class="raw-run">
    <RouterLink to="/raw" class="back">← 返回 run 列表</RouterLink>

    <p v-if="loadError" class="error">加载失败：{{ loadError }}</p>
    <template v-else-if="detail">
      <div class="heading">
        <h1>run #{{ detail.run.id }}</h1>
        <Tag :value="detail.run.platform" severity="secondary" />
        <Tag :value="detail.run.status" :severity="statusSeverity(detail.run.status)" />
      </div>
      <dl class="summary">
        <dt>operation</dt>
        <dd>{{ detail.run.operation }}</dd>
        <dt>scope</dt>
        <dd>{{ detail.run.scope ?? '—' }}</dd>
        <dt>started_at</dt>
        <dd>{{ formatTime(detail.run.started_at, 'iso') }}</dd>
        <dt>finished_at</dt>
        <dd>{{ detail.run.finished_at ? formatTime(detail.run.finished_at, 'iso') : '—' }}</dd>
        <dt>command</dt>
        <dd>{{ detail.run.command ?? '—' }}</dd>
        <dt>error</dt>
        <dd>{{ detail.run.error ?? '—' }}</dd>
      </dl>

      <h2>responses（{{ total }}）</h2>
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
        @page="changePage"
        @row-click="openResponse"
      >
        <Column field="id" header="id" />
        <Column field="endpoint" header="endpoint" />
        <Column field="status_code" header="status" />
        <Column field="fetched_at" header="fetched_at">
          <template #body="{ data }">
            {{ formatTime(data.fetched_at, 'iso') }}
          </template>
        </Column>
        <Column field="error" header="error" />
      </DataTable>
    </template>
    <p v-else class="muted">正在加载…</p>
  </section>
</template>

<style scoped>
.back {
  display: inline-block;
  margin-bottom: 12px;
  color: #3730a3;
  text-decoration: none;
  font-size: 13px;
}

.heading {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 8px;
}

.heading h1 {
  margin: 0;
}

.summary {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 4px 16px;
  font-size: 13px;
  margin: 0 0 18px;
}

.summary dt {
  color: #6b7280;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.summary dd {
  margin: 0;
  overflow-wrap: anywhere;
}

h2 {
  font-size: 15px;
  margin: 0 0 8px;
}

:deep(tbody tr) {
  cursor: pointer;
}
</style>
