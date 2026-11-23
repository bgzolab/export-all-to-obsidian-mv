import { describe, expect, it } from 'vitest'

import {
  rememberTableQuery,
  rememberTableScroll,
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
