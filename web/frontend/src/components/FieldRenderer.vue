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
import { durationUnitFor } from '@/config/columns'
import { decodeStoredText, formatDuration } from '@/utils/format'
import { formatTime } from '@/utils/time'

const props = defineProps<{
  table: string
  column: ColumnMeta
  value: unknown
  expanded?: boolean
  /** Base URL for relative links in Markdown (for example a GitHub README). */
  baseUrl?: string
}>()

const kind = computed(() => renderKindFor(props.table, props.column))

const text = computed(() => decodeStoredText(props.value))

const html = computed(() => (kind.value === 'html' ? sanitizeHtml(text.value) : ''))
const markdown = computed(() =>
  kind.value === 'markdown' ? renderMarkdown(text.value, props.baseUrl) : '',
)
const time = computed(() =>
  formatTime(props.value, timeUnitFor(props.table, props.column)),
)
const duration = computed(() => {
  const unit = durationUnitFor(props.table, props.column.name)
  return unit ? formatDuration(props.value, unit) : ''
})
const imageUrls = computed(() =>
  kind.value === 'images' ? collectImageUrls(asJsonValue(props.value)) : [],
)
const isExternal = computed(() => /^https?:\/\//i.test(text.value))
const isLongText = computed(
  () => !props.expanded && kind.value === 'text' && text.value.length > 500,
)
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

  <span v-else-if="kind === 'duration'" class="time">{{ duration }}</span>

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
  color: var(--muted-light);
}

.rich {
  color: var(--text-reading);
  font-size: 16px;
  line-height: 1.85;
  overflow-wrap: anywhere;
}

/*
 * Scraped article text often uses one long block of spans with real newlines
 * instead of <p> elements; the section rule below keeps those paragraphs apart.
 */

.rich :deep(p) {
  margin: 0 0 1.15em;
}

/* Blogger/QiReader paragraph spans sit in one <section> per paragraph. */
.rich :deep(section) {
  margin: 0 0 1.15em;
}

.rich :deep(h1),
.rich :deep(h2),
.rich :deep(h3),
.rich :deep(h4),
.rich :deep(h5),
.rich :deep(h6) {
  margin: 1.7em 0 0.65em;
  color: var(--text);
  font-weight: 650;
  line-height: 1.38;
  letter-spacing: -0.015em;
  text-wrap: balance;
}

.rich :deep(h1) {
  font-size: 1.65em;
}

.rich :deep(h2) {
  font-size: 1.42em;
}

.rich :deep(h3) {
  font-size: 1.2em;
}

.rich :deep(h4),
.rich :deep(h5),
.rich :deep(h6) {
  font-size: 1.05em;
}

.rich :deep(*:first-child) {
  margin-top: 0;
}

.rich :deep(*:last-child) {
  margin-bottom: 0;
}

.rich :deep(a) {
  color: var(--primary-text);
  text-decoration: underline;
  text-decoration-color: color-mix(in srgb, var(--primary) 38%, transparent);
  text-underline-offset: 3px;
}

.rich :deep(a:hover) {
  text-decoration-color: var(--primary);
}

.rich :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 10px;
  background: var(--surface-sunken);
}

.rich :deep(figure) {
  margin: 1.5em 0;
}

.rich :deep(figcaption) {
  margin-top: 6px;
  color: var(--muted-light);
  font-size: 12px;
  text-align: center;
}

.rich :deep(blockquote) {
  margin: 1.4em 0;
  padding: 4px 18px;
  border-left: 3px solid var(--primary-border);
  border-radius: 0 8px 8px 0;
  background: var(--surface-muted);
  color: var(--muted);
}

.rich :deep(blockquote p:last-child) {
  margin-bottom: 0;
}

.rich :deep(pre) {
  margin: 1.4em 0;
  padding: 14px 16px;
  overflow-x: auto;
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  background: var(--surface-sunken);
  font-size: 13px;
  line-height: 1.65;
}

.rich :deep(code) {
  padding: 0.12em 0.35em;
  border-radius: 4px;
  background: var(--surface-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.9em;
}

.rich :deep(pre code) {
  padding: 0;
  background: none;
  font-size: inherit;
}

.rich :deep(ul),
.rich :deep(ol) {
  margin: 0 0 1.15em;
  padding-left: 1.5em;
}

.rich :deep(li) {
  margin: 0.35em 0;
}

.rich :deep(li::marker) {
  color: var(--muted-light);
}

.rich :deep(hr) {
  margin: 2em 0;
  border: 0;
  border-top: 1px solid var(--border);
}

.rich :deep(table) {
  width: 100%;
  margin: 1.4em 0;
  border-collapse: collapse;
  font-size: 14px;
  line-height: 1.6;
}

.rich :deep(th),
.rich :deep(td) {
  padding: 7px 10px;
  border: 1px solid var(--border);
  text-align: left;
  vertical-align: top;
}

.rich :deep(th) {
  background: var(--surface-muted);
  color: var(--text-secondary);
  font-weight: 600;
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
  color: var(--primary-text);
}

.external {
  color: var(--primary-text);
  overflow-wrap: anywhere;
}

.long-text summary {
  cursor: pointer;
  color: var(--primary-text);
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
  color: var(--text-reading);
  font-size: 15px;
  line-height: 1.8;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
