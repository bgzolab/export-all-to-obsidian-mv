import { describe, expect, it } from 'vitest'

import {
  detailConfigFor,
  detailFieldValue,
  detailUrl,
  firstDetailValue,
} from './details'

describe('detail config', () => {
  const row = {
    title: '标题',
    subject_json: { name: '原名', name_cn: '中文名', images: { large: 'https://img.test/a.jpg' } },
    rating_json: { score: 7.5 },
    subject_id: 12,
    url: 'https://example.test/a',
  }

  it('walks JSON paths, including array indexes and dot shortcuts', () => {
    expect(detailFieldValue(row, { column: 'subject_json', path: ['name_cn'] })).toBe('中文名')
    expect(detailFieldValue(row, 'rating_json.score')).toBe(7.5)
    expect(detailFieldValue(row, 'subject_json.images.large')).toBe('https://img.test/a.jpg')
    expect(detailFieldValue(row, 'missing.path')).toBeUndefined()
  })

  it('uses the first non-empty title candidate', () => {
    expect(firstDetailValue(row, ['subject_json.name_cn', 'subject_json.name'])).toBe('中文名')
    expect(firstDetailValue(row, ['missing', 'title'])).toBe('标题')
  })

  it('builds templated external links', () => {
    expect(detailUrl(row, { column: 'subject_id', template: 'https://bgm.tv/subject/{value}' })).toBe(
      'https://bgm.tv/subject/12',
    )
    expect(detailUrl(row, 'url')).toBe('https://example.test/a')
    expect(detailUrl({ url: 'bilibili://video/1' }, 'url')).toBeUndefined()
  })

  it('has platform layouts for content tables', () => {
    expect(detailConfigFor('zhihu_content')?.content).toEqual(['body_html'])
    expect(detailConfigFor('twitter_like')?.preview?.table).toBe('twitter_tweet')
    expect(detailConfigFor('future_table')).toBeUndefined()
  })
})
