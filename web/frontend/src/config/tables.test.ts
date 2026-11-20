import { describe, expect, it } from 'vitest'

import type { TableMeta } from '@/api/types'

import {
  defaultListColumns,
  hiddenColumnsFor,
  listColumnsFor,
  tableLabel,
  titleColumnFor,
} from './tables'

function table(overrides: Partial<TableMeta> = {}): TableMeta {
  return {
    name: 'future_table',
    platform: 'future',
    kind: 'projection',
    row_count: 1,
    primary_key: ['id'],
    columns: [
      { name: 'id', type: 'INTEGER', json: false, pk: 1 },
      { name: 'title', type: 'TEXT', json: false },
      { name: 'body', type: 'TEXT', json: false },
      { name: 'payload_json', type: 'TEXT', json: true },
      { name: 'created_at', type: 'TEXT', json: false },
    ],
    ...overrides,
  }
}

describe('table display config', () => {
  it('labels known tables and falls back to the raw name', () => {
    expect(tableLabel('zhihu_content')).toBe('知乎内容')
    expect(titleColumnFor('github_star')).toBe('full_name')
    expect(tableLabel('future_table')).toBe('future_table')
  })

  it('keeps configured list columns that exist in the live schema', () => {
    const zhihu = table({
      name: 'zhihu_content',
      primary_key: ['content_id'],
      columns: [
        { name: 'content_id', type: 'TEXT', json: false, pk: 1 },
        { name: 'title', type: 'TEXT', json: false },
        { name: 'body_html', type: 'TEXT', json: false },
        { name: 'updated_time', type: 'INTEGER', json: false },
        { name: 'removed_column', type: 'TEXT', json: false },
      ],
    })
    expect(listColumnsFor(zhihu)).toContain('title')
    expect(listColumnsFor(zhihu)).not.toContain('body_html')
    expect(listColumnsFor(zhihu)).not.toContain('removed_column')
  })

  it('falls back for unknown tables without large or JSON columns', () => {
    const columns = defaultListColumns(table())
    expect(columns).toContain('id')
    expect(columns).toContain('title')
    expect(columns).not.toContain('body')
    expect(columns).not.toContain('payload_json')
    expect(listColumnsFor(table())).toEqual(columns)
  })

  it('exposes configured hidden columns', () => {
    expect(hiddenColumnsFor('zhihu_content').has('body_html')).toBe(true)
    expect(hiddenColumnsFor('future_table').size).toBe(0)
  })
})
