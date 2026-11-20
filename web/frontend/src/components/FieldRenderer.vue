<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import OpenImage from 'openvue/image'
import Tag from 'openvue/tag'

import type { ColumnMeta } from '@/api/types'
import JsonTree from './JsonTree.vue'
import { renderMarkdown, sanitizeHtml } from '@/utils/html'
import {
  asJsonValue,
  collectImageUrls,
  renderKindFor,
  timeUnitFor,
} from '@/utils/renderers'
import { formatTime } from '@/utils/time'

const props = defineProps<{
  table: string
  column: ColumnMeta
  value: unknown
}>()

const kind = computed(() => renderKindFor(props.table, props.column))

const text = computed(() => {
  const value = props.value
  if (value === null || value === undefined) return ''
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
})

const html = computed(() => (kind.value === 'html' ? sanitizeHtml(text.value) : ''))
const markdown = computed(() =>
  kind.value === 'markdown' ? renderMarkdown(text.value) : '',
)
const time = computed(() =>
  formatTime(props.value, timeUnitFor(props.table, props.column)),
)
const imageUrls = computed(() =>
  kind.value === 'images' ? collectImageUrls(asJsonValue(props.value)) : [],
)
const isExternal = computed(() => /^https?:\/\//i.test(text.value))
const isLongText = computed(() => kind.value === 'text' && text.value.length > 500)
const booleanValue = computed(() => Boolean(props.value))
</script>

<template>
  <span v-if="value === null || value === undefined" class="empty">—</span>

  <JsonTree v-else-if="kind === 'json'" :value="asJsonValue(value)" />

  <div v-else-if="kind === 'html'" class="rich" v-html="html" />
  <div v-else-if="kind === 'markdown'" class="rich markdown" v-html="markdown" />

  <OpenImage
    v-else-if="kind === 'image'"
    :src="text"
    :alt="column.name"
    preview
    class="field-image"
  />

  <div v-else-if="kind === 'images'" class="image-grid">
    <OpenImage
      v-for="url in imageUrls"
      :key="url"
      :src="url"
      :alt="column.name"
      preview
      class="field-image"
    />
    <span v-if="!imageUrls.length" class="empty">无图片</span>
  </div>

  <span v-else-if="kind === 'datetime'" :title="String(value)" class="time">
    {{ time }}
  </span>

  <Tag
    v-else-if="kind === 'boolean'"
    :value="booleanValue ? '是' : '否'"
    :severity="booleanValue ? 'success' : 'danger'"
  />

  <RouterLink
    v-else-if="kind === 'response_id'"
    :to="`/raw/responses/${text}`"
    class="response-link"
  >
    raw response #{{ text }}
  </RouterLink>

  <Tag v-else-if="kind === 'tag'" :value="text" severity="secondary" />

  <a
    v-else-if="kind === 'link' && isExternal"
    :href="text"
    target="_blank"
    rel="noopener noreferrer"
    class="external"
  >
    {{ text }}
  </a>

  <details v-else-if="isLongText" class="long-text">
    <summary>展开全文（{{ text.length }} 字符）</summary>
    <pre>{{ text }}</pre>
  </details>

  <span v-else class="text">{{ text || '—' }}</span>
</template>

<style scoped>
.empty {
  color: #9ca3af;
}

.rich {
  max-width: 900px;
  line-height: 1.6;
  font-size: 14px;
  overflow-wrap: anywhere;
}

.rich :deep(img) {
  max-width: 100%;
  height: auto;
}

.rich :deep(a) {
  color: #3730a3;
}

.field-image {
  display: inline-block;
  max-width: 220px;
  border-radius: 4px;
  overflow: hidden;
}

.image-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.time {
  font-variant-numeric: tabular-nums;
}

.response-link {
  color: #3730a3;
}

.external {
  color: #3730a3;
  overflow-wrap: anywhere;
}

.long-text summary {
  cursor: pointer;
  color: #3730a3;
  font-size: 13px;
}

.long-text pre {
  margin: 6px 0 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: inherit;
  font-size: 14px;
}

.text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
