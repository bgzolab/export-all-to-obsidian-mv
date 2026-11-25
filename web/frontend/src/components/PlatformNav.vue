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
import {
  iconStyle,
  kanbanIcon,
  platformIcon,
  platformIconStyle,
  timelineIcon,
} from '@/config/icons'

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

const entries = computed(() =>
  keys.value.map((key) => {
    const config = platformConfigFor(key)
    return {
      key,
      label: platformLabel(key),
      mark: config?.mark ?? key.slice(0, 1).toUpperCase(),
      icon: platformIcon(key),
      color: config?.color ?? 'var(--text-tertiary)',
      table: config?.primaryTable ?? key,
      count: counts.value.get(key) ?? 0,
    }
  }),
)

const rawCount = computed(
  () =>
    props.schema.tables.find((table) => table.name === 'sync_response')?.row_count ?? 0,
)

const rawActive = computed(() => route.path.startsWith('/raw'))
</script>

<template>
  <nav class="platform-nav" aria-label="平台导航">
    <ul class="nav-list overview-list">
      <li>
        <RouterLink to="/" class="nav-item" :class="{ active: route.name === 'home' }">
          <span class="nav-mark overview">
            <span class="mask-icon" aria-hidden="true" :style="iconStyle(kanbanIcon)" />
          </span>
          <span class="nav-label">总览</span>
        </RouterLink>
      </li>
      <li>
        <RouterLink
          to="/timeline"
          class="nav-item"
          :class="{ active: route.name === 'timeline' }"
        >
          <span class="nav-mark timeline-mark">
            <span class="mask-icon" aria-hidden="true" :style="iconStyle(timelineIcon)" />
          </span>
          <span class="nav-label">时间线</span>
        </RouterLink>
      </li>
    </ul>

    <div class="nav-divider" />

    <p class="nav-caption">内容平台</p>
    <ul class="nav-list">
      <li v-for="entry in entries" :key="entry.key">
        <RouterLink
          :to="`/t/${entry.table}`"
          class="nav-item"
          :class="{ active: currentPlatform === entry.key }"
        >
          <span class="nav-mark" :style="{ background: entry.color }">
            <span
              v-if="entry.icon"
              class="mask-icon"
              aria-hidden="true"
              :style="platformIconStyle(entry.key)"
            />
            <template v-else>{{ entry.mark }}</template>
          </span>
          <span class="nav-label">{{ entry.label }}</span>
          <span class="nav-count">{{ formatNumber(entry.count) }}</span>
        </RouterLink>
      </li>
    </ul>

    <div class="nav-divider" />

    <p class="nav-caption">数据审计</p>
    <ul class="nav-list">
      <li>
        <RouterLink to="/raw" class="nav-item" :class="{ active: rawActive }">
          <span class="nav-mark neutral">原</span>
          <span class="nav-label">原始响应</span>
          <span class="nav-count">{{ formatNumber(rawCount) }}</span>
        </RouterLink>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
.platform-nav {
  padding: 16px 10px 20px;
  font-size: 13px;
}

.nav-caption {
  margin: 0 10px 7px;
  color: var(--muted-light);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.nav-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 38px;
  padding: 5px 9px;
  border-radius: 9px;
  color: var(--text-secondary);
  text-decoration: none;
  transition:
    background-color 100ms ease,
    color 100ms ease;
}

.nav-item:hover {
  background: var(--surface-hover);
}

.nav-item.active {
  background: var(--primary-soft);
  box-shadow: inset 2px 0 0 var(--primary);
  color: var(--primary-text);
}

.nav-mark {
  width: 24px;
  height: 24px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 7px;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 22%);
  color: #ffffff;
  font-size: 11px;
  font-weight: 700;
}

.nav-mark.neutral {
  background: var(--surface-sunken);
  box-shadow: none;
  color: var(--muted);
}

.nav-mark.overview {
  background: linear-gradient(145deg, #818cf8, #4f46e5);
}

.nav-mark.timeline-mark {
  background: linear-gradient(145deg, #38bdf8, #2563eb);
}

.nav-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-item.active .nav-label {
  font-weight: 600;
}

.nav-count {
  color: var(--muted-light);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.nav-item.active .nav-count {
  color: var(--primary-strong);
}

.nav-divider {
  height: 1px;
  margin: 14px 10px;
  background: var(--border-soft);
}

@media (max-width: 760px) {
  .platform-nav {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 4px;
    padding: 8px 12px;
  }

  .nav-caption,
  .nav-divider {
    display: none;
  }

  .nav-list {
    flex-direction: row;
    flex-wrap: wrap;
    gap: 4px;
  }

  .nav-item {
    min-height: 32px;
    padding: 3px 7px;
    gap: 6px;
    white-space: nowrap;
  }

  .nav-mark {
    width: 20px;
    height: 20px;
    border-radius: 6px;
    font-size: 10px;
  }

  .nav-label {
    flex: none;
    font-size: 12px;
  }

  .nav-count {
    display: none;
  }
}
</style>
