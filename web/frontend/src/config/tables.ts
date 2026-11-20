import type { RenderKind } from '@/utils/renderers'
import type { TimeUnit } from '@/utils/time'

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

/**
 * Per-table field overrides. Names alone cannot distinguish plain text from
 * HTML or a cover from a raw link, so ambiguous fields are listed here. Unknown
 * tables still fall back to heuristics in `utils/renderers.ts`.
 */
const FIELD_RENDER_OVERRIDES: Record<string, Record<string, RenderKind>> = {
  bangumi_subject: { images_json: 'images', summary: 'text' },
  bilibili_fav: { cover: 'image' },
  bilibili_media: { cover: 'image', intro: 'text', link: 'link' },
  cnblog_bookmark: { link_url: 'link', summary: 'text' },
  cnblog_post: { body: 'html', source_url: 'link' },
  github_star: {
    readme: 'markdown',
    html_url: 'link',
    homepage: 'link',
    description: 'text',
  },
  qireader_article: { content: 'html' },
  qireader_entry: { url: 'link', summary: 'text', attachments_json: 'images' },
  twitter_tweet: { full_text: 'text' },
  v2ex_reply: { content: 'text', content_rendered: 'html' },
  v2ex_thanks: { description: 'text' },
  v2ex_topic: { content: 'text', url: 'link' },
  weibo_post: {
    text: 'html',
    text_raw: 'text',
    long_text: 'html',
    source: 'html',
    pic_infos_json: 'images',
  },
  zhihu_content: { body_html: 'html', url: 'link' },
}

/**
 * Timestamp unit overrides. The schema mixes epoch seconds, epoch milliseconds
 * and ISO strings across platforms, so the ambiguous columns are explicit.
 */
const TIME_UNIT_OVERRIDES: Record<string, Record<string, TimeUnit>> = {
  bilibili_fav: { ctime: 'epoch_s', mtime: 'epoch_s' },
  bilibili_fav_item: { fav_time: 'epoch_s' },
  bilibili_media: { ctime: 'epoch_s', pubtime: 'epoch_s' },
  bangumi_collection: { updated_at: 'iso' },
  cnblog_bookmark: { date_added: 'iso' },
  github_star: {
    created_at: 'iso',
    updated_at: 'iso',
    pushed_at: 'iso',
    starred_at: 'iso',
  },
  netease_play_record: { play_time: 'epoch_ms' },
  netease_playlist: {
    create_time: 'epoch_s',
    update_time: 'epoch_s',
    track_update_time: 'epoch_s',
  },
  netease_song: { publish_time: 'epoch_s' },
  qireader_entry: {
    published_at: 'iso',
    crawled_at: 'epoch_ms',
    timestamp: 'epoch_ms',
  },
  v2ex_thanks: { thanked_at: 'iso' },
  weibo_post: { created_at: 'iso' },
  zhihu_collection_item: { created: 'iso' },
}

export function fieldRenderOverride(table: string, column: string): RenderKind | undefined {
  return FIELD_RENDER_OVERRIDES[table]?.[column]
}

export function timeUnitOverride(table: string, column: string): TimeUnit | undefined {
  return TIME_UNIT_OVERRIDES[table]?.[column]
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
