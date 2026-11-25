<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'

import PlatformNav from '@/components/PlatformNav.vue'
import { useSchema } from '@/composables/useSchema'

const { schema } = useSchema()
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <RouterLink to="/" class="brand" aria-label="返回总览">
        <span class="brand-mark">et</span>
        <span class="brand-copy">
          <strong>eto 收藏库</strong>
          <small>本地只读数据浏览器</small>
        </span>
      </RouterLink>
      <span class="header-spacer" />
      <span class="readonly-badge">只读</span>
    </header>
    <div class="app-body">
      <aside class="app-sidebar">
        <PlatformNav v-if="schema" :schema="schema" />
        <p v-else class="nav-placeholder">正在读取数据目录…</p>
      </aside>
      <main class="app-main">
        <RouterView />
      </main>
    </div>
  </div>
</template>
