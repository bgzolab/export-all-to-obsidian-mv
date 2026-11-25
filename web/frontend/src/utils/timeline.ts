import type { TimelineHeatmapDay } from '@/api/types'

export interface HeatmapMonth {
  key: string
  label: string
  startWeek: number
  endWeek: number
}

/**
 * Quantile thresholds keep a single sync spike from washing out every other
 * day. Counts are already sorted, so each bound is one array lookup.
 */
export function heatmapThresholds(
  days: TimelineHeatmapDay[],
): [number, number, number, number] {
  const counts = days
    .map((day) => day.count)
    .filter((count) => count > 0)
    .sort((a, b) => a - b)
  if (!counts.length) return [0, 0, 0, 0]
  const at = (fraction: number) =>
    counts[Math.min(counts.length - 1, Math.floor(fraction * counts.length))]
  return [at(0.25), at(0.5), at(0.75), counts[counts.length - 1]]
}

export function heatmapLevel(
  count: number,
  thresholds: [number, number, number, number],
): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0
  if (count <= thresholds[0]) return 1
  if (count <= thresholds[1]) return 2
  if (count <= thresholds[2]) return 3
  return 4
}

/** Group a Sunday-first day list into month labels positioned by week. */
export function heatmapMonths(days: TimelineHeatmapDay[]): HeatmapMonth[] {
  const months: HeatmapMonth[] = []
  days.forEach((day, index) => {
    const key = day.date.slice(0, 7)
    const week = Math.floor(index / 7)
    const last = months[months.length - 1]
    if (last && last.key === key) {
      last.endWeek = week
      return
    }
    months.push({
      key,
      label: `${Number(key.slice(5))}月`,
      startWeek: week,
      endWeek: week,
    })
  })
  return months
}
