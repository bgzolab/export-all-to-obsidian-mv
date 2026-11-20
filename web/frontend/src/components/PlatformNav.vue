<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

import type { SchemaResponse, TableMeta } from '@/api/types'
import { platformLabel } from '@/config/tables'

const props = defineProps<{ schema: SchemaResponse }>()

const groups = computed(() => {
  const grouped = new Map<string, TableMeta[]>()
  for (const table of props.schema.tables) {
    const tables = grouped.get(table.platform) ?? []
    tables.push(table)
    grouped.set(table.platform, tables)
  }
  // Raw is a backend grouping, not a platform; keep it last so the ten
  // projection platforms stay visually separate.
  return [...grouped.entries()].sort(([a], [b]) => {
    if (a === 'raw') return 1
    if (b === 'raw') return -1
    return a.localeCompare(b)
  })
})
</script>

<template>
  <nav class="platform-nav" aria-label="平台与表">
    <section v-for="[platform, tables] in groups" :key="platform" class="nav-group">
      <h2>{{ platformLabel(platform) }}</h2>
      <ul>
        <li v-for="table in tables" :key="table.name">
          <RouterLink :to="`/t/${table.name}`">
            <span>{{ table.name }}</span>
            <span class="count">{{ table.row_count }}</span>
          </RouterLink>
        </li>
      </ul>
    </section>
  </nav>
</template>

<style scoped>
.platform-nav {
  padding: 12px;
  font-size: 13px;
}

.nav-group + .nav-group {
  margin-top: 16px;
}

h2 {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

a {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 6px;
  border-radius: 4px;
  text-decoration: none;
  color: #374151;
}

a:hover,
a.router-link-active {
  background: #eef2ff;
  color: #3730a3;
}

.count {
  color: #9ca3af;
  font-variant-numeric: tabular-nums;
}
</style>
