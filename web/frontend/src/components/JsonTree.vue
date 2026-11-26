<script setup lang="ts">
import { computed } from 'vue'
import Tree from 'openvue/tree'
import type { TreeNode } from 'openvue/treenode'

const props = defineProps<{ value: unknown }>()

function preview(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string') {
    const shortened = value.length > 80 ? `${value.slice(0, 80)}…` : value
    return JSON.stringify(shortened)
  }
  return String(value)
}

function buildNode(key: string, value: unknown, path: string): TreeNode {
  if (Array.isArray(value)) {
    return {
      key: path,
      label: `${key} [${value.length}]`,
      children: value.map((item, index) => buildNode(String(index), item, `${path}.${index}`)),
    }
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
    return {
      key: path,
      label: `${key} {${entries.length}}`,
      children: entries.map(([childKey, childValue]) =>
        buildNode(childKey, childValue, `${path}.${childKey}`),
      ),
    }
  }
  return { key: path, label: `${key}: ${preview(value)}` }
}

const nodes = computed<TreeNode[]>(() => {
  const value = props.value
  if (Array.isArray(value)) {
    return value.map((item, index) => buildNode(String(index), item, `$[${index}]`))
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).map(([key, item]) => buildNode(key, item, `$.${key}`))
  }
  return [{ key: '$', label: preview(value) }]
})
</script>

<template>
  <Tree :value="nodes" class="json-tree" />
</template>

<style scoped>
.json-tree {
  font-size: 12px;
  max-width: 100%;
}
</style>
