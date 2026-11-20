import type { SortSpec, TableMeta } from '@/api/types'
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

interface TableConfig {
  label: string
  /** Preferred human-readable column for headings and page titles. */
  titleColumn?: string
  listColumns: string[]
  defaultSort?: SortSpec
  /** Noisy or large columns omitted from the list column picker. */
  hiddenColumns?: string[]
}

/**
 * Per-table display config. The table list is intentionally explicit: these
 * columns keep list requests small and give every platform a readable heading,
 * while unknown/future tables fall back to schema heuristics below.
 */
const TABLE_CONFIGS: Record<string, TableConfig> = {
  bangumi_collection: {
    label: 'Bangumi 收藏',
    titleColumn: 'subject_id',
    listColumns: ['subject_id', 'collection_id', 'updated_at', 'type', 'rate', 'ep_status', 'comment'],
    defaultSort: { column: 'updated_at', dir: 'desc' },
  },
  bangumi_subject: {
    label: 'Bangumi 条目',
    titleColumn: 'name',
    listColumns: ['subject_id', 'name', 'name_cn', 'date', 'platform', 'total_episodes', 'eps'],
    defaultSort: { column: 'subject_id', dir: 'desc' },
    hiddenColumns: ['summary', 'images_json', 'infobox_json', 'characters_json'],
  },
  bilibili_fav: {
    label: '哔哩哔哩收藏夹',
    titleColumn: 'title',
    listColumns: ['fav_id', 'title', 'media_count', 'ctime', 'mtime'],
    defaultSort: { column: 'ctime', dir: 'desc' },
    hiddenColumns: ['upper_json', 'cnt_info_json'],
  },
  bilibili_fav_item: {
    label: '哔哩哔哩收藏项',
    listColumns: ['fav_id', 'media_id', 'fav_time'],
    defaultSort: { column: 'fav_time', dir: 'desc' },
  },
  bilibili_media: {
    label: '哔哩哔哩媒体',
    titleColumn: 'title',
    listColumns: ['media_id', 'title', 'type', 'duration', 'pubtime', 'bvid', 'link'],
    defaultSort: { column: 'pubtime', dir: 'desc' },
    hiddenColumns: ['intro', 'ugc_json', 'season_json', 'ogv_json', 'cnt_info_json'],
  },
  cnblog_bookmark: {
    label: '博客园收藏',
    titleColumn: 'title',
    listColumns: ['wz_link_id', 'title', 'date_added', 'from_cnblogs', 'link_url'],
    defaultSort: { column: 'date_added', dir: 'desc' },
    hiddenColumns: ['summary', 'tags_json'],
  },
  cnblog_post: {
    label: '博客园文章',
    titleColumn: 'source_url',
    listColumns: ['post_id', 'source_url'],
    defaultSort: { column: 'post_id', dir: 'desc' },
    hiddenColumns: ['body'],
  },
  github_star: {
    label: 'GitHub Star',
    titleColumn: 'full_name',
    listColumns: [
      'repo_id',
      'full_name',
      'language',
      'stargazers_count',
      'forks_count',
      'starred_at',
      'html_url',
    ],
    defaultSort: { column: 'starred_at', dir: 'desc' },
    hiddenColumns: ['readme', 'description', 'topics_json'],
  },
  netease_play_record: {
    label: '网易云播放记录',
    listColumns: ['song_id', 'play_time', 'resource_type', 'banned'],
    defaultSort: { column: 'play_time', dir: 'desc' },
    hiddenColumns: ['device_json', 'song_json'],
  },
  netease_playlist: {
    label: '网易云歌单',
    titleColumn: 'name',
    listColumns: ['playlist_id', 'name', 'track_count', 'play_count', 'create_time', 'update_time'],
    defaultSort: { column: 'update_time', dir: 'desc' },
    hiddenColumns: ['description', 'creator_json', 'tags_json'],
  },
  netease_playlist_song: {
    label: '网易云歌单曲目',
    listColumns: ['playlist_id', 'song_id', 'position'],
    defaultSort: { column: 'position', dir: 'asc' },
  },
  netease_song: {
    label: '网易云歌曲',
    titleColumn: 'name',
    listColumns: ['song_id', 'name', 'duration', 'publish_time', 'fee', 'mv'],
    defaultSort: { column: 'publish_time', dir: 'desc' },
    hiddenColumns: ['artists_json', 'album_json', 'alias_json', 'trans_names_json'],
  },
  qireader_article: {
    label: '起点文章',
    titleColumn: 'url',
    listColumns: ['url', 'response_id'],
    defaultSort: { column: 'response_id', dir: 'desc' },
    hiddenColumns: ['content'],
  },
  qireader_entry: {
    label: '起点条目',
    titleColumn: 'title',
    listColumns: ['entry_id', 'title', 'is_saved', 'published_at', 'url'],
    defaultSort: { column: 'published_at', dir: 'desc' },
    hiddenColumns: ['summary', 'origin_json', 'attachments_json', 'tag_ids_json'],
  },
  sync_response: {
    label: 'raw 响应',
    listColumns: ['id', 'run_id', 'endpoint', 'status_code', 'fetched_at'],
    defaultSort: { column: 'id', dir: 'desc' },
  },
  sync_run: {
    label: 'raw 同步记录',
    listColumns: ['id', 'platform', 'operation', 'status', 'started_at', 'finished_at'],
    defaultSort: { column: 'id', dir: 'desc' },
  },
  twitter_bookmark: {
    label: 'Twitter 书签',
    listColumns: ['tweet_id', 'response_id', 'db_updated_at'],
    defaultSort: { column: 'tweet_id', dir: 'desc' },
  },
  twitter_like: {
    label: 'Twitter 喜欢',
    listColumns: ['tweet_id', 'response_id', 'db_updated_at'],
    defaultSort: { column: 'tweet_id', dir: 'desc' },
  },
  twitter_tweet: {
    label: 'Twitter 推文',
    listColumns: [
      'tweet_id',
      'created_at',
      'full_text',
      'favorite_count',
      'retweet_count',
      'reply_count',
      'view_count',
    ],
    defaultSort: { column: 'tweet_id', dir: 'desc' },
    hiddenColumns: ['author_json'],
  },
  v2ex_favorite: {
    label: 'V2EX 收藏',
    listColumns: ['topic_id', 'response_id', 'db_updated_at'],
    defaultSort: { column: 'topic_id', dir: 'desc' },
  },
  v2ex_reply: {
    label: 'V2EX 回复',
    listColumns: ['reply_id', 'topic_id', 'content', 'thanks', 'created'],
    defaultSort: { column: 'created', dir: 'desc' },
    hiddenColumns: ['content_rendered', 'member_json'],
  },
  v2ex_thanks: {
    label: 'V2EX 感谢',
    titleColumn: 'topic_title',
    listColumns: ['topic_id', 'thanked_at', 'member', 'amount', 'content_kind', 'topic_title'],
    defaultSort: { column: 'thanked_at', dir: 'desc' },
    hiddenColumns: ['description'],
  },
  v2ex_topic: {
    label: 'V2EX 主题',
    titleColumn: 'title',
    listColumns: ['topic_id', 'title', 'replies', 'created', 'last_modified'],
    defaultSort: { column: 'last_touched', dir: 'desc' },
    hiddenColumns: ['content', 'member_json', 'node_json', 'supplements_json'],
  },
  weibo_post: {
    label: '微博',
    listColumns: [
      'post_id',
      'created_at',
      'text',
      'reposts_count',
      'comments_count',
      'attitudes_count',
      'pic_num',
    ],
    defaultSort: { column: 'created_at', dir: 'desc' },
    hiddenColumns: ['text_raw', 'long_text', 'user_json', 'pic_infos_json', 'source'],
  },
  zhihu_collection_item: {
    label: '知乎收藏项',
    listColumns: ['collection_id', 'content_id', 'created'],
    defaultSort: { column: 'created', dir: 'desc' },
  },
  zhihu_content: {
    label: '知乎内容',
    titleColumn: 'title',
    listColumns: [
      'content_id',
      'title',
      'type',
      'voteup_count',
      'comment_count',
      'updated_time',
    ],
    defaultSort: { column: 'updated_time', dir: 'desc' },
    hiddenColumns: ['body_html', 'content_json', 'author_json', 'question_json'],
  },
}

