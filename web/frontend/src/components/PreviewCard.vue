<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import type { TableMeta } from '@/api/types'
import { useSchema } from '@/composables/useSchema'
import {
  detailConfigFor,
  detailFieldLabel,
  detailFieldPrefix,
  detailFieldValue,
  firstDetailValue,
} from '@/config/details'
import { tableLabel } from '@/config/tables'
import { formatCellValue, formatCompact, stripHtml, truncate } from '@/utils/format'
import { encodePk } from '@/utils/pk'

const props = defineProps<{
  table: string
  row: Record<string, unknown>
}>()

const { schema } = useSchema()
const config = computed(() => detailConfigFor(props.table))
const table = computed<TableMeta | undefined>(() =>
  schema.value?.tables.find((item) => item.name === props.table),
)

const title = computed(() => {
  const value = firstDetailValue(props.row, config.value?.title)
  return value === undefined ? tableLabel(props.table) : String(value)
})

const subtitle = computed(() => {
  const parts: string[] = []
  for (const spec of config.value?.subtitle ?? []) {
    const value = detailFieldValue(props.row, spec)
    if (value === undefined || value === null || value === '') continue
    parts.push(`${detailFieldPrefix(spec)}${String(value)}`)
    if (parts.length === 2) break
  }
  return parts.join(' · ')
})

const cover = computed(() => {
  const value = detailFieldValue(props.row, config.value?.cover)
  return typeof value === 'string' && /^https?:\/\//i.test(value) ? value : ''
})
const coverFailed = ref(false)
watch(cover, () => {
  coverFailed.value = false
})

const excerpt = computed(() => {
  const firstContent = config.value?.content?.[0]
  const fallbackSpec = Array.isArray(firstContent) ? firstContent[0] : firstContent
  const spec = config.value?.previewText ?? fallbackSpec
  const value = detailFieldValue(props.row, spec)
  if (value === undefined || value === null) return ''
  const text = typeof value === 'string' ? stripHtml(value) : String(value)
  return truncate(text, 220)
})

const stats = computed(() => {
  const items: Array<{ label: string; value: string }> = []
  for (const spec of config.value?.stats ?? []) {
    const value = detailFieldValue(props.row, spec)
    if (typeof value !== 'number') continue
    items.push({ label: detailFieldLabel(props.table, spec), value: formatCompact(value) })
    if (items.length === 3) break
  }
  return items
})

const detailLink = computed(() => {
  const meta = table.value
  if (!meta?.primary_key.length) return null
  const pk: Record<string, unknown> = {}
  for (const name of meta.primary_key) {
    if (props.row[name] === undefined) return null
    pk[name] = props.row[name]
  }
  return { name: 'detail', params: { table: props.table, pk: encodePk(pk) } }
})

/** Raw metadata still gets readable labels when a preview has no config. */
const fallbackFields = computed(() =>
  Object.entries(props.row)
    .filter(([name]) => !['response_id', 'db_created_at', 'db_updated_at'].includes(name))
    .slice(0, 4)
    .map(([name, value]) => ({
      label: detailFieldLabel(props.table, name),
      value: formatCellValue(props.table, { name, type: '', json: false }, value),
    })),
)
</script>

<template>
  <article class="preview-card">
    <div v-if="cover && !coverFailed" class="preview-cover">
      <img
        :src="cover"
        :alt="title"
        referrerpolicy="no-referrer"
        @error="coverFailed = true"
      />
    </div>
    <div class="preview-body">
      <p class="preview-kicker">{{ tableLabel(props.table) }}</p>
      <h3>{{ title }}</h3>
      <p v-if="subtitle" class="preview-subtitle">{{ subtitle }}</p>
      <p v-if="excerpt" class="preview-excerpt">{{ excerpt }}</p>
      <dl v-else-if="fallbackFields.length" class="preview-fields">
        <template v-for="field in fallbackFields" :key="field.label">
          <dt>{{ field.label }}</dt>
          <dd>{{ field.value }}</dd>
        </template>
      </dl>
      <div v-if="stats.length" class="preview-stats">
        <span v-for="stat in stats" :key="stat.label">
          <strong>{{ stat.value }}</strong>
          {{ stat.label }}
        </span>
      </div>
      <RouterLink v-if="detailLink" :to="detailLink" class="preview-link">
        查看完整详情 →
      </RouterLink>
    </div>
  </article>
</template>

<style scoped>
.preview-card {
  display: flex;
  gap: 16px;
  padding: 16px;
  background: var(--surface-muted);
  border: 1px solid var(--border);
  border-radius: 10px;
}

.preview-cover {
  width: 120px;
  flex: none;
  align-self: flex-start;
  border-radius: 8px;
  overflow: hidden;
  background: var(--border);
}

.preview-cover img {
  display: block;
  width: 100%;
  height: auto;
}

.preview-body {
  min-width: 0;
}

.preview-kicker {
  margin: 0 0 4px;
  color: var(--muted);
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

h3 {
  margin: 0;
  font-size: 17px;
  line-height: 1.4;
}

.preview-subtitle {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 13px;
}

.preview-excerpt {
  margin: 8px 0 0;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.65;
  white-space: pre-wrap;
}

.preview-fields {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 2px 12px;
  margin: 8px 0 0;
  font-size: 13px;
}

.preview-fields dt {
  color: var(--muted);
}

.preview-fields dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.preview-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-top: 10px;
  color: var(--muted);
  font-size: 12px;
}

.preview-stats strong {
  color: var(--text);
  font-size: 14px;
}

.preview-link {
  display: inline-block;
  margin-top: 10px;
  color: var(--primary);
  font-size: 13px;
  text-decoration: none;
}

.preview-link:hover {
  text-decoration: underline;
}

@media (max-width: 640px) {
  .preview-card {
    flex-direction: column;
  }

  .preview-cover {
    width: 100%;
    max-width: 220px;
  }
}
</style>
