export type TimeUnit = 'epoch_s' | 'epoch_ms' | 'epoch_ns' | 'iso' | 'raw'

/** Normalize an epoch value to milliseconds before constructing a Date. */
function epochMilliseconds(numeric: number, unit: TimeUnit): number {
  if (unit === 'epoch_ms') return numeric
  if (unit === 'epoch_ns') return numeric / 1e6
  return numeric * 1000
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * Convert an epoch value to the `datetime-local` input format in the browser's
 * timezone. The backend stores epoch seconds unless a column is explicitly
 * configured as milliseconds or nanoseconds.
 */
export function toDatetimeLocal(value: unknown, unit: TimeUnit = 'epoch_s'): string {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return ''
  const date = new Date(epochMilliseconds(numeric, unit))
  if (Number.isNaN(date.getTime())) return ''
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

/** Convert a `datetime-local` input back to the column's epoch unit. */
export function fromDatetimeLocal(value: string, unit: TimeUnit = 'epoch_s'): number | null {
  if (!value) return null
  const milliseconds = new Date(value).getTime()
  if (Number.isNaN(milliseconds)) return null
  // Nanosecond precision is below Number's safe integer range; callers only use
  // this for display-side filtering, never to write data back.
  if (unit === 'epoch_ns') return milliseconds * 1e6
  return unit === 'epoch_ms' ? milliseconds : Math.floor(milliseconds / 1000)
}

/** Format a stored timestamp for display; invalid values fall back to the raw string. */
export function formatTime(value: unknown, unit: TimeUnit = 'epoch_s'): string {
  if (value === null || value === undefined || value === '') return '—'
  if (unit === 'raw') return String(value)

  let date: Date
  if (unit === 'epoch_s' || unit === 'epoch_ms' || unit === 'epoch_ns') {
    const numeric = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(numeric)) return String(value)
    date = new Date(epochMilliseconds(numeric, unit))
  } else {
    date = new Date(String(value))
  }
  if (Number.isNaN(date.getTime())) return String(value)
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  )
}
