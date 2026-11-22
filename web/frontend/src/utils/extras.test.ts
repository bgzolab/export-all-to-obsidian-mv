import { describe, expect, it } from 'vitest'

import type { TableMeta } from '@/api/types'
import { BILIBILI_FOLDERS } from '@/config/tables'
import { foldersBySourceKey, sourceEntries, specColumnName, specTextFor } from './extras'

const linkTable: TableMeta = {
  name: 'bilibili_fav_item',
  platform: 'bilibili',
  kind: 'projection',
  row_count: 1,
  primary_key: ['fav_id', 'media_id'],
  columns: [
    { name: 'fav_id', type: 'INTEGER', json: false, pk: 1 },
    { name: 'media_id', type: 'INTEGER', json: false, pk: 2 },
    { name: 'fav_time', type: 'INTEGER', json: false },
  ],
}

describe('folder enrichment', () => {
  it('groups favorite folders and times by media id', () => {
    const folders = foldersBySourceKey(
      BILIBILI_FOLDERS,
      [
        { media_id: 42, fav_id: 7, fav_time: 1700000000 },
        { media_id: 42, fav_id: 8, fav_time: 1700000100 },
      ],
      [
        { fav_id: 7, title: '默认收藏夹' },
        { fav_id: 8, title: '稍后再看' },
      ],
      linkTable,
    )
    expect(folders.get('42')).toHaveLength(2)
    expect(folders.get('42')?.[0]?.folder).toBe('默认收藏夹')
    expect(folders.get('42')?.[0]?.time).toContain('2023')
  })

  it('keeps a readable placeholder when the folder row is missing', () => {
    const folders = foldersBySourceKey(
      BILIBILI_FOLDERS,
      [{ media_id: 42, fav_id: 99, fav_time: null }],
      [],
      linkTable,
    )
    expect(folders.get('42')?.[0]).toEqual({ folder: '收藏夹信息缺失', time: '' })
  })
})

describe('source summaries', () => {
  it('formats columns and JSON paths with table metadata', () => {
    const table: TableMeta = {
      name: 'v2ex_reply',
      platform: 'v2ex',
      kind: 'projection',
      row_count: 1,
      primary_key: ['reply_id'],
      columns: [
        { name: 'reply_id', type: 'INTEGER', json: false, pk: 1 },
        { name: 'thanks', type: 'INTEGER', json: false },
        { name: 'member_json', type: 'TEXT', json: true },
      ],
    }
    const row = { reply_id: 1, thanks: 3, member_json: { username: 'alice' } }
    expect(specColumnName({ column: 'member_json', path: ['username'] })).toBe('member_json')
    expect(specTextFor(table, row, 'thanks')).toBe('3')
    expect(specTextFor(table, row, { column: 'member_json', path: ['username'] })).toBe('alice')
    expect(specTextFor(table, row, { column: 'thanks', label: '感谢' })).toBe('3')
  })

  it('summarizes counts and latest time per source table', () => {
    const tables: TableMeta[] = [
      {
        name: 'twitter_like',
        platform: 'twitter',
        kind: 'projection',
        row_count: 1,
        primary_key: ['tweet_id'],
        columns: [
          { name: 'tweet_id', type: 'TEXT', json: false, pk: 1 },
          { name: 'db_updated_at', type: 'TEXT', json: false },
        ],
      },
      {
        name: 'twitter_bookmark',
        platform: 'twitter',
        kind: 'projection',
        row_count: 1,
        primary_key: ['tweet_id'],
        columns: [
          { name: 'tweet_id', type: 'TEXT', json: false, pk: 1 },
          { name: 'db_updated_at', type: 'TEXT', json: false },
        ],
      },
    ]
    const entries = sourceEntries(
      [
        {
          table: 'twitter_like',
          column: 'tweet_id',
          label: '喜欢',
          timeColumn: 'db_updated_at',
          timeLabel: '同步',
        },
        {
          table: 'twitter_bookmark',
          column: 'tweet_id',
          label: '书签',
          timeColumn: 'db_updated_at',
          timeLabel: '同步',
        },
      ],
      new Map([
        ['twitter_like', [{ db_updated_at: '2026-11-20 10:00:00' }]],
        [
          'twitter_bookmark',
          [
            { db_updated_at: '2026-11-19 10:00:00' },
            { db_updated_at: '2026-11-21 10:00:00' },
          ],
        ],
      ]),
      tables,
    )
    expect(entries).toEqual([
      { label: '喜欢', count: 1, time: '2026-11-20 10:00:00', timeLabel: '同步' },
      { label: '书签', count: 2, time: '2026-11-21 10:00:00', timeLabel: '同步' },
    ])
  })
})
