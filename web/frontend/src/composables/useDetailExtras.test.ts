import { computed, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SchemaResponse } from '@/api/types'
import type { DetailConfig } from '@/config/details'

const { queryTable } = vi.hoisted(() => ({ queryTable: vi.fn() }))

vi.mock('@/api/client', () => ({
  api: { queryTable },
  ApiError: class ApiError extends Error {
    status: number

    constructor(message: string, status: number) {
      super(message)
      this.name = 'ApiError'
      this.status = status
    }
  },
}))

import { useDetailExtras } from './useDetailExtras'

const schema = ref<SchemaResponse | null | undefined>({
  platforms: { qireader: 1 },
  tables: [
    {
      name: 'qireader_article',
      platform: 'qireader',
      kind: 'projection',
      row_count: 1,
      primary_key: ['url'],
      columns: [
        { name: 'url', type: 'TEXT', json: false, pk: 1 },
        { name: 'content', type: 'TEXT', json: false },
      ],
    },
  ],
})

const config = computed<DetailConfig | undefined>(() => ({
  title: ['title'],
  lookup: {
    table: 'qireader_article',
    column: 'url',
    targetColumn: 'url',
    label: '文章正文',
    fields: ['content'],
    emptyText: '正文尚未抓取。',
  },
}))

describe('detail extras lookup', () => {
  beforeEach(() => {
    queryTable.mockReset()
  })

  it('loads the body and clears the loading flag', async () => {
    queryTable.mockResolvedValue({
      table: 'qireader_article',
      columns: [],
      rows: [{ url: 'https://example.test/a', content: '<p>hello</p>' }],
      total: 1,
      limit: 1,
      offset: 0,
    })
    const extras = useDetailExtras(config, schema)
    await extras.load({ url: 'https://example.test/a' })
    expect(extras.lookupLoading.value).toBe(false)
    expect(extras.lookupValue.value).toBe('<p>hello</p>')
    expect(extras.lookupColumn.value?.name).toBe('content')
  })

  it('clears the loading flag when the target row is missing', async () => {
    queryTable.mockResolvedValue({
      table: 'qireader_article',
      columns: [],
      rows: [],
      total: 0,
      limit: 1,
      offset: 0,
    })
    const extras = useDetailExtras(config, schema)
    await extras.load({ url: 'https://example.test/missing' })
    expect(extras.lookupLoading.value).toBe(false)
    expect(extras.lookupValue.value).toBeUndefined()
  })
})
