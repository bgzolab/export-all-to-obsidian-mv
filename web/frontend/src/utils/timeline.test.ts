import { describe, expect, it } from 'vitest'

import type { TimelineHeatmapDay } from '@/api/types'
import { heatmapLevel, heatmapMonths, heatmapThresholds } from './timeline'

function days(counts: Array<[string, number]>): TimelineHeatmapDay[] {
  return counts.map(([date, count]) => ({ date, count }))
}

describe('timeline heatmap helpers', () => {
  it('builds quantile thresholds ignoring empty days', () => {
    const thresholds = heatmapThresholds(
      days([
        ['2026-11-01', 0],
        ['2026-11-02', 1],
        ['2026-11-03', 2],
        ['2026-11-04', 3],
        ['2026-11-05', 4],
        ['2026-11-06', 10],
        ['2026-11-07', 20],
      ]),
    )
    expect(thresholds).toEqual([2, 4, 10, 20])
    expect(heatmapLevel(0, thresholds)).toBe(0)
    expect(heatmapLevel(1, thresholds)).toBe(1)
    expect(heatmapLevel(3, thresholds)).toBe(2)
    expect(heatmapLevel(10, thresholds)).toBe(3)
    expect(heatmapLevel(11, thresholds)).toBe(4)
  })

  it('returns zero thresholds when nothing was collected', () => {
    const thresholds = heatmapThresholds(days([['2026-11-01', 0]]))
    expect(thresholds).toEqual([0, 0, 0, 0])
    expect(heatmapLevel(0, thresholds)).toBe(0)
  })

  it('groups months by their first and last week', () => {
    const dates = [
      '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07',
      '2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14',
      '2026-12-06', '2026-12-07',
    ]
    expect(heatmapMonths(days(dates.map((date) => [date, 0])))).toEqual([
      { key: '2026-11', label: '11月', startWeek: 0, endWeek: 1 },
      { key: '2026-12', label: '12月', startWeek: 2, endWeek: 2 },
    ])
  })
})
