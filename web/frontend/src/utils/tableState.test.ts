import { describe, expect, it } from 'vitest'

import {
  detailMove,
  detailPageIndex,
  rememberDetailPage,
  rememberTableQuery,
  rememberTableScroll,
  rememberedDetailPage,
  rememberedTableQuery,
  rememberedTableScroll,
  tableQuery,
  tableQueryKey,
} from './tableState'

describe('table state memory', () => {
  it('round-trips the last query for a table', () => {
    rememberTableQuery('memory_a', { offset: '50', q: 'hello', filters: '[{"column":"x"}]' })
    expect(rememberedTableQuery('memory_a')).toEqual({
      offset: '50',
      q: 'hello',
      filters: '[{"column":"x"}]',
    })
  })

  it('drops non-string router values and clears an empty query', () => {
    expect(tableQuery({ a: '1', b: ['2'], c: undefined })).toEqual({ a: '1' })
    rememberTableQuery('memory_b', { q: 'x' })
    rememberTableQuery('memory_b', {})
    expect(rememberedTableQuery('memory_b')).toEqual({})
  })

  it('keeps scroll offsets per table and query', () => {
    const key = tableQueryKey({ offset: '100' })
    expect(tableQueryKey({ q: 'x', offset: '100' })).toBe(tableQueryKey({ offset: '100', q: 'x' }))
    rememberTableScroll('memory_c', key, 420)
    expect(rememberedTableScroll('memory_c', key)).toBe(420)
    expect(rememberedTableScroll('memory_c', tableQueryKey({ offset: '0' }))).toBe(0)
    rememberTableScroll('memory_c', key, 0)
    expect(rememberedTableScroll('memory_c', key)).toBe(0)
  })
})

describe('detail page navigation', () => {
  const page = {
    request: { columns: ['id'], limit: 2, offset: 4 },
    total: 7,
    pks: [{ id: 5 }, { id: 6 }],
  }

  it('round-trips the page request and primary keys', () => {
    rememberDetailPage('memory_detail_a', page)
    expect(rememberedDetailPage('memory_detail_a')).toEqual(page)
    expect(rememberedDetailPage('memory_detail_missing')).toBeNull()
  })

  it('finds rows by primary key with string or numeric ids', () => {
    expect(detailPageIndex(page.pks, { id: 6 })).toBe(1)
    expect(detailPageIndex(page.pks, { id: '5' })).toBe(0)
    expect(detailPageIndex(page.pks, { id: 9 })).toBe(-1)
  })

  it('moves inside the page before crossing a page boundary', () => {
    expect(detailMove(page, { id: 5 }, 'next')).toEqual({ type: 'row', pk: { id: 6 } })
    expect(detailMove(page, { id: 6 }, 'prev')).toEqual({ type: 'row', pk: { id: 5 } })
    expect(detailMove(page, { id: 5 }, 'prev')).toEqual({ type: 'page', offset: 2 })
    expect(detailMove(page, { id: 6 }, 'next')).toEqual({ type: 'page', offset: 6 })
  })

  it('stops at the first and last page', () => {
    const first = { ...page, request: { ...page.request, offset: 0 } }
    const last = { ...page, request: { ...page.request, offset: 6 } }
    expect(detailMove(first, { id: 5 }, 'prev')).toEqual({ type: 'none' })
    expect(detailMove(last, { id: 6 }, 'next')).toEqual({ type: 'none' })
    expect(detailMove(page, { id: 99 }, 'next')).toEqual({ type: 'none' })
  })
})
