import { ref } from 'vue'

import { ApiError, api } from '@/api/client'
import type { SchemaResponse } from '@/api/types'

// Schema is fetched once per page load and shared by the sidebar and every
// view; without a store, a module-level cache is the smallest way to avoid a
// duplicate /api/schema request on the home page.
const schema = ref<SchemaResponse | null>(null)
const error = ref('')
let pending: Promise<void> | null = null

async function load() {
  try {
    schema.value = await api.schema()
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : String(caught)
  }
}

export function useSchema() {
  if (!schema.value && !pending) {
    pending = load().finally(() => {
      pending = null
    })
  }
  return { schema, error }
}
