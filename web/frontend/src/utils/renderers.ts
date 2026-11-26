import type { ColumnMeta } from '@/api/types'
import { fieldRenderOverride, timeUnitOverride } from '@/config/tables'
import { durationUnitFor, isBooleanColumn } from '@/config/columns'
import type { TimeUnit } from '@/utils/time'

export type RenderKind =
  | 'text'
  | 'html'
  | 'markdown'
  | 'image'
  | 'images'
  | 'json'
  | 'datetime'
  | 'duration'
  | 'boolean'
  | 'response_id'
  | 'tag'
  | 'link'

const TIME_NAMES = new Set([
  'created',
  'created_at',
  'created_time',
  'updated_at',
  'updated_time',
  'last_modified',
  'last_touched',
  'date',
  'timestamp',
  'time',
  'started_at',
  'finished_at',
  'fetched_at',
  'published_at',
  'crawled_at',
  'starred_at',
  'updated',
  'pushed_at',
  'create_time',
  'update_time',
  'track_update_time',
  'publish_time',
  'play_time',
  'fav_time',
  'ctime',
  'mtime',
  'pubtime',
  'thanked_at',
])

const IMAGE_NAMES = new Set(['cover', 'avatar', 'cover_img_url', 'image', 'thumbnail'])
const IMAGES_NAMES = new Set(['images_json', 'pic_infos_json', 'attachments_json'])
const LINK_NAMES = new Set(['url', 'html_url', 'link', 'link_url', 'source_url'])
const TAG_NAMES = new Set(['type', 'status', 'syntax'])
const HTML_NAMES = new Set(['body_html', 'content_rendered'])

function isTimeColumn(column: ColumnMeta): boolean {
  if (TIME_NAMES.has(column.name)) return true
  return /(_time|_at|_date|_ts)$/.test(column.name)
}

export function renderKindFor(table: string, column: ColumnMeta): RenderKind {
  const override = fieldRenderOverride(table, column.name)
  if (override) return override

  if (column.name === 'response_id' || column.name.endsWith('_response_id')) {
    return 'response_id'
  }
  if (column.json || column.name === 'request') return 'json'
  if (durationUnitFor(table, column.name)) return 'duration'
  if (IMAGES_NAMES.has(column.name)) return 'images'
  if (column.name === 'readme') return 'markdown'
  if (HTML_NAMES.has(column.name)) return 'html'
  if (IMAGE_NAMES.has(column.name)) return 'image'
  if (LINK_NAMES.has(column.name)) return 'link'
  if (TAG_NAMES.has(column.name)) return 'tag'
  if (isTimeColumn(column)) return 'datetime'
  if (isBooleanColumn(column.name)) return 'boolean'
  return 'text'
}

export function timeUnitFor(table: string, column: ColumnMeta): TimeUnit {
  const override = timeUnitOverride(table, column.name)
  if (override) return override
  // INTEGER timestamps in this schema are seconds; TEXT timestamps are ISO-like
  // strings. Tables with millisecond values are listed explicitly in config.
  return (column.type || '').toUpperCase().includes('INT') ? 'epoch_s' : 'iso'
}

/**
 * Collect image URLs from the various shapes the platforms store: a plain URL,
 * an array, or nested objects such as Weibo `pic_infos` and Bangumi `images`.
 */
export function collectImageUrls(value: unknown): string[] {
  const found: string[] = []
  const seen = new Set<string>()

  function looksLikeImage(text: string): boolean {
    return /^https?:\/\//i.test(text) && /\.(jpe?g|png|gif|webp|avif)(\?|$)/i.test(text)
  }

  function visit(current: unknown, key = '') {
    if (typeof current === 'string') {
      const trimmed = current.trim()
      // Some legacy rows still hold JSON as text even though the column is
      // marked as JSON; accept both shapes without double-parsing arrays.
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          visit(JSON.parse(trimmed), key)
          return
        } catch {
          // Not JSON after all; fall through to URL handling.
        }
      }
      if (!seen.has(current) && (looksLikeImage(current) || key === 'url' || key === 'src')) {
        seen.add(current)
        found.push(current)
      }
      return
    }
    if (Array.isArray(current)) {
      for (const item of current) visit(item)
      return
    }
    if (current && typeof current === 'object') {
      for (const [childKey, childValue] of Object.entries(current)) {
        visit(childValue, childKey)
      }
    }
  }

  visit(value)
  return found
}

/** Parse a JSON column value that may still be a string on older rows. */
export function asJsonValue(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}
