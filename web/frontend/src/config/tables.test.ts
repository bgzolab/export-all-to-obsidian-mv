import { describe, expect, it } from 'vitest'

import type { TableMeta } from '@/api/types'

import {
  defaultListColumns,
  facetsFor,
  foldersFor,
  galleryFor,
  hiddenColumnsFor,
  listColumnsFor,
  searchColumnsFor,
  tableLabel,
  tableLayout,
  tableRelation,
  titleColumnFor,
  virtualColumnsFor,
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

  it('falls back for unknown tables without ids, large or JSON columns', () => {
    const columns = defaultListColumns(table())
    expect(columns).not.toContain('id')
    expect(columns).toContain('title')
    expect(columns).toContain('created_at')
    expect(columns).not.toContain('body')
    expect(columns).not.toContain('payload_json')
    expect(listColumnsFor(table())).toEqual(columns)
  })

  it('keeps ids out of configured list columns', () => {
    const zhihu = table({
      name: 'zhihu_content',
      primary_key: ['content_id'],
      columns: [
        { name: 'content_id', type: 'TEXT', json: false, pk: 1 },
        { name: 'title', type: 'TEXT', json: false },
        { name: 'created_time', type: 'INTEGER', json: false },
        { name: 'db_updated_at', type: 'TEXT', json: false },
      ],
    })
    expect(listColumnsFor(zhihu)).not.toContain('content_id')
    expect(listColumnsFor(zhihu)).toContain('created_time')
    expect(listColumnsFor(zhihu)).toContain('db_updated_at')
  })

  it('declares a readable relation for join tables', () => {
    const relation = tableRelation('twitter_like')
    expect(relation?.table).toBe('twitter_tweet')
    expect(relation?.label).toBe('推文')
    expect(relation?.timeColumn).toBe('created_at')
  })

  it('exposes configured hidden columns', () => {
    expect(hiddenColumnsFor('zhihu_content').has('body_html')).toBe(true)
    expect(hiddenColumnsFor('future_table').size).toBe(0)
  })

  it('uses a gallery for Bangumi and Bilibili only', () => {
    expect(tableLayout('bangumi_collection')).toBe('gallery')
    expect(tableLayout('bilibili_media')).toBe('gallery')
    expect(tableLayout('zhihu_content')).toBe('table')
    expect(galleryFor('bangumi_collection')?.title).toContain('subject_json.name_cn')
    expect(galleryFor('bilibili_media')?.folders).toBe(true)
  })

  it('declares Bangumi facets and JSON search columns', () => {
    expect(facetsFor('bangumi_collection').map((facet) => facet.column)).toEqual([
      'type',
      'subject_type',
    ])
    expect(facetsFor('bangumi_collection')[0]?.options[0]).toEqual({
      value: 1,
      label: '想看',
    })
    expect(searchColumnsFor('bangumi_collection')).toEqual(['subject_json', 'comment'])
    expect(searchColumnsFor('zhihu_content')).toBeUndefined()
  })

  it('declares virtual columns and Bilibili folder joins', () => {
    expect(virtualColumnsFor('bangumi_collection')[0]?.name).toBe('subject_title')
    expect(virtualColumnsFor('bilibili_media')[0]?.kind).toBe('folders')
    const folders = foldersFor('bilibili_media')
    expect(folders?.linkTable).toBe('bilibili_fav_item')
    expect(folders?.folderTable).toBe('bilibili_fav')
    expect(folders?.linkTimeColumn).toBe('fav_time')
  })
})