export function tableLabel(table: string): string {
  return TABLE_CONFIGS[table]?.label ?? table
}

export function titleColumnFor(table: string): string | undefined {
  return TABLE_CONFIGS[table]?.titleColumn
}

export function defaultSortFor(table: string): SortSpec | undefined {
  return TABLE_CONFIGS[table]?.defaultSort
}

export function hiddenColumnsFor(table: string): Set<string> {
  return new Set(TABLE_CONFIGS[table]?.hiddenColumns ?? [])
}

/** Configured list columns filtered against the live schema, with fallback. */
export function listColumnsFor(table: TableMeta): string[] {
  const available = new Set(
    table.columns
      .filter((column) => !column.hidden && !hiddenColumnsFor(table.name).has(column.name))
      .map((column) => column.name),
  )
  const configured = (TABLE_CONFIGS[table.name]?.listColumns ?? []).filter((name) =>
    available.has(name),
  )
  if (configured.length) return configured
  return defaultListColumns(table).filter((name) => available.has(name))
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
    (column) => !column.hidden && !column.json && !LARGE_COLUMNS.has(column.name),
  )
  const primary = table.primary_key.filter((name) =>
    visible.some((column) => column.name === name),
  )
  const rest = visible
    .filter((column) => !primary.includes(column.name))
    .slice(0, Math.max(0, 6 - primary.length))
  return [...primary, ...rest.map((column) => column.name)]
}
