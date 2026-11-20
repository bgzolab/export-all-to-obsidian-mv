import { describe, expect, it } from 'vitest'

import { formatTime, fromDatetimeLocal, toDatetimeLocal } from './time'

// Keep formatting assertions stable regardless of the developer timezone.
process.env.TZ = 'UTC'

describe('time formatting', () => {
  it('formats epoch seconds as a local datetime', () => {
    expect(formatTime(1700000000, 'epoch_s')).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  it('formats epoch milliseconds', () => {
    expect(formatTime(1700000000000, 'epoch_ms')).toMatch(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
    )
  })

  it('formats ISO strings', () => {
    const formatted = formatTime('2026-11-20T10:20:30Z', 'iso')
    expect(formatted).toMatch(/^2026-11-20 \d{2}:\d{2}:\d{2}$/)
  })

  it('keeps unparseable values readable', () => {
    expect(formatTime('not a date', 'iso')).toBe('not a date')
    expect(formatTime('123', 'raw')).toBe('123')
    expect(formatTime(null, 'epoch_s')).toBe('—')
  })

  it('round-trips datetime-local input at minute precision', () => {
    const epoch = 1700000000 - (1700000000 % 60)
    expect(fromDatetimeLocal(toDatetimeLocal(epoch))).toBe(epoch)
  })

  it('returns null for invalid or empty input', () => {
    expect(fromDatetimeLocal('')).toBeNull()
    expect(fromDatetimeLocal('nope')).toBeNull()
    expect(toDatetimeLocal('nope')).toBe('')
  })
})
