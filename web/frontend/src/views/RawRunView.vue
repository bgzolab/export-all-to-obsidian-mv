<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()
</script>

<template>
  <section>
    <h1>run #{{ route.params.id }}</h1>
    <p class="muted">raw 浏览器即将实现。</p>
  </section>
</template>
