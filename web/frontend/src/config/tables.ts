import type { SortSpec, TableMeta } from '@/api/types'
import type { RenderKind } from '@/utils/renderers'
import type { TimeUnit } from '@/utils/time'

import { isIdColumn } from './columns'
import type { DetailFieldSpec, FolderSpec } from './details-types'

export { platformLabel } from './platforms'
export type { FolderSpec } from './details-types'

export interface RelationConfig {
  /** Foreign key on the source table. */
  localColumn: string
  table: string
  /** Target column used for the `in` lookup; it does not have to be a PK. */
  targetColumn: string
  /** Column header in the list. */
  label: string
  /** Display title; the first non-empty candidate wins. */
  titles: Array<string | DetailFieldSpec>
  subtitle?: string | DetailFieldSpec
  timeColumn?: string
  timeLabel?: string
  /** Fall back to the source row when the target entity is not projected. */
  fallbackTitles?: Array<string | DetailFieldSpec>
  fallbackSubtitle?: string | DetailFieldSpec
}

export interface GalleryMeta {
  spec: string | DetailFieldSpec
  label: string
}

export interface GalleryConfig {
  /** First non-empty cover URL wins. */
  cover?: Array<string | DetailFieldSpec>
  title: Array<string | DetailFieldSpec>
  subtitle?: Array<string | DetailFieldSpec>
  /** Scalar columns formatted with the table's value dictionaries. */
  badges?: Array<string | DetailFieldSpec>
  meta?: GalleryMeta[]
  /** Render the Bilibili folder join on each card. */
  folders?: boolean
  /** Bangumi uses poster covers, Bilibili uses video thumbnails. */
  aspect?: 'poster' | 'video'
}

export interface FacetOption {
  value: string | number
  label: string
}

export interface FacetConfig {
  column: string
  label: string
  allLabel?: string
  options: FacetOption[]
}

export interface VirtualColumn {
  name: string
  label: string
  /** Text columns use the first non-empty spec. */
  spec?: Array<string | DetailFieldSpec>
  kind?: 'text' | 'folders'
}

interface TableConfig {
  label: string
  /** Preferred human-readable column for headings and page titles. */
  titleColumn?: string
  listColumns: string[]
  defaultSort?: SortSpec
  /** Noisy or large columns omitted from the list column picker. */
  hiddenColumns?: string[]
  /** Join-like tables show the target entity instead of a bare foreign key. */
  relation?: RelationConfig
  /** Gallery is the default list layout for visual platforms. */
  layout?: 'table' | 'gallery'
  gallery?: GalleryConfig
  /** Single-select horizontal facets shown above the toolbar. */
  facets?: FacetConfig[]
  /** Columns computed from JSON snapshots; never sent to SQLite. */
  virtualColumns?: VirtualColumn[]
  /** Many-to-many folder enrichment, currently Bilibili only. */
  folders?: FolderSpec
  /** Explicit search columns, needed to include JSON text snapshots. */
  searchColumns?: string[]
}

/**
 * Bilibili media can belong to more than one favorite folder. The join table
 * carries the favorite time; the folder table carries the display title.
 */
