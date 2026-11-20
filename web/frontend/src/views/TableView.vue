<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()
</script>

<template>
  <section>
    <h1>{{ route.params.table }}</h1>
    <p class="muted">列表视图将在下一步实现。</p>
  </section>
</template>
