<script setup lang="ts">
import type { FilterSpec } from '@/api/types'
import type { FacetConfig } from '@/config/tables'
import { formatNumber } from '@/utils/format'

const props = defineProps<{
  facets: FacetConfig[]
  filters: FilterSpec[]
  counts: Map<string, Map<string, number>>
}>()

const emit = defineEmits<{
  select: [column: string, value: string | number | null]
}>()

function activeValue(column: string): string {
  const filter = props.filters.find((item) => item.column === column && item.op === 'eq')
  return filter ? String(filter.value) : ''
}

function countText(column: string, value: string | number): string {
  const count = props.counts.get(column)?.get(String(value))
  return count === undefined ? '…' : formatNumber(count)
}
</script>

<template>
  <div class="facet-bar">
    <div v-for="facet in facets" :key="facet.column" class="facet-group">
      <span class="facet-label">{{ facet.label }}</span>
      <div class="facet-options">
        <button
          type="button"
          class="facet-option"
          :class="{ active: activeValue(facet.column) === '' }"
          @click="emit('select', facet.column, null)"
        >
          {{ facet.allLabel ?? '全部' }}
          <span class="facet-count">{{ countText(facet.column, '') }}</span>
        </button>
        <button
          v-for="option in facet.options"
          :key="option.value"
          type="button"
          class="facet-option"
          :class="{ active: activeValue(facet.column) === String(option.value) }"
          @click="emit('select', facet.column, option.value)"
        >
          {{ option.label }}
          <span class="facet-count">
            {{ countText(facet.column, option.value) }}
          </span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.facet-bar {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  gap: 14px 22px;
  margin-bottom: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  background: var(--surface-subtle);
}

.facet-group {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}

.facet-group + .facet-group {
  padding-left: 20px;
  border-left: 1px solid var(--border-soft);
}

.facet-label {
  flex: none;
  color: var(--muted-light);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.facet-options {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.facet-option {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: var(--text-tertiary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.facet-option:hover {
  background: var(--surface-hover);
}

.facet-option.active {
  border-color: var(--primary-border);
  background: var(--primary-soft);
  color: var(--primary-text);
  font-weight: 600;
}

.facet-count {
  color: var(--muted-light);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.facet-option.active .facet-count {
  color: var(--primary-strong);
}

@media (max-width: 760px) {
  .facet-group + .facet-group {
    padding-left: 0;
    border-left: 0;
  }
}
</style>
