<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <RouterLink to="/" class="brand">eto 数据浏览器</RouterLink>
      <span class="subtitle">只读 · 本地数据库</span>
    </header>
    <main class="app-main">
      <RouterView />
    </main>
  </div>
</template>