export const BILIBILI_FOLDERS: FolderSpec = {
  linkTable: 'bilibili_fav_item',
  linkColumn: 'media_id',
  linkTargetColumn: 'media_id',
  linkKeyColumn: 'fav_id',
  linkTimeColumn: 'fav_time',
  folderTable: 'bilibili_fav',
  folderKeyColumn: 'fav_id',
  folderTitle: ['title'],
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
    listColumns: ['updated_at', 'type', 'rate', 'ep_status', 'comment', 'db_updated_at'],
    defaultSort: { column: 'updated_at', dir: 'desc' },
    layout: 'gallery',
    gallery: {
      cover: [
        'subject_json.images.common',
        'subject_json.images.large',
        'subject_json.images.medium',
      ],
      title: ['subject_json.name_cn', 'subject_json.name'],
      subtitle: ['subject_json.name'],
      badges: ['type', 'subject_type', 'rate'],
      meta: [
        { spec: 'updated_at', label: '收藏' },
        { spec: 'ep_status', label: '进度' },
      ],
      aspect: 'poster',
    },
    facets: [
      {
        column: 'type',
        label: '收藏状态',
        options: [
          { value: 1, label: '想看' },
          { value: 3, label: '在看' },
          { value: 2, label: '看过' },
          { value: 4, label: '搁置' },
          { value: 5, label: '抛弃' },
        ],
      },
      {
        column: 'subject_type',
        label: '类型',
        options: [
          { value: 2, label: '动画' },
          { value: 1, label: '书籍' },
          { value: 4, label: '游戏' },
          { value: 3, label: '音乐' },
          { value: 6, label: '三次元' },
        ],
      },
    ],
    virtualColumns: [
      {
        name: 'subject_title',
        label: '条目',
        spec: ['subject_json.name_cn', 'subject_json.name'],
      },
    ],
    searchColumns: ['subject_json', 'comment'],
  },
  bangumi_subject: {
    label: 'Bangumi 条目',
    titleColumn: 'name',
    listColumns: ['name', 'name_cn', 'date', 'platform', 'total_episodes', 'eps', 'db_updated_at'],
    defaultSort: { column: 'date', dir: 'desc' },
    hiddenColumns: ['summary', 'images_json', 'infobox_json', 'characters_json'],
  },
  bilibili_fav: {
    label: '哔哩哔哩收藏夹',
    titleColumn: 'title',
    listColumns: ['title', 'media_count', 'ctime', 'mtime', 'db_updated_at'],
    defaultSort: { column: 'ctime', dir: 'desc' },
    hiddenColumns: ['upper_json', 'cnt_info_json'],
  },
  bilibili_fav_item: {
    label: '哔哩哔哩收藏项',
    listColumns: ['fav_time', 'db_updated_at'],
    defaultSort: { column: 'fav_time', dir: 'desc' },
    relation: {
      localColumn: 'media_id',
      table: 'bilibili_media',
      targetColumn: 'media_id',
      label: '视频',
      titles: ['title'],
      subtitle: { column: 'upper_json', path: ['name'] },
      timeColumn: 'pubtime',
    },
  },
  bilibili_media: {
    label: '哔哩哔哩媒体',
    titleColumn: 'title',
    listColumns: ['title', 'type', 'duration', 'pubtime', 'bvid', 'db_updated_at'],
    defaultSort: { column: 'pubtime', dir: 'desc' },
    hiddenColumns: ['intro', 'ugc_json', 'season_json', 'ogv_json', 'cnt_info_json'],
    layout: 'gallery',
    gallery: {
      cover: ['cover'],
      title: ['title'],
      subtitle: [{ column: 'upper_json', path: ['name'] }],
      badges: ['type', 'duration'],
      meta: [
        { spec: 'pubtime', label: '发布' },
        { spec: 'db_updated_at', label: '同步' },
      ],
      folders: true,
      aspect: 'video',
    },
    virtualColumns: [{ name: 'folders', label: '收藏夹', kind: 'folders' }],
    folders: BILIBILI_FOLDERS,
  },
  cnblog_bookmark: {
    label: '博客园收藏',
    titleColumn: 'title',
    listColumns: ['title', 'date_added', 'from_cnblogs', 'link_url', 'db_updated_at'],
    defaultSort: { column: 'date_added', dir: 'desc' },
    hiddenColumns: ['summary', 'tags_json'],
  },
  cnblog_post: {
    label: '博客园文章',
    titleColumn: 'source_url',
    listColumns: ['db_updated_at'],
    defaultSort: { column: 'db_updated_at', dir: 'desc' },
    hiddenColumns: ['body'],
    relation: {
      localColumn: 'source_url',
      table: 'cnblog_bookmark',
      targetColumn: 'link_url',
      label: '文章',
      titles: ['title'],
      timeColumn: 'date_added',
      timeLabel: '收藏时间',
    },
  },
  github_star: {
    label: 'GitHub Star',
    titleColumn: 'full_name',
    listColumns: [
      'full_name',
      'language',
      'stargazers_count',
      'forks_count',
      'created_at',
      'starred_at',
      'db_updated_at',
    ],
    defaultSort: { column: 'starred_at', dir: 'desc' },
    hiddenColumns: ['readme', 'description', 'topics_json'],
  },
  netease_play_record: {
    label: '网易云播放记录',
    listColumns: ['play_time', 'resource_type', 'banned', 'db_updated_at'],
    defaultSort: { column: 'play_time', dir: 'desc' },
    hiddenColumns: ['device_json', 'song_json'],
    relation: {
      localColumn: 'song_id',
      table: 'netease_song',
      targetColumn: 'song_id',
      label: '歌曲',
      titles: ['name'],
      subtitle: { column: 'artists_json', path: [0, 'name'] },
      timeColumn: 'publish_time',
      fallbackTitles: [{ column: 'song_json', path: ['name'] }],
      fallbackSubtitle: { column: 'song_json', path: ['ar', 0, 'name'] },
    },
  },
  netease_playlist: {
    label: '网易云歌单',
    titleColumn: 'name',
    listColumns: ['name', 'track_count', 'play_count', 'create_time', 'update_time', 'db_updated_at'],
    defaultSort: { column: 'update_time', dir: 'desc' },
    hiddenColumns: ['description', 'creator_json', 'tags_json'],
  },
  netease_playlist_song: {
    label: '网易云歌单曲目',
    listColumns: ['position', 'db_updated_at'],
    defaultSort: { column: 'position', dir: 'asc' },
    relation: {
      localColumn: 'song_id',
      table: 'netease_song',
      targetColumn: 'song_id',
      label: '歌曲',
      titles: ['name'],
      subtitle: { column: 'artists_json', path: [0, 'name'] },
      timeColumn: 'publish_time',
    },
  },
  netease_song: {
    label: '网易云歌曲',
    titleColumn: 'name',
    listColumns: ['name', 'duration', 'publish_time', 'fee', 'db_updated_at'],
    defaultSort: { column: 'publish_time', dir: 'desc' },
    hiddenColumns: ['artists_json', 'album_json', 'alias_json', 'trans_names_json'],
  },
  qireader_article: {
    label: '文章正文',
    titleColumn: 'url',
    listColumns: ['db_updated_at'],
    defaultSort: { column: 'db_updated_at', dir: 'desc' },
    hiddenColumns: ['content'],
    relation: {
      localColumn: 'url',
      table: 'qireader_entry',
      targetColumn: 'url',
      label: '文章',
      titles: ['title'],
      timeColumn: 'published_at',
    },
  },
  qireader_entry: {
    label: '稍后读',
    titleColumn: 'title',
    listColumns: ['title', 'published_at', 'crawled_at', 'db_updated_at', 'url'],
    defaultSort: { column: 'published_at', dir: 'desc' },
    hiddenColumns: ['summary', 'origin_json', 'attachments_json', 'tag_ids_json', 'is_saved'],
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
    listColumns: ['db_updated_at'],
    defaultSort: { column: 'db_updated_at', dir: 'desc' },
    relation: {
      localColumn: 'tweet_id',
      table: 'twitter_tweet',
      targetColumn: 'tweet_id',
      label: '推文',
      titles: ['full_text'],
      subtitle: { column: 'author_json', path: ['name'] },
      timeColumn: 'created_at',
    },
  },
  twitter_like: {
    label: 'Twitter 喜欢',
    listColumns: ['db_updated_at'],
    defaultSort: { column: 'db_updated_at', dir: 'desc' },
    relation: {
      localColumn: 'tweet_id',
      table: 'twitter_tweet',
      targetColumn: 'tweet_id',
      label: '推文',
      titles: ['full_text'],
      subtitle: { column: 'author_json', path: ['name'] },
      timeColumn: 'created_at',
    },
  },
  twitter_tweet: {
    label: 'Twitter 推文',
    listColumns: [
      'created_at',
      'full_text',
      'favorite_count',
      'retweet_count',
      'reply_count',
      'view_count',
      'db_updated_at',
    ],
    defaultSort: { column: 'created_at', dir: 'desc' },
    hiddenColumns: ['author_json'],
  },
  v2ex_favorite: {
    label: 'V2EX 收藏',
    listColumns: ['db_updated_at'],
    defaultSort: { column: 'db_updated_at', dir: 'desc' },
    relation: {
      localColumn: 'topic_id',
      table: 'v2ex_topic',
      targetColumn: 'topic_id',
      label: '主题',
      titles: ['title'],
      subtitle: { column: 'member_json', path: ['username'] },
      timeColumn: 'created',
    },
  },
  v2ex_reply: {
    label: 'V2EX 回复',
    listColumns: ['content', 'thanks', 'created', 'db_updated_at'],
    defaultSort: { column: 'created', dir: 'desc' },
    hiddenColumns: ['content_rendered', 'member_json'],
  },
  v2ex_thanks: {
    label: 'V2EX 感谢',
    titleColumn: 'topic_title',
    listColumns: ['topic_title', 'thanked_at', 'member', 'amount', 'content_kind', 'db_updated_at'],
    defaultSort: { column: 'thanked_at', dir: 'desc' },
    hiddenColumns: ['description'],
  },
  v2ex_topic: {
    label: 'V2EX 主题',
    titleColumn: 'title',
    listColumns: ['title', 'replies', 'created', 'last_touched', 'db_updated_at'],
    defaultSort: { column: 'last_touched', dir: 'desc' },
    hiddenColumns: ['content', 'member_json', 'node_json', 'supplements_json'],
  },
  weibo_post: {
    label: '微博',
    listColumns: [
      'created_at',
      'text',
      'reposts_count',
      'comments_count',
      'attitudes_count',
      'pic_num',
      'db_updated_at',
    ],
    defaultSort: { column: 'created_at', dir: 'desc' },
    hiddenColumns: ['text_raw', 'long_text', 'user_json', 'pic_infos_json', 'source'],
  },
  zhihu_collection_item: {
    label: '知乎收藏项',
    listColumns: ['created', 'db_updated_at'],
    defaultSort: { column: 'created', dir: 'desc' },
    relation: {
      localColumn: 'content_id',
      table: 'zhihu_content',
      targetColumn: 'content_id',
      label: '内容',
      titles: ['title'],
      subtitle: { column: 'author_json', path: ['name'] },
      timeColumn: 'created_time',
    },
  },
  zhihu_content: {
    label: '知乎内容',
    titleColumn: 'title',
    listColumns: [
      'title',
      'type',
      'voteup_count',
      'comment_count',
      'created_time',
      'db_updated_at',
    ],
    defaultSort: { column: 'created_time', dir: 'desc' },
    hiddenColumns: ['body_html', 'content_json', 'author_json', 'question_json'],
  },
}

