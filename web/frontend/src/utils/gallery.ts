import type { TableMeta } from '@/api/types'
import { detailFieldValue } from '@/config/details'
import type { DetailFieldSpec } from '@/config/details-types'
import type { FolderSpec, GalleryConfig } from '@/config/tables'
import type { FolderEntry } from './extras'
import { formatCellValue } from './format'

export interface GalleryCard {
  cover: string
  title: string
  subtitle: string
  badges: string[]
  meta: Array<{ label: string; value: string }>
  folders: FolderEntry[]
}

function specColumn(spec: string | DetailFieldSpec): string {
  return typeof spec === 'string' ? spec.split('.', 1)[0] : spec.column
}

function isDerived(spec: string | DetailFieldSpec): boolean {
  return typeof spec === 'string' ? spec.includes('.') : Boolean(spec.path?.length)
}

function specText(
  table: TableMeta,
  row: Record<string, unknown>,
  spec: string | DetailFieldSpec,
): string {
  const value = detailFieldValue(row, spec)
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'object') return ''
  if (typeof value === 'string' && /^https?:\/\//i.test(value)) return value
  const column = table.columns.find((item) => item.name === specColumn(spec))
  const text =
    column && !isDerived(spec)
      ? formatCellValue(table.name, column, value)
      : String(value)
  return text === '—' ? '' : text
}

function firstText(
  table: TableMeta,
  row: Record<string, unknown>,
  specs: Array<string | DetailFieldSpec> | undefined,
): string {
  for (const spec of specs ?? []) {
    const value = detailFieldValue(row, spec)
    if (value === null || value === undefined || value === '') continue
    const text = specText(table, row, spec)
    if (text) return text
  }
  return ''
}

function coverUrl(table: TableMeta, row: Record<string, unknown>, config: GalleryConfig): string {
  const raw = firstText(table, row, config.cover)
  if (!raw) return ''
  if (raw.startsWith('//')) return `https:${raw}`
  return raw
}

/** One card value object; pure so it can be tested without mounting Vue. */
export function galleryCard(
  table: TableMeta,
  config: GalleryConfig,
  row: Record<string, unknown>,
  options: {
    folders?: Map<string, FolderEntry[]>
    folderSpec?: FolderSpec
  } = {},
): GalleryCard {
  const title = firstText(table, row, config.title) || '未命名'
  const subtitle = firstText(table, row, config.subtitle)
  const badges = [
    ...new Set((config.badges ?? []).map((spec) => specText(table, row, spec)).filter(Boolean)),
  ]
  const meta = (config.meta ?? [])
    .map((item) => ({ label: item.label, value: specText(table, row, item.spec) }))
    .filter((item) => item.value)

  let folders: FolderEntry[] = []
  if (config.folders && options.folderSpec && options.folders) {
    const key = row[options.folderSpec.linkColumn]
    if (key !== null && key !== undefined) {
      folders = options.folders.get(String(key)) ?? []
    }
  }

  return {
    cover: coverUrl(table, row, config),
    title,
    subtitle: subtitle === title ? '' : subtitle,
    badges,
    meta,
    folders,
  }
}

/** Stable Vue key for a card row, including composite primary keys. */
export function galleryRowKey(table: TableMeta, row: Record<string, unknown>): string {
  return table.primary_key.map((name) => String(row[name] ?? '')).join('|')
}

/** Used by the card title fallback when no cover is available. */
export function coverInitial(title: string): string {
  return title.trim().slice(0, 1) || '?'
}
