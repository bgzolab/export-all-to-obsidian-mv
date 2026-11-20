<script setup lang="ts">
import { computed } from 'vue'
import Button from 'openvue/button'
import Select from 'openvue/select'

import type { ColumnMeta, FilterSpec } from '@/api/types'
import { fromDatetimeLocal, toDatetimeLocal } from '@/utils/time'

const props = defineProps<{
  columns: ColumnMeta[]
  filters: FilterSpec[]
}>()

const emit = defineEmits<{ 'update:filters': [FilterSpec[]] }>()

type ColumnKind = 'text' | 'number' | 'time' | 'json'

const NULL_OPS = ['is_null', 'not_null']
const TEXT_OPS = ['eq', 'ne', 'like', ...NULL_OPS]
const NUMBER_OPS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', ...NULL_OPS]

// Columns are classified by declared affinity plus a conservative name match;
// TASK-013 can override units per table when the name alone is ambiguous.
function kindOf(column: ColumnMeta | undefined): ColumnKind {
  if (!column) return 'text'
  if (column.json) return 'json'
  const type = (column.type || '').toUpperCase()
  if (type.includes('INT') || type.includes('REAL') || type.includes('NUM')) {
    return /(^|_)(created|updated|published|time|date|at)(_|$)/.test(column.name)
      ? 'time'
      : 'number'
  }
  return 'text'
}

function operatorsFor(column: ColumnMeta | undefined): string[] {
  const kind = kindOf(column)
  if (kind === 'json') return NULL_OPS
  if (kind === 'time' || kind === 'number') return NUMBER_OPS
  return TEXT_OPS
}

function columnByName(name: string): ColumnMeta | undefined {
  return props.columns.find((column) => column.name === name)
}

const filterableColumns = computed(() => props.columns.map((column) => column.name))

function defaultOperator(column: ColumnMeta | undefined): string {
  return operatorsFor(column)[0]
}

function addFilter() {
  const column = props.columns[0]
  if (!column) return
  emit('update:filters', [
    ...props.filters,
    { column: column.name, op: defaultOperator(column), value: '' },
  ])
}

function updateFilter(index: number, patch: Partial<FilterSpec>) {
  const next = props.filters.map((filter, position) =>
    position === index ? { ...filter, ...patch } : filter,
  )
  emit('update:filters', next)
}

function changeColumn(index: number, name: unknown) {
  const column = columnByName(String(name))
  updateFilter(index, {
    column: String(name),
    op: defaultOperator(column),
    value: '',
  })
}

function changeOperator(index: number, op: unknown) {
  const value = NULL_OPS.includes(String(op)) ? '' : props.filters[index]?.value
  updateFilter(index, { op: String(op), value })
}

function inputValue(filter: FilterSpec): string {
  const column = columnByName(filter.column)
  if (column && kindOf(column) === 'time') {
    return toDatetimeLocal(filter.value)
  }
  return filter.value === null || filter.value === undefined ? '' : String(filter.value)
}

function changeValue(index: number, raw: string) {
  const filter = props.filters[index]
  const column = columnByName(filter.column)
  const kind = kindOf(column)
  if (kind === 'time') {
    const epoch = fromDatetimeLocal(raw)
    updateFilter(index, { value: epoch ?? '' })
    return
  }
  if (kind === 'number') {
    const numeric = Number(raw)
    updateFilter(index, { value: raw === '' || !Number.isFinite(numeric) ? raw : numeric })
    return
  }
  updateFilter(index, { value: raw })
}

function removeFilter(index: number) {
  emit(
    'update:filters',
    props.filters.filter((_, position) => position !== index),
  )
}
</script>

<template>
  <div class="filter-bar">
    <div v-for="(filter, index) in filters" :key="index" class="filter-row">
      <Select
        :model-value="filter.column"
        :options="filterableColumns"
        size="small"
        aria-label="过滤列"
        @update:model-value="changeColumn(index, $event)"
      />
      <Select
        :model-value="filter.op"
        :options="operatorsFor(columnByName(filter.column))"
        size="small"
        aria-label="过滤操作符"
        @update:model-value="changeOperator(index, $event)"
      />
      <input
        v-if="!NULL_OPS.includes(filter.op)"
        class="value-input"
        :type="kindOf(columnByName(filter.column)) === 'time' ? 'datetime-local' : 'text'"
        :value="inputValue(filter)"
        :aria-label="`过滤值 ${filter.column}`"
        @change="changeValue(index, ($event.target as HTMLInputElement).value)"
      />
      <Button
        type="button"
        label="删除"
        severity="secondary"
        text
        size="small"
        aria-label="删除过滤条件"
        @click="removeFilter(index)"
      />
    </div>
    <div class="filter-actions">
      <Button type="button" label="添加过滤条件" size="small" text @click="addFilter" />
      <span class="hint">时间/数值范围可添加 gte 与 lte 两条条件。</span>
    </div>
  </div>
</template>

<style scoped>
.filter-bar {
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.filter-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.value-input {
  min-width: 200px;
  padding: 6px 8px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font: inherit;
  font-size: 13px;
  background: #ffffff;
}

.filter-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.hint {
  color: #9ca3af;
  font-size: 12px;
}
</style>
