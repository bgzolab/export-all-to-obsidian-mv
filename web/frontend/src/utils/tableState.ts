/**
 * Per-tab table state that does not belong in the URL: the last query for a
 * table and the scroll offset for one table+query pair. The URL still owns the
 * visible state, so a copied link keeps working; this only makes returning to a
 * table (sidebar, detail back button, browser back) feel continuous.
 */

const QUERY_PREFIX = 'eto:table:query:'
const SCROLL_PREFIX = 'eto:table:scroll:'

// Tests run without a browser; the same module also survives Safari private
// mode, where touching sessionStorage can throw.
const fallback = new Map<string, string>()

function storage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.sessionStorage
  } catch {
    return undefined
  }
}

function read(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? fallback.get(key) ?? null
  } catch {
    return fallback.get(key) ?? null
  }
}

function write(key: string, value: string): void {
  fallback.set(key, value)
  try {
    storage()?.setItem(key, value)
  } catch {
    // The in-memory copy still covers this page load.
  }
}

function remove(key: string): void {
  fallback.delete(key)
  try {
    storage()?.removeItem(key)
  } catch {
    // Ignore storage failures; there is nothing else to clean up.
  }
}

/** Normalize the router query into the string map stored in sessionStorage. */
export function tableQuery(query: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string') result[key] = value
  }
  return result
}

/** Stable key for scroll memory; sort keys so route-object order cannot change it. */
export function tableQueryKey(query: Record<string, unknown>): string {
  const values = tableQuery(query)
  const params = new URLSearchParams()
  for (const key of Object.keys(values).sort()) params.set(key, values[key])
  return params.toString()
}

export function rememberTableQuery(table: string, query: Record<string, unknown>): void {
  const text = tableQueryKey(query)
  if (text) write(`${QUERY_PREFIX}${table}`, text)
  else remove(`${QUERY_PREFIX}${table}`)
}

export function rememberedTableQuery(table: string): Record<string, string> {
  const text = read(`${QUERY_PREFIX}${table}`) ?? ''
  return Object.fromEntries(new URLSearchParams(text))
}

export function rememberTableScroll(table: string, queryKey: string, top: number): void {
  const key = `${SCROLL_PREFIX}${table}?${queryKey}`
  if (top > 0) write(key, String(Math.round(top)))
  else remove(key)
}

export function rememberedTableScroll(table: string, queryKey: string): number {
  const value = Number(read(`${SCROLL_PREFIX}${table}?${queryKey}`) ?? 0)
  return Number.isFinite(value) && value > 0 ? value : 0
}
