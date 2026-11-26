import { describe, expect, it } from 'vitest'

import type { ColumnMeta } from '@/api/types'

import { collectImageUrls, renderKindFor, timeUnitFor } from './renderers'

function column(
  name: string,
  type = 'TEXT',
  options: Partial<ColumnMeta> = {},
): ColumnMeta {
  return { name, type, json: false, ...options }
}

describe('renderer selection', () => {
  it('uses explicit per-table overrides', () => {
    expect(renderKindFor('zhihu_content', column('body_html'))).toBe('html')
    expect(renderKindFor('github_star', column('readme'))).toBe('markdown')
    expect(renderKindFor('bilibili_media', column('cover'))).toBe('image')
    expect(renderKindFor('weibo_post', column('pic_infos_json', 'TEXT'))).toBe('images')
  })

  it('falls back to name heuristics for unknown tables', () => {
    expect(renderKindFor('future_table', column('metadata_json', 'TEXT', { json: true }))).toBe(
      'json',
    )
    expect(renderKindFor('future_table', column('avatar'))).toBe('image')
    expect(renderKindFor('future_table', column('content_rendered'))).toBe('html')
    expect(renderKindFor('future_table', column('readme'))).toBe('markdown')
    expect(renderKindFor('future_table', column('created_at'))).toBe('datetime')
  })

  it('links response ids and foreign response ids', () => {
    expect(renderKindFor('v2ex_topic', column('response_id', 'INTEGER'))).toBe('response_id')
    expect(renderKindFor('github_star', column('readme_response_id', 'INTEGER'))).toBe(
      'response_id',
    )
  })

  it('does not mistake JSON for a scalar', () => {
    expect(renderKindFor('twitter_tweet', column('author_json', 'TEXT', { json: true }))).toBe(
      'json',
    )
  })

  it('applies table-specific time units', () => {
    expect(timeUnitFor('qireader_entry', column('crawled_at', 'INTEGER'))).toBe('epoch_ms')
    expect(timeUnitFor('netease_play_record', column('play_time', 'INTEGER'))).toBe('epoch_ms')
    expect(timeUnitFor('zhihu_content', column('updated_time', 'INTEGER'))).toBe('epoch_s')
    expect(timeUnitFor('unknown_table', column('created_at', 'TEXT'))).toBe('iso')
  })
})

describe('image URL extraction', () => {
  it('collects nested image urls without duplicates', () => {
    const urls = collectImageUrls({
      large: 'https://example.com/a.jpg',
      common: 'https://example.com/a.jpg',
      list: [{ url: 'https://example.com/b.png' }, { not: 'https://example.com/page' }],
    })
    expect(urls).toEqual(['https://example.com/a.jpg', 'https://example.com/b.png'])
  })

  it('accepts a parsed JSON string', () => {
    expect(collectImageUrls('[{"large": "https://example.com/c.webp"}]')).toEqual([
      'https://example.com/c.webp',
    ])
  })

  it('returns an empty list for non-image values', () => {
    expect(collectImageUrls('plain text')).toEqual([])
  })
})