export function tableLabel(table: string): string {
  return TABLE_CONFIGS[table]?.label ?? table
}

const TABLE_COPY: Record<string, { description: string; countUnit: string }> = {
  bangumi_collection: {
    description: '你在 Bangumi 标记的动画、书籍和游戏，按收藏状态和类型筛选。',
    countUnit: '条',
  },
  bangumi_subject: {
    description: 'Bangumi 条目的公开资料，用于补全收藏详情。',
    countUnit: '条',
  },
  bilibili_fav: {
    description: '哔哩哔哩收藏夹的元数据。',
    countUnit: '个',
  },
  bilibili_fav_item: {
    description: '收藏夹与视频的对应关系。',
    countUnit: '条',
  },
  bilibili_media: {
    description: '收藏夹里的视频、专栏和番剧，详情显示收藏时间与收藏夹。',
    countUnit: '个',
  },
  cnblog_bookmark: {
    description: '收藏的博客文章，详情直接读取已抓取正文。',
    countUnit: '篇',
  },
  cnblog_post: {
    description: '已抓取的博客园文章正文。',
    countUnit: '篇',
  },
  github_star: {
    description: '你 Star 过的 GitHub 仓库及 README。',
    countUnit: '个',
  },
  netease_play_record: {
    description: '最近播放的歌曲快照。',
    countUnit: '条',
  },
  netease_playlist: {
    description: '网易云账号里的歌单。',
    countUnit: '个',
  },
  netease_playlist_song: {
    description: '歌单与歌曲的对应关系。',
    countUnit: '条',
  },
  netease_song: {
    description: '歌单中出现过的歌曲资料。',
    countUnit: '首',
  },
  qireader_article: {
    description: '已抓取的 RSS 文章正文。',
    countUnit: '篇',
  },
  qireader_entry: {
    description: '稍后读条目，详情直接显示已抓取正文。',
    countUnit: '条',
  },
  sync_response: {
    description: '原始 API 响应，按同步批次归档。',
    countUnit: '个',
  },
  sync_run: {
    description: '每次同步的执行记录与状态。',
    countUnit: '次',
  },
  twitter_bookmark: {
    description: 'Twitter 书签关系。',
    countUnit: '条',
  },
  twitter_like: {
    description: 'Twitter 喜欢关系。',
    countUnit: '条',
  },
  twitter_tweet: {
    description: '喜欢或书签涉及的推文，详情页显示来源。',
    countUnit: '条',
  },
  v2ex_favorite: {
    description: 'V2EX 收藏主题关系。',
    countUnit: '个',
  },
  v2ex_reply: {
    description: '已抓取的 V2EX 主题回复。',
    countUnit: '条',
  },
  v2ex_thanks: {
    description: 'V2EX 感谢交易记录。',
    countUnit: '条',
  },
  v2ex_topic: {
    description: '收藏、感谢过的主题，详情页合并回复与来源。',
    countUnit: '个',
  },
  weibo_post: {
    description: '保存的微博正文、图片和互动数。',
    countUnit: '条',
  },
  zhihu_collection_item: {
    description: '收藏夹与知乎内容的对应关系。',
    countUnit: '条',
  },
  zhihu_content: {
    description: '收藏的回答、文章和想法，详情显示收藏来源。',
    countUnit: '条',
  },
}

