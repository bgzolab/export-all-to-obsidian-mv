import type { TableMeta } from '@/api/types'
import { detailFieldPrefix, detailFieldValue, firstDetailValue } from '@/config/details'
import type { DetailFieldSpec, DetailSourceSpec, FolderSpec } from '@/config/details-types'
import { formatCellValue } from './format'

export interface FolderEntry {
  folder: string
  time: string
}

export interface SourceEntry {
  label: string
  count: number
  time: string
  timeLabel: string
}

/** Base column name for a plain spec or a JSON-path spec. */
export function specColumnName(spec: string | DetailFieldSpec): string {
  return typeof spec === 'string' ? spec.split('.', 1)[0] : spec.column
}

/** Render one field with the table's value dictionaries and JSON paths. */
export function specTextFor(
  current: TableMeta,
  currentRow: Record<string, unknown>,
  spec: string | DetailFieldSpec,
): string {
  const value = detailFieldValue(currentRow, spec)
  if (value === undefined || value === null || value === '') return ''
  const column = current.columns.find((item) => item.name === specColumnName(spec))
  // A path read from a JSON column is already a scalar; passing it through
  // formatCellValue would label it "JSON" because the source column is JSON.
  const derived = typeof spec !== 'string' ? Boolean(spec.path?.length) : spec.includes('.')
  const text = derived
    ? String(value)
    : column
      ? formatCellValue(current.name, column, value)
      : String(value)
  return `${detailFieldPrefix(spec)}${text}`
}

/**
 * Group favorite-folder join rows by the primary entity key. Bilibili stores
 * the favorite time on `bilibili_fav_item` and the folder title on
 * `bilibili_fav`, so both queries are batched once per list page/detail.
 */
export function foldersBySourceKey(
  config: FolderSpec,
  linkRows: Array<Record<string, unknown>>,
  folderRows: Array<Record<string, unknown>>,
  linkTable: TableMeta | undefined,
): Map<string, FolderEntry[]> {
  const titles = new Map<string, string>()
  for (const row of folderRows) {
    const key = row[config.folderKeyColumn]
    if (key === null || key === undefined) continue
    const value = firstDetailValue(row, config.folderTitle)
    titles.set(String(key), value === undefined ? '' : String(value))
  }

  const timeColumn = config.linkTimeColumn
    ? linkTable?.columns.find((column) => column.name === config.linkTimeColumn)
    : undefined
  const linkTableName = linkTable?.name ?? config.linkTable
  const result = new Map<string, FolderEntry[]>()
  for (const row of linkRows) {
    const sourceKey = row[config.linkTargetColumn]
    if (sourceKey === null || sourceKey === undefined) continue
    const folderKey = row[config.linkKeyColumn]
    const title = folderKey === null || folderKey === undefined
      ? ''
      : (titles.get(String(folderKey)) ?? '')
    const rawTime = config.linkTimeColumn ? row[config.linkTimeColumn] : undefined
    const time =
      timeColumn && rawTime !== null && rawTime !== undefined && rawTime !== ''
        ? formatCellValue(linkTableName, timeColumn, rawTime)
        : ''
    const entry = { folder: title || '收藏夹信息缺失', time }
    const entries = result.get(String(sourceKey)) ?? []
    // A media can appear once per folder; duplicate rows from retries should
    // not produce duplicate chips.
    if (!entries.some((item) => item.folder === entry.folder && item.time === entry.time)) {
      entries.push(entry)
    }
    result.set(String(sourceKey), entries)
  }
  return result
}

/** Summarize provenance rows as one chip per source table. */
export function sourceEntries(
  configs: DetailSourceSpec[],
  rowsByTable: Map<string, Array<Record<string, unknown>>>,
  tables: TableMeta[],
): SourceEntry[] {
  const entries: SourceEntry[] = []
  for (const config of configs) {
    const rows = rowsByTable.get(config.table) ?? []
    if (!rows.length) continue
    const table = tables.find((item) => item.name === config.table)
    const timeColumn = config.timeColumn
      ? table?.columns.find((column) => column.name === config.timeColumn)
      : undefined
    let latest = ''
    for (const row of rows) {
      const raw = config.timeColumn ? row[config.timeColumn] : undefined
      if (raw === null || raw === undefined || raw === '') continue
      const text =
        timeColumn && config.timeColumn
          ? formatCellValue(config.table, timeColumn, raw)
          : String(raw)
      if (!latest || text > latest) latest = text
    }
    entries.push({
      label: config.label,
      count: rows.length,
      time: latest,
      timeLabel: config.timeLabel ?? '时间',
    })
  }
  return entries
}
