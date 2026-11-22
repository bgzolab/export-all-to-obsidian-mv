import { describe, expect, it } from 'vitest'

import {
  columnLabel,
  durationUnitFor,
  isBooleanColumn,
  operationLabel,
  statusLabel,
  valueLabelFor,
} from './columns'

describe('column display config', () => {
  it('translates known columns and falls back to the raw name', () => {
    expect(columnLabel('github_star', 'stargazers_count')).toBe('Stars')
    expect(columnLabel('bangumi_collection', 'type')).toBe('收藏类型')
    expect(columnLabel('future_table', 'mystery')).toBe('mystery')
  })

  it('maps platform-specific values', () => {
    expect(valueLabelFor('bangumi_collection', 'type', 2)).toBe('看过')
    expect(valueLabelFor('zhihu_content', 'type', 'answer')).toBe('回答')
    expect(valueLabelFor('v2ex_thanks', 'content_kind', 'reply')).toBe('回复')
    expect(valueLabelFor('github_star', 'language', 'C')).toBeUndefined()
  })

  it('recognises booleans and duration columns', () => {
    expect(isBooleanColumn('is_saved')).toBe(true)
    expect(isBooleanColumn('from_cnblogs')).toBe(true)
    expect(isBooleanColumn('title')).toBe(false)
    expect(durationUnitFor('bilibili_media', 'duration')).toBe('s')
    expect(durationUnitFor('netease_song', 'duration')).toBe('ms')
  })

  it('labels sync vocabulary', () => {
    expect(statusLabel('partial')).toBe('部分完成')
    expect(operationLabel('likes')).toBe('喜欢')
  })
})
