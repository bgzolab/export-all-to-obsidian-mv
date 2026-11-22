import { describe, expect, it } from 'vitest'

import type { TableMeta } from '@/api/types'
import type { RelationConfig } from '@/config/tables'
import { relationDisplay, relationFieldColumn } from './relation'

const tweetRelation: RelationConfig = {
  localColumn: 'tweet_id',
  table: 'twitter_tweet',
  targetColumn: 'tweet_id',
  label: '推文',
  titles: ['full_text'],
  subtitle: { column: 'author_json', path: ['name'] },
  timeColumn: 'created_at',
}

const tweetTable: TableMeta = {
  name: 'twitter_tweet',
  platform: 'twitter',
  kind: 'projection',
  row_count: 1,
  primary_key: ['tweet_id'],
  columns: [
    { name: 'tweet_id', type: 'TEXT', json: false, pk: 1 },
    { name: 'full_text', type: 'TEXT', json: false },
    { name: 'author_json', type: 'TEXT', json: true },
    { name: 'created_at', type: 'TEXT', json: false },
  ],
}

describe('relation display', () => {
  it('resolves a target title, author and publish time', () => {
    const display = relationDisplay(
      tweetRelation,
      { tweet_id: '1' },
      {
        tweet_id: '1',
        full_text: 'hello world',
        author_json: { name: 'Alice' },
        created_at: '2026-11-20T12:00:00Z',
      },
      tweetTable,
    )
    expect(display.title).toBe('hello world')
    expect(display.meta).toContain('Alice')
    expect(display.meta).toContain('发布')
    expect(display.hasTarget).toBe(true)
  })

  it('falls back to an embedded snapshot when the target is missing', () => {
    const relation: RelationConfig = {
      localColumn: 'song_id',
      table: 'netease_song',
      targetColumn: 'song_id',
      label: '歌曲',
      titles: ['name'],
      subtitle: { column: 'artists_json', path: [0, 'name'] },
      timeColumn: 'publish_time',
      fallbackTitles: [{ column: 'song_json', path: ['name'] }],
      fallbackSubtitle: { column: 'song_json', path: ['ar', 0, 'name'] },
    }
    const display = relationDisplay(
      relation,
      { song_id: 1, song_json: { name: '回不去的回忆', ar: [{ name: '小男孩乐团' }] } },
      undefined,
      undefined,
    )
    expect(display.title).toBe('回不去的回忆')
    expect(display.meta).toBe('小男孩乐团')
    expect(display.hasTarget).toBe(false)
  })

  it('marks missing and failed relations without showing a bare id', () => {
    expect(relationDisplay(tweetRelation, { tweet_id: '1' }, undefined, tweetTable).title).toBe(
      '关联记录缺失',
    )
    expect(
      relationDisplay(tweetRelation, { tweet_id: '1' }, undefined, tweetTable, true).title,
    ).toBe('关联内容加载失败')
  })

  it('extracts base columns from simple and path specs', () => {
    expect(relationFieldColumn('author_json.name')).toBe('author_json')
    expect(relationFieldColumn({ column: 'song_json', path: ['ar', 0, 'name'] })).toBe('song_json')
  })
})
