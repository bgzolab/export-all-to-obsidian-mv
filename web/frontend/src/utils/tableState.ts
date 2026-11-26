/**
 * Per-tab table state that does not belong in the URL: the last query for a
 * table and the scroll offset for one table+query pair. The URL still owns the
 * visible state, so a copied link keeps working; this only makes returning to a
 * table (sidebar, detail back button, browser back) feel continuous.
 */

import type { QueryRequest } from '@/api/types'

const QUERY_PREFIX = 'eto:table:query:'
const SCROLL_PREFIX = 'eto:table:scroll:'
const PAGE_PREFIX = 'eto:detail:page:'

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

/**
 * The page a detail view was opened from. Storing the exact query request means
 * "上一条 / 下一条" can cross a page boundary with the same sort, filters and
 * search instead of falling back to an unfiltered list.
 */
export interface DetailPageState {
  request: QueryRequest
  total: number
  pks: Array<Record<string, unknown>>
}

export function rememberDetailPage(table: string, page: DetailPageState): void {
  write(`${PAGE_PREFIX}${table}`, JSON.stringify(page))
}

export function rememberedDetailPage(table: string): DetailPageState | null {
  const text = read(`${PAGE_PREFIX}${table}`)
  if (!text) return null
  try {
    const parsed = JSON.parse(text) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const record = parsed as Record<string, unknown>
    if (!record.request || typeof record.request !== 'object') return null
    const total = Number(record.total)
    const pks = Array.isArray(record.pks)
      ? record.pks.filter(
          (pk): pk is Record<string, unknown> =>
            Boolean(pk) && typeof pk === 'object' && !Array.isArray(pk),
        )
      : []
    return {
      request: record.request as QueryRequest,
      total: Number.isFinite(total) ? total : 0,
      pks,
    }
  } catch {
    return null
  }
}

/** Locate the open row inside the remembered page; ids compare as strings. */
export function detailPageIndex(
  pks: Array<Record<string, unknown>>,
  pk: Record<string, unknown>,
): number {
  const names = Object.keys(pk)
  if (!names.length) return -1
  return pks.findIndex((candidate) => {
    if (Object.keys(candidate).length !== names.length) return false
    return names.every((name) => String(candidate[name]) === String(pk[name]))
  })
}

export type DetailMove =
  | { type: 'none' }
  | { type: 'row'; pk: Record<string, unknown> }
  | { type: 'page'; offset: number }

/**
 * Resolve a prev/next step. A step off the current page returns the neighbouring
 * page offset; the detail view then fetches it with the stored query.
 */
export function detailMove(
  page: DetailPageState,
  pk: Record<string, unknown>,
  direction: 'prev' | 'next',
): DetailMove {
  const index = detailPageIndex(page.pks, pk)
  if (index < 0) return { type: 'none' }

  const offset = page.request.offset ?? 0
  const limit = page.request.limit ?? 50
  if (direction === 'prev') {
    if (index > 0) return { type: 'row', pk: page.pks[index - 1] }
    return offset > 0 ? { type: 'page', offset: Math.max(0, offset - limit) } : { type: 'none' }
  }
  if (index < page.pks.length - 1) return { type: 'row', pk: page.pks[index + 1] }
  return offset + limit < page.total ? { type: 'page', offset: offset + limit } : { type: 'none' }
}
