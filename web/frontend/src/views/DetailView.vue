<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import { ApiError, api } from '@/api/client'
import type { ColumnMeta, TableMeta } from '@/api/types'
import FieldRenderer from '@/components/FieldRenderer.vue'
import { useSchema } from '@/composables/useSchema'
import { tableLabel, titleColumnFor } from '@/config/tables'
import { decodePk } from '@/utils/pk'

const route = useRoute()
const { schema, error: schemaError } = useSchema()

const tableName = computed(() => String(route.params.table ?? ''))
const pkParam = computed(() => String(route.params.pk ?? ''))
const decodedPk = computed(() => decodePk(pkParam.value))
const table = computed<TableMeta | undefined>(() =>
  schema.value?.tables.find((item) => item.name === tableName.value),
)
const columns = computed<ColumnMeta[]>(
  () => table.value?.columns.filter((column) => !column.hidden) ?? [],
)

const row = ref<Record<string, unknown> | null>(null)
const loading = ref(false)
const notFound = ref(false)
const loadError = ref('')

const detailTitle = computed(() => {
  const column = titleColumnFor(tableName.value)
  const title = column && row.value ? row.value[column] : undefined
  const label = tableLabel(tableName.value)
  return title ? `${label} · ${String(title)}` : label
})

let requestSequence = 0

async function load() {
  if (!table.value) return
  if (!decodedPk.value) {
    loadError.value = '主键参数无效'
    row.value = null
    return
  }
  const sequence = ++requestSequence
  loading.value = true
  notFound.value = false
  loadError.value = ''
  try {
    const response = await api.getRow(tableName.value, decodedPk.value)
    if (sequence !== requestSequence) return
    row.value = response.row
  } catch (caught) {
    if (sequence !== requestSequence) return
    row.value = null
    if (caught instanceof ApiError && caught.status === 404) {
      notFound.value = true
    } else {
      loadError.value = caught instanceof ApiError ? caught.message : String(caught)
    }
  } finally {
    if (sequence === requestSequence) loading.value = false
  }
}

watch(() => [table.value, pkParam.value] as const, load, { immediate: true })
</script>

<template>
  <section class="detail-view">
    <RouterLink :to="`/t/${tableName}`" class="back">← 返回 {{ tableName }}</RouterLink>

    <p v-if="schemaError" class="error">无法读取 schema：{{ schemaError }}</p>
    <p v-else-if="!schema" class="muted">正在读取 schema…</p>
    <p v-else-if="!table" class="error">未知表：{{ tableName }}</p>
    <p v-else-if="loading" class="muted">正在加载…</p>
    <p v-else-if="notFound" class="error">记录不存在。</p>
    <p v-else-if="loadError" class="error">加载失败：{{ loadError }}</p>

    <template v-else-if="row">
      <h1>{{ detailTitle }}</h1>
      <p class="muted table-name">{{ table.name }}</p>
      <dl class="fields">
        <template v-for="column in columns" :key="column.name">
          <dt>{{ column.name }}</dt>
          <dd>
            <FieldRenderer :table="table.name" :column="column" :value="row[column.name]" />
          </dd>
        </template>
      </dl>
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

.table-name {
  margin: -6px 0 12px;
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.fields {
  display: grid;
  grid-template-columns: minmax(140px, max-content) 1fr;
  gap: 6px 18px;
  margin: 0;
}

dt {
  color: #6b7280;
  font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

dd {
  margin: 0;
  font-size: 14px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
dd.block {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}
</style>
