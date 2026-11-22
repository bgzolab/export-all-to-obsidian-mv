<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import Button from 'openvue/button'
import Tag from 'openvue/tag'

import { ApiError, api } from '@/api/client'
import type { ResponseDetail } from '@/api/types'
import JsonTree from '@/components/JsonTree.vue'
import { formatTime } from '@/utils/time'

const route = useRoute()
const responseId = computed(() => String(route.params.id ?? ''))

const detail = ref<ResponseDetail | null>(null)
const loading = ref(false)
const notFound = ref(false)
const loadError = ref('')
const copied = ref(false)
const showTree = ref(true)

let requestSequence = 0
let copiedTimer: number | undefined

async function load() {
  const sequence = ++requestSequence
  loading.value = true
  notFound.value = false
  loadError.value = ''
  try {
    const response = await api.response(responseId.value)
    if (sequence !== requestSequence) return
    detail.value = response
    // Very large JSON documents are expensive to turn into tree nodes; show
    // text by default and let the user opt in.
    showTree.value = response.content_type === 'json' && response.body_size <= 512 * 1024
  } catch (caught) {
    if (sequence !== requestSequence) return
    detail.value = null
    if (caught instanceof ApiError && caught.status === 404) notFound.value = true
    else loadError.value = caught instanceof ApiError ? caught.message : String(caught)
  } finally {
    if (sequence === requestSequence) loading.value = false
  }
}

watch(() => route.params.id, load, { immediate: true })

const serializedBody = computed(() => {
  if (!detail.value || detail.value.body === null) return ''
  if (typeof detail.value.body === 'string') return detail.value.body
  return JSON.stringify(detail.value.body, null, 2)
})

const requestText = computed(() => {
  if (!detail.value) return ''
  const request = detail.value.request
  if (request === null || request === undefined) return ''
  return typeof request === 'string' ? request : JSON.stringify(request, null, 2)
})

const canToggleTree = computed(
  () => detail.value?.content_type === 'json' && detail.value.body_size > 512 * 1024,
)

const CONTENT_TYPE_LABELS: Record<string, string> = {
  json: 'JSON',
  text: '文本',
  empty: '空',
}

function contentTypeLabel(value: string): string {
  return CONTENT_TYPE_LABELS[value] ?? value
}

async function copyBody() {
  if (!serializedBody.value) return
  await navigator.clipboard.writeText(serializedBody.value)
  copied.value = true
  if (copiedTimer) window.clearTimeout(copiedTimer)
  copiedTimer = window.setTimeout(() => {
    copied.value = false
  }, 1500)
}

function downloadBody() {
  if (!detail.value || !serializedBody.value) return
  const isJson = detail.value.content_type === 'json'
  const blob = new Blob([serializedBody.value], {
    type: isJson ? 'application/json' : 'text/plain;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `response-${detail.value.id}.${isJson ? 'json' : 'txt'}`
  anchor.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <section class="raw-response">
    <RouterLink to="/raw" class="back">← 返回同步记录</RouterLink>

    <p v-if="loading" class="muted">正在加载响应…</p>
    <p v-else-if="notFound" class="error">响应不存在。</p>
    <p v-else-if="loadError" class="error">加载失败：{{ loadError }}</p>

    <template v-else-if="detail">
      <div class="heading">
        <h1>响应 #{{ detail.id }}</h1>
        <Tag :value="contentTypeLabel(detail.content_type)" severity="secondary" />
        <Tag v-if="detail.status_code" :value="String(detail.status_code)" severity="info" />
      </div>

      <dl class="meta">
        <dt>同步批次</dt>
        <dd><RouterLink :to="`/raw/runs/${detail.run_id}`">#{{ detail.run_id }}</RouterLink></dd>
        <dt>接口</dt>
        <dd>{{ detail.endpoint }}</dd>
        <dt>抓取时间</dt>
        <dd>{{ formatTime(detail.fetched_at, 'iso') }}</dd>
        <dt>响应体大小</dt>
        <dd>{{ detail.body_size }} 字节</dd>
        <dt>校验值</dt>
        <dd>{{ detail.sha256 ?? '—' }}</dd>
        <dt>错误</dt>
        <dd>{{ detail.error ?? '—' }}</dd>
      </dl>

      <p v-if="detail.body_truncated" class="warning">
        响应体超过 2MB，仅显示前 2MB；复制与下载内容同样为截断结果。
      </p>

      <div class="toolbar">
        <Button
          type="button"
          :label="copied ? '已复制' : '复制内容'"
          size="small"
          :disabled="!serializedBody"
          @click="copyBody"
        />
        <Button
          type="button"
          label="下载"
          size="small"
          severity="secondary"
          :disabled="!serializedBody"
          @click="downloadBody"
        />
        <Button
          v-if="canToggleTree"
          type="button"
          :label="showTree ? '查看原始文本' : '查看 JSON 树'"
          size="small"
          text
          @click="showTree = !showTree"
        />
      </div>

      <p v-if="detail.content_type === 'empty'" class="muted">该响应没有 body（多为传输错误）。</p>

      <template v-else>
        <JsonTree
          v-if="detail.content_type === 'json' && showTree"
          :value="detail.body"
          class="body-tree"
        />
        <pre v-else class="body-text">{{ serializedBody }}</pre>
      </template>

      <details v-if="requestText" class="request">
        <summary>请求参数</summary>
        <pre>{{ requestText }}</pre>
      </details>
    </template>
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

.meta {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 4px 16px;
  font-size: 13px;
  margin: 0 0 14px;
}

.meta dt {
  color: #6b7280;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.meta dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.warning {
  padding: 8px 10px;
  background: #fef3c7;
  border: 1px solid #f59e0b;
  border-radius: 4px;
  color: #92400e;
  font-size: 13px;
}

.toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}

.body-tree {
  max-height: 70vh;
  overflow: auto;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  padding: 8px;
  background: #ffffff;
}

.body-text {
  max-height: 70vh;
  overflow: auto;
  margin: 0;
  padding: 10px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  font-size: 12px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.request {
  margin-top: 14px;
  font-size: 13px;
}

.request summary {
  cursor: pointer;
  color: #3730a3;
}

.request pre {
  max-height: 240px;
  overflow: auto;
  padding: 8px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  font-size: 12px;
}
</style>
