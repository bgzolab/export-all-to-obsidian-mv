import type { ColumnMeta } from '@/api/types'
import {
  durationUnitFor,
  isBooleanColumn,
  isIdColumn,
  valueLabelFor,
} from '@/config/columns'
import { renderKindFor, timeUnitFor } from './renderers'
import { formatTime } from './time'

const NUMBER_FORMAT = new Intl.NumberFormat('zh-CN')
const COMPACT_FORMAT = new Intl.NumberFormat('zh-CN', {
  notation: 'compact',
  maximumFractionDigits: 1,
})
const RELATIVE_FORMAT = new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' })

export function formatNumber(value: unknown): string {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? NUMBER_FORMAT.format(numeric) : String(value ?? '')
}

/** 1.1万 for large dashboard stats; four-digit values keep grouping. */
export function formatCompact(value: unknown): string {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return String(value ?? '')
  return Math.abs(numeric) < 10000 ? NUMBER_FORMAT.format(numeric) : COMPACT_FORMAT.format(numeric)
}

export function formatDuration(value: unknown, unit: 's' | 'ms'): string {
  if (value === null || value === undefined || value === '') return '—'
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) return '—'
  const totalSeconds = Math.round(unit === 'ms' ? numeric / 1000 : numeric)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const tail = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  return hours ? `${hours}:${tail}` : `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function formatRelative(value: string | null | undefined, now = Date.now()): string {
  if (!value) return '从未同步'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const diffSeconds = Math.round((date.getTime() - now) / 1000)
  const absolute = Math.abs(diffSeconds)
  if (absolute < 60) return '刚刚'
  if (absolute < 3600) return RELATIVE_FORMAT.format(Math.round(diffSeconds / 60), 'minute')
  if (absolute < 86400) return RELATIVE_FORMAT.format(Math.round(diffSeconds / 3600), 'hour')
  if (absolute < 86400 * 30) return RELATIVE_FORMAT.format(Math.round(diffSeconds / 86400), 'day')
  return formatTime(value, 'iso').slice(0, 10)
}

/** One string per table cell; view-specific styling is applied by CellValue. */
export function formatCellValue(table: string, column: ColumnMeta, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'

  const durationUnit = durationUnitFor(table, column.name)
  if (durationUnit) return formatDuration(value, durationUnit)

  if (isBooleanColumn(column.name)) return value ? '是' : '否'

  const mapped = valueLabelFor(table, column.name, value)
  if (mapped) return mapped

  if (column.name === 'rate') return Number(value) > 0 ? `${value} 分` : '未评分'

  const kind = renderKindFor(table, column)
  if (kind === 'datetime') return formatTime(value, timeUnitFor(table, column))
  if (kind === 'json') return 'JSON'
  if (kind === 'response_id') return `#${value}`

  if (typeof value === 'number') {
    if (isIdColumn(column.name) || kind === 'tag' || kind === 'boolean') return String(value)
    return formatNumber(value)
  }
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function stripHtml(text: string): string {
  return text
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text
}
