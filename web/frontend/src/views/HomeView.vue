<script setup lang="ts">
import { computed } from 'vue'

import { useSchema } from '@/composables/useSchema'
import { platformLabel } from '@/config/tables'
import PlatformNav from '@/components/PlatformNav.vue'

const { schema, error } = useSchema()

const platforms = computed(() => {
  if (!schema.value) return []
  const groups = new Map<string, (typeof schema.value.tables)[number][]>()
  for (const table of schema.value.tables) {
    const tables = groups.get(table.platform) ?? []
    tables.push(table)
    groups.set(table.platform, tables)
  }
  return [...groups.entries()]
    .filter(([platform]) => platform !== 'raw')
    .sort(([a], [b]) => a.localeCompare(b))
})

const totalTables = computed(() => schema.value?.tables.length ?? 0)
</script>

<template>
  <p v-if="error" class="error">无法读取 schema：{{ error }}</p>
  <p v-else-if="!schema" class="muted">正在读取 schema…</p>
  <template v-else>
    <p class="muted">
      {{ platforms.length }} 个平台，{{ totalTables }} 张表（含 raw 层）。
    </p>
    <div class="platform-grid">
      <section v-for="[platform, tables] in platforms" :key="platform" class="platform-card">
        <h2>{{ platformLabel(platform) }}</h2>
        <ul>
          <li v-for="table in tables" :key="table.name">
            <RouterLink :to="`/t/${table.name}`">{{ table.name }}</RouterLink>
            <span class="count">{{ table.row_count }} 行</span>
          </li>
        </ul>
      </section>
    </div>
    <section v-if="schema.platforms.raw" class="raw-entry">
      <RouterLink to="/raw">浏览 raw 原始响应（{{ schema.platforms.raw }} 张表）</RouterLink>
    </section>
  </template>
</template>

<style scoped>
.platform-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

.platform-card {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 12px 14px;
}

h2 {
  margin: 0 0 8px;
  font-size: 14px;
}

ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

li {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 3px 0;
  font-size: 13px;
}

a {
  color: #3730a3;
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

.count {
  color: #6b7280;
  font-variant-numeric: tabular-nums;
}

.raw-entry {
  margin-top: 16px;
  font-size: 13px;
}
</style>
