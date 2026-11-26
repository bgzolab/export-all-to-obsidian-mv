<script setup lang="ts">
import { computed } from 'vue'
import Button from 'openvue/button'
import Select from 'openvue/select'

import type { ColumnMeta, FilterSpec } from '@/api/types'
import { columnLabel } from '@/config/columns'
import { timeUnitFor } from '@/utils/renderers'
import { fromDatetimeLocal, toDatetimeLocal } from '@/utils/time'

const props = defineProps<{
  table: string
  columns: ColumnMeta[]
  filters: FilterSpec[]
}>()

const emit = defineEmits<{ 'update:filters': [FilterSpec[]] }>()

type ColumnKind = 'text' | 'number' | 'time' | 'json'

const NULL_OPS = ['is_null', 'not_null']
const TEXT_OPS = ['eq', 'ne', 'like', ...NULL_OPS]
const NUMBER_OPS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', ...NULL_OPS]

const OPERATOR_LABELS: Record<string, string> = {
  eq: '等于',
  ne: '不等于',
  gt: '大于',
  gte: '大于等于',
  lt: '小于',
  lte: '小于等于',
  like: '包含',
  in: '属于列表',
  is_null: '为空',
  not_null: '不为空',
}

// Columns are classified by declared affinity plus a conservative name match.
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

function operatorOptions(column: ColumnMeta | undefined) {
  return operatorsFor(column).map((op) => ({ label: OPERATOR_LABELS[op] ?? op, value: op }))
}

const filterableColumns = computed(() =>
  props.columns.map((column) => ({
    label: columnLabel(props.table, column.name),
    value: column.name,
  })),
)

function columnByName(name: string): ColumnMeta | undefined {
  return props.columns.find((column) => column.name === name)
}

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
  const current = props.filters[index]?.value
  // `in` values are arrays and cannot round-trip through a scalar operator.
  const scalar = Array.isArray(current) ? (current[0] ?? '') : current
  const value = NULL_OPS.includes(String(op)) ? '' : scalar
  updateFilter(index, { op: String(op), value })
}

function inputValue(filter: FilterSpec): string {
  const column = columnByName(filter.column)
  if (column && kindOf(column) === 'time') {
    return toDatetimeLocal(filter.value, timeUnitFor(props.table, column))
  }
  return filter.value === null || filter.value === undefined ? '' : String(filter.value)
}

function changeValue(index: number, raw: string) {
  const filter = props.filters[index]
  const column = columnByName(filter.column)
  const kind = kindOf(column)
  if (kind === 'time' && column) {
    const epoch = fromDatetimeLocal(raw, timeUnitFor(props.table, column))
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
        option-label="label"
        option-value="value"
        size="small"
        aria-label="过滤列"
        @update:model-value="changeColumn(index, $event)"
      />
      <Select
        :model-value="filter.op"
        :options="operatorOptions(columnByName(filter.column))"
        option-label="label"
        option-value="value"
        size="small"
        aria-label="过滤操作符"
        @update:model-value="changeOperator(index, $event)"
      />
      <input
        v-if="!NULL_OPS.includes(filter.op)"
        class="value-input"
        :type="kindOf(columnByName(filter.column)) === 'time' ? 'datetime-local' : 'text'"
        :value="inputValue(filter)"
        :disabled="filter.op === 'in'"
        :title="filter.op === 'in' ? '列表过滤来自分享链接，仅可移除后重新添加' : undefined"
        :aria-label="`过滤值 ${columnLabel(table, filter.column)}`"
        @change="changeValue(index, ($event.target as HTMLInputElement).value)"
      />
      <Button
        type="button"
        label="移除"
        severity="secondary"
        text
        size="small"
        aria-label="移除过滤条件"
        @click="removeFilter(index)"
      />
    </div>
    <div class="filter-actions">
      <Button type="button" label="添加过滤条件" size="small" text @click="addFilter" />
      <span class="hint">时间/数值范围可添加大于等于与小于等于两条条件。</span>
    </div>
  </div>
</template>

<style scoped>
.filter-bar {
  flex: none;
  margin-bottom: 10px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--surface-muted);
  border: 1px solid var(--border);
  border-radius: 10px;
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
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  font: inherit;
  font-size: 13px;
  background: var(--surface);
  color: var(--text);
}

.filter-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.hint {
  color: var(--muted-light);
  font-size: 12px;
}
</style>
