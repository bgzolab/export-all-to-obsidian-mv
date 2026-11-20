// Platform display names. The fallback keeps unknown/future platforms usable
// without a code change; table-specific rendering config is added alongside it.
const PLATFORM_LABELS: Record<string, string> = {
  bangumi: 'Bangumi',
  bilibili: '哔哩哔哩',
  cnblog: '博客园',
  github: 'GitHub',
  netease: '网易云音乐',
  qireader: '起点读书',
  raw: '原始响应',
  twitter: 'Twitter / X',
  v2ex: 'V2EX',
  weibo: '微博',
  zhihu: '知乎',
}

export function platformLabel(platform: string): string {
  return PLATFORM_LABELS[platform] ?? platform
}

// Fallback list columns for tables without explicit config yet. The primary key
// comes first, then scalar columns; bodies, HTML and JSON stay out of the list
// request so one page never transfers megabytes.
const LARGE_COLUMNS = new Set([
  'body',
  'body_html',
  'content',
  'content_json',
  'content_rendered',
  'long_text',
  'readme',
  'description',
  'raw',
])

export function defaultListColumns(table: {
  primary_key: string[]
  columns: Array<{ name: string; json: boolean; hidden?: boolean }>
}): string[] {
  const visible = table.columns.filter(
    (column) => !column.hidden && !LARGE_COLUMNS.has(column.name),
  )
  const primary = table.primary_key.filter((name) =>
    visible.some((column) => column.name === name),
  )
  const rest = visible
    .filter((column) => !primary.includes(column.name))
    .slice(0, Math.max(0, 6 - primary.length))
  return [...primary, ...rest.map((column) => column.name)]
}
