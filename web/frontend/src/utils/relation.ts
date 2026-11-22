import type { TableMeta } from '@/api/types'
import { detailFieldValue, firstDetailValue } from '@/config/details'
import type { DetailFieldSpec } from '@/config/details-types'
import type { RelationConfig } from '@/config/tables'
import { formatCellValue, stripHtml, truncate } from './format'

export interface RelationDisplay {
  title: string
  meta: string
  hasTarget: boolean
}

/** Base column of a field spec such as `song_json.name` or `{ path: ... }`. */
export function relationFieldColumn(spec: string | DetailFieldSpec): string {
  return typeof spec === 'string' ? spec.split('.', 1)[0] : spec.column
}

function scalar(value: unknown): string {
  return value === null || value === undefined ? '' : String(value)
}

/**
 * Render the target entity of a join-like table. When the target row is not
 * projected, fall back to a snapshot embedded in the source row (NetEase play
 * records keep `song_json`); otherwise say the relation is missing instead of
 * falling back to a bare foreign key.
 */
export function relationDisplay(
  config: RelationConfig,
  sourceRow: Record<string, unknown>,
  targetRow: Record<string, unknown> | undefined,
  targetTable: TableMeta | undefined,
  failed = false,
): RelationDisplay {
  const titles = targetRow ? config.titles : config.fallbackTitles
  const titleValue = titles?.length ? firstDetailValue(targetRow ?? sourceRow, titles) : undefined
  let title = titleValue === undefined ? '' : stripHtml(scalar(titleValue)).replace(/\s+/g, ' ')
  if (!title) {
    title = failed ? '关联内容加载失败' : '关联记录缺失'
  }

  const subtitleValue = targetRow
    ? detailFieldValue(targetRow, config.subtitle)
    : detailFieldValue(sourceRow, config.fallbackSubtitle)
  const subtitle = subtitleValue === undefined ? '' : truncate(scalar(subtitleValue), 40)

  let time = ''
  if (targetRow && config.timeColumn) {
    const value = detailFieldValue(targetRow, config.timeColumn)
    if (value !== undefined && value !== null && value !== '') {
      const column = targetTable?.columns.find((item) => item.name === config.timeColumn)
      time = column ? formatCellValue(config.table, column, value) : scalar(value)
    }
  }

  const meta = [subtitle, time ? `${config.timeLabel ?? '发布'} ${time}` : '']
    .filter(Boolean)
    .join(' · ')

  return {
    title: truncate(title, 180),
    meta,
    hasTarget: Boolean(targetRow),
  }
}
