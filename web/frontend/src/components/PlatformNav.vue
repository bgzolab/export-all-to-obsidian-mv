<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import type { SchemaResponse } from '@/api/types'
import { formatNumber } from '@/utils/format'
import {
  platformConfigFor,
  platformKeyForTable,
  platformKeys,
  platformLabel,
} from '@/config/platforms'

const props = defineProps<{ schema: SchemaResponse }>()
const route = useRoute()

const currentPlatform = computed(() =>
  typeof route.params.table === 'string' ? platformKeyForTable(route.params.table) : '',
)

const keys = computed(() => platformKeys(Object.keys(props.schema.platforms)))

const counts = computed(() => {
  const tableCounts = new Map(props.schema.tables.map((table) => [table.name, table.row_count]))
  return new Map(
    keys.value.map((key) => {
      const primary = platformConfigFor(key)?.primaryTable
      return [key, primary ? (tableCounts.get(primary) ?? 0) : 0]
    }),
  )
})

const rawCount = computed(
  () =>
    props.schema.tables.find((table) => table.name === 'sync_response')?.row_count ?? 0,
)
</script>

<template>
  <nav class="platform-nav" aria-label="平台导航">
    <p class="nav-caption">平台</p>
    <ul class="nav-list">
      <li v-for="key in keys" :key="key">
        <RouterLink
          :to="`/t/${platformConfigFor(key)?.primaryTable ?? key}`"
          :class="{ active: currentPlatform === key }"
        >
          <span>{{ platformLabel(key) }}</span>
          <span class="count">{{ formatNumber(counts.get(key) ?? 0) }}</span>
        </RouterLink>
      </li>
    </ul>

    <p class="nav-caption raw-caption">数据审计</p>
    <ul class="nav-list">
      <RouterLink to="/raw" class="raw-link">
        <span>原始响应</span>
        <span class="count">{{ formatNumber(rawCount) }}</span>
      </RouterLink>
    </ul>
  </nav>
</template>

<style scoped>
.platform-nav {
  padding: 14px 10px;
  font-size: 13px;
}

.nav-caption {
  margin: 0 6px 6px;
  color: var(--muted-light);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.raw-caption {
  margin-top: 20px;
}

.nav-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

a {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 8px;
  border-radius: 7px;
  text-decoration: none;
  color: var(--text-secondary);
}

a:hover {
  background: var(--surface-hover);
}

a.active,
a.router-link-active {
  background: var(--primary-soft);
  color: var(--primary-text);
  font-weight: 600;
}

.count {
  color: var(--muted-light);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.active .count,
.router-link-active .count {
  color: var(--primary-strong);
}

.raw-link {
  color: var(--text-tertiary);
}

.nav-placeholder {
  padding: 6px;
  color: var(--muted-light);
  font-size: 12px;
}
</style>