export function tableDescription(table: string): string {
  return TABLE_COPY[table]?.description ?? '数据库中的实时记录。'
}

export function tableCountUnit(table: string): string {
  return TABLE_COPY[table]?.countUnit ?? '条'
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

export function tableRelation(table: string): RelationConfig | undefined {
  return TABLE_CONFIGS[table]?.relation
}

export function tableLayout(table: string): 'table' | 'gallery' {
  return TABLE_CONFIGS[table]?.layout ?? 'table'
}

export function galleryFor(table: string): GalleryConfig | undefined {
  return TABLE_CONFIGS[table]?.gallery
}

export function facetsFor(table: string): FacetConfig[] {
  return TABLE_CONFIGS[table]?.facets ?? []
}

export function virtualColumnsFor(table: string): VirtualColumn[] {
  return TABLE_CONFIGS[table]?.virtualColumns ?? []
}

export function foldersFor(table: string): FolderSpec | undefined {
  return TABLE_CONFIGS[table]?.folders
}

export function searchColumnsFor(table: string): string[] | undefined {
  return TABLE_CONFIGS[table]?.searchColumns
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
  bangumi_subject: { date: 'raw' },
  cnblog_bookmark: { date_added: 'iso' },
  github_star: {
    created_at: 'iso',
    updated_at: 'iso',
    pushed_at: 'iso',
    starred_at: 'iso',
  },
  netease_play_record: { play_time: 'epoch_ms' },
  netease_playlist: {
    create_time: 'epoch_ms',
    update_time: 'epoch_ms',
    track_update_time: 'epoch_ms',
    detail_track_update_time: 'epoch_ms',
  },
  netease_song: { publish_time: 'epoch_ms' },
  qireader_entry: {
    published_at: 'epoch_ms',
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

// Fallback list columns for tables without explicit config yet. IDs stay out
// of the visible list (the primary key is still requested for row navigation);
// bodies, HTML and JSON stay out so one page never transfers megabytes.
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
  const withoutIds = visible.filter((column) => !isIdColumn(column.name))
  const candidates = withoutIds.length ? withoutIds : visible
  return candidates.slice(0, 6).map((column) => column.name)
}
