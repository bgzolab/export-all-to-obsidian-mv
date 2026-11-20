<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { ApiError, api } from '@/api/client'
import type { SchemaResponse } from '@/api/types'

const schema = ref<SchemaResponse | null>(null)
const error = ref('')

onMounted(async () => {
  try {
    schema.value = await api.schema()
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : String(caught)
  }
})
</script>

<template>
  <section>
    <h1>数据库总览</h1>
    <p v-if="error" class="error">无法读取 schema：{{ error }}</p>
    <p v-else-if="!schema" class="muted">正在读取 schema…</p>
    <p v-else class="muted">
      已连接，共 {{ schema.tables.length }} 张表、{{ Object.keys(schema.platforms).length }}
      个分组。
    </p>
  </section>
</template>
