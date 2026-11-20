<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'

import PlatformNav from '@/components/PlatformNav.vue'
import { useSchema } from '@/composables/useSchema'

const { schema } = useSchema()
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <RouterLink to="/" class="brand">eto 数据浏览器</RouterLink>
      <span class="subtitle">只读 · 本地数据库</span>
    </header>
    <div class="app-body">
      <aside class="app-sidebar">
        <PlatformNav v-if="schema" :schema="schema" />
        <p v-else class="nav-placeholder">正在读取 schema…</p>
      </aside>
      <main class="app-main">
        <RouterView />
      </main>
    </div>
  </div>
</template>
