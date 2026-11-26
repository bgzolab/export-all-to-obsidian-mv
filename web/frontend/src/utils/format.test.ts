import { describe, expect, it } from 'vitest'

import type { ColumnMeta } from '@/api/types'
import {
  decodeStoredText,
  formatCellValue,
  formatCompact,
  formatDuration,
  formatRelative,
  stripHtml,
} from './format'

function column(name: string, overrides: Partial<ColumnMeta> = {}): ColumnMeta {
  return { name, type: 'TEXT', json: false, ...overrides }
}

describe('format helpers', () => {
  it('formats durations from seconds and milliseconds', () => {
    expect(formatDuration(1144, 's')).toBe('19:04')
    expect(formatDuration(266373, 'ms')).toBe('4:26')
    expect(formatDuration(3723, 's')).toBe('1:02:03')
    expect(formatDuration(null, 's')).toBe('—')
  })

  it('formats cell values by type, dictionary and id', () => {
    expect(formatCellValue('bilibili_media', column('media_id', { type: 'INTEGER' }), 24722)).toBe(
      '24722',
    )
    expect(formatCellValue('bilibili_media', column('duration', { type: 'INTEGER' }), 1144)).toBe(
      '19:04',
    )
    expect(formatCellValue('zhihu_content', column('type'), 'answer')).toBe('回答')
    expect(formatCellValue('bangumi_collection', column('rate', { type: 'INTEGER' }), 0)).toBe(
      '未评分',
    )
    expect(formatCellValue('github_star', column('archived', { type: 'INTEGER' }), 0)).toBe('否')
    expect(formatCellValue('twitter_like', column('response_id', { type: 'INTEGER' }), 12)).toBe(
      '#12',
    )
    expect(formatCellValue('github_star', column('stargazers_count', { type: 'INTEGER' }), 14597)).toBe(
      '14,597',
    )
  })

  it('keeps compact numbers readable', () => {
    expect(formatCompact(112147)).toBe('11.2万')
    expect(formatCompact(42)).toBe('42')
  })

  it('strips markup for previews', () => {
    expect(stripHtml('<p>Hello&nbsp;<strong>world</strong></p>')).toBe('Hello world')
  })

  it('decodes one JSON string layer from stored text', () => {
    expect(decodeStoredText('"<p class=\\"x\\">hi</p>\\n<p>next</p>"')).toBe(
      '<p class="x">hi</p>\n<p>next</p>',
    )
    expect(decodeStoredText('plain text')).toBe('plain text')
    expect(decodeStoredText('not "json"')).toBe('not "json"')
    expect(decodeStoredText(42)).toBe('42')
    expect(decodeStoredText(null)).toBe('')
  })

  it('uses a relative label for recent sync times', () => {
    const now = Date.parse('2026-11-20T12:00:00Z')
    expect(formatRelative('2026-11-20T11:58:00Z', now)).toBe('2分钟前')
    expect(formatRelative('2026-11-20T09:00:00Z', now)).toBe('3小时前')
  })
})
