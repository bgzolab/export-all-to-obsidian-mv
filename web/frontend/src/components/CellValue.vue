<script setup lang="ts">
import { computed } from 'vue'
import Tag from 'openvue/tag'

import type { ColumnMeta } from '@/api/types'
import { isBooleanColumn, valueLabelFor } from '@/config/columns'
import { formatCellValue } from '@/utils/format'

const props = defineProps<{
  table: string
  column: ColumnMeta
  value: unknown
}>()

const text = computed(() => formatCellValue(props.table, props.column, props.value))
const mapped = computed(() => valueLabelFor(props.table, props.column.name, props.value))
const boolean = computed(() => isBooleanColumn(props.column.name))

const severity = computed(() => {
  if (!boolean.value) return 'secondary'
  return props.value ? 'success' : 'danger'
})
</script>

<template>
  <Tag v-if="boolean" :value="text" :severity="severity" />
  <Tag v-else-if="mapped" :value="text" severity="secondary" />
  <span v-else class="cell" :title="String(value ?? '')">{{ text }}</span>
</template>

<style scoped>
.cell {
  display: inline-block;
  max-width: 440px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}
</style>
