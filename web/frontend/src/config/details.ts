import { columnLabel } from './columns'
import type { DetailConfig, DetailFieldSpec } from './details-types'
import { BILIBILI_FOLDERS } from './tables'

export type { DetailConfig, DetailFieldSpec } from './details-types'

/**
 * Detail layouts are platform-specific on purpose. A tweet, a repository and a
 * song share the same SQLite shape but not the same reading shape, so each
 * config names its title, cover, content and stats columns.
 */
const DETAIL_CONFIGS: Record<string, DetailConfig> = {
  bangumi_collection: {
    title: [
      { column: 'subject_json', path: ['name_cn'] },
      { column: 'subject_json', path: ['name'] },
    ],
    subtitle: [{ column: 'subject_json', path: ['name'] }],
    cover: { column: 'subject_json', path: ['images', 'large'] },
    content: ['comment'],
    meta: ['updated_at', 'type', 'subject_type', 'rate', 'ep_status', 'private'],
    related: [{ label: '查看条目详情', table: 'bangumi_subject', column: 'subject_id', mode: 'detail' }],
  },
  bangumi_subject: {
    title: [{ column: 'name_cn' }, { column: 'name' }],
    subtitle: ['name', 'platform'],
    cover: { column: 'images_json', path: ['large'] },
    content: ['summary'],
    stats: [
      { column: 'rating_json', path: ['score'], label: '评分' },
      { column: 'total_episodes', label: '总集数' },
      { column: 'rating_json', path: ['total'], label: '评分人数' },
    ],
    meta: ['date', 'platform', 'tags_json'],
    url: { column: 'subject_id', template: 'https://bgm.tv/subject/{value}' },
  },
  bilibili_fav: {
    title: ['title'],
    cover: 'cover',
    content: ['intro'],
    stats: ['media_count'],
    meta: ['ctime', 'mtime'],
    related: [
      { label: '查看收藏项', table: 'bilibili_fav_item', column: 'fav_id', targetColumn: 'fav_id' },
    ],
  },
  bilibili_fav_item: {
    heading: '收藏的视频',
    title: [],
    preview: { table: 'bilibili_media', column: 'media_id' },
    meta: ['fav_time'],
    related: [
      { label: '查看收藏夹', table: 'bilibili_fav', column: 'fav_id', mode: 'detail' },
    ],
  },
  bilibili_media: {
    title: ['title'],
    subtitle: [{ column: 'upper_json', path: ['name'] }],
    cover: 'cover',
    content: ['intro'],
    stats: [
      { column: 'cnt_info_json', path: ['play'], label: '播放' },
      { column: 'cnt_info_json', path: ['collect'], label: '收藏' },
      { column: 'cnt_info_json', path: ['danmaku'], label: '弹幕' },
    ],
    meta: ['duration', 'pubtime', 'bvid', 'type'],
    url: { column: 'bvid', template: 'https://www.bilibili.com/video/{value}' },
    embed: 'bilibili',
    folders: BILIBILI_FOLDERS,
  },
  cnblog_bookmark: {
    title: ['title'],
    meta: ['date_added', 'from_cnblogs', 'tags_json'],
    url: 'link_url',
    lookup: {
      table: 'cnblog_post',
      column: 'link_url',
      targetColumn: 'source_url',
      label: '文章正文',
      fields: ['body'],
      emptyText: '正文抓取为空。该文章可能发布于旧接口不返回正文的时期。',
    },
  },
  cnblog_post: {
    title: ['source_url'],
    content: ['body'],
    meta: ['source_url'],
    url: 'source_url',
  },
  github_star: {
    title: ['full_name'],
    subtitle: ['description'],
    cover: { column: 'owner_login', template: 'https://github.com/{value}.png?size=200' },
    content: ['readme'],
    previewText: 'description',
    stats: ['stargazers_count', 'forks_count', 'open_issues_count'],
    meta: ['language', 'license', 'starred_at', 'topics_json'],
    url: 'html_url',
  },
  netease_play_record: {
    title: [{ column: 'song_json', path: ['name'] }],
    subtitle: [{ column: 'song_json', path: ['ar', 0, 'name'] }],
    cover: { column: 'song_json', path: ['al', 'picUrl'] },
    meta: ['play_time', 'resource_type', 'device_json.osText'],
    preview: { table: 'netease_song', column: 'song_id' },
  },
  netease_playlist: {
    title: ['name'],
    subtitle: [{ column: 'creator_json', path: ['nickname'] }],
    cover: 'cover_img_url',
    content: ['description'],
    stats: ['track_count', 'play_count', 'subscribed_count'],
    meta: ['create_time', 'update_time', 'tags_json'],
    url: { column: 'playlist_id', template: 'https://music.163.com/#/playlist?id={value}' },
    embed: 'netease-playlist',
    related: [
      { label: '查看歌单曲目', table: 'netease_playlist_song', column: 'playlist_id' },
    ],
  },
  netease_playlist_song: {
    heading: '歌单曲目',
    title: [],
    preview: { table: 'netease_song', column: 'song_id' },
    meta: ['position'],
    related: [
      { label: '查看歌单', table: 'netease_playlist', column: 'playlist_id', mode: 'detail' },
    ],
  },
  netease_song: {
    title: ['name'],
    subtitle: [{ column: 'artists_json', path: [0, 'name'] }],
    cover: { column: 'album_json', path: ['picUrl'] },
    meta: ['album_json.name', 'publish_time', 'fee', 'duration'],
    url: { column: 'song_id', template: 'https://music.163.com/#/song?id={value}' },
    embed: 'netease-song',
    related: [
      { label: '出现在哪些歌单', table: 'netease_playlist_song', column: 'song_id' },
    ],
  },
  qireader_article: {
    title: ['url'],
    content: ['content'],
    meta: ['url'],
    url: 'url',
  },
  qireader_entry: {
    title: ['title'],
    meta: ['published_at', 'is_saved'],
    url: 'url',
    lookup: {
      table: 'qireader_article',
      column: 'url',
      targetColumn: 'url',
      label: '文章正文',
      fields: ['content'],
      emptyText: '正文尚未抓取。',
    },
  },
  twitter_bookmark: {
    heading: '收藏的推文',
    title: [],
    preview: { table: 'twitter_tweet', column: 'tweet_id' },
  },
  twitter_like: {
    heading: '喜欢的推文',
    title: [],
    preview: { table: 'twitter_tweet', column: 'tweet_id' },
  },
  twitter_tweet: {
    title: [{ column: 'author_json', path: ['name'] }],
    subtitle: [{ column: 'author_json', path: ['screen_name'], prefix: '@' }],
    content: ['full_text'],
    stats: ['favorite_count', 'retweet_count', 'reply_count', 'view_count'],
    meta: ['created_at'],
    url: { column: 'tweet_id', template: 'https://x.com/i/web/status/{value}' },
    sources: [
      {
        table: 'twitter_like',
        column: 'tweet_id',
        label: '喜欢',
        timeColumn: 'db_updated_at',
        timeLabel: '同步',
      },
      {
        table: 'twitter_bookmark',
        column: 'tweet_id',
        label: '书签',
        timeColumn: 'db_updated_at',
        timeLabel: '同步',
      },
    ],
  },
  v2ex_favorite: {
    heading: '收藏的主题',
    title: [],
    preview: { table: 'v2ex_topic', column: 'topic_id' },
  },
  v2ex_reply: {
    heading: '主题回复',
    title: [],
    subtitle: [{ column: 'member_json', path: ['username'] }],
    content: [['content_rendered', 'content']],
    stats: ['thanks'],
    meta: ['reply_id', 'created'],
    related: [{ label: '查看主题', table: 'v2ex_topic', column: 'topic_id', mode: 'detail' }],
  },
  v2ex_thanks: {
    title: ['topic_title'],
    subtitle: ['member', 'content_kind'],
    content: ['description'],
    stats: ['amount', 'balance'],
    meta: ['thanked_at'],
    preview: { table: 'v2ex_topic', column: 'topic_id' },
  },
  v2ex_topic: {
    title: ['title'],
    subtitle: [
      { column: 'node_json', path: ['title'] },
      { column: 'member_json', path: ['username'] },
    ],
    content: ['content'],
    stats: ['replies'],
    meta: ['created', 'last_touched', 'last_reply_by'],
    url: 'url',
    sources: [
      {
        table: 'v2ex_favorite',
        column: 'topic_id',
        label: '收藏',
        timeColumn: 'db_updated_at',
        timeLabel: '同步',
      },
      {
        table: 'v2ex_thanks',
        column: 'topic_id',
        label: '感谢',
        timeColumn: 'thanked_at',
        timeLabel: '最近',
      },
    ],
    children: {
      table: 'v2ex_reply',
      column: 'topic_id',
      label: '回复',
      sort: { column: 'created', dir: 'asc' },
      limit: 200,
      emptyText: '暂无回复。',
      title: [{ column: 'member_json', path: ['username'] }],
      content: [['content_rendered', 'content']],
      meta: ['created', { column: 'thanks', label: '感谢' }],
    },
  },
  weibo_post: {
    title: [{ column: 'user_json', path: ['screen_name'] }],
    subtitle: ['created_at'],
    content: [['long_text', 'text'], 'pic_infos_json'],
    stats: ['reposts_count', 'comments_count', 'attitudes_count'],
    meta: ['pic_num', 'region_name'],
    url: { column: 'mblogid', template: 'https://m.weibo.cn/detail/{value}' },
  },
  zhihu_collection_item: {
    heading: '收藏的内容',
    title: [],
    preview: { table: 'zhihu_content', column: 'content_id' },
    meta: ['created'],
  },
  zhihu_content: {
    title: ['title'],
    subtitle: [
      { column: 'author_json', path: ['name'] },
      'type',
    ],
    content: ['body_html'],
    stats: ['voteup_count', 'comment_count'],
    meta: ['created_time', 'updated_time'],
    url: 'url',
    sources: [
      {
        table: 'zhihu_collection_item',
        column: 'content_id',
        label: '知乎收藏夹',
        timeColumn: 'created',
        timeLabel: '收藏',
      },
    ],
  },
}

export function detailConfigFor(table: string): DetailConfig | undefined {
  return DETAIL_CONFIGS[table]
}

/**
 * Read a config field, optionally walking into JSON objects/arrays. String
 * specs also accept `json_column.path.0.name` as a shorthand.
 */
export function detailFieldValue(
  row: Record<string, unknown> | null | undefined,
  spec: string | DetailFieldSpec | undefined,
): unknown {
  if (!row || !spec) return undefined
  let resolved: DetailFieldSpec
  if (typeof spec === 'string') {
    const [column, ...segments] = spec.split('.')
    const path = segments.map((segment) =>
      /^\d+$/.test(segment) ? Number(segment) : segment,
    )
    resolved = path.length ? { column, path } : { column }
  } else {
    resolved = spec
  }
  let value = row[resolved.column]
  if (value === undefined || value === null) return undefined

  if (typeof value === 'string' && resolved.path?.length) {
    try {
      value = JSON.parse(value)
    } catch {
      return undefined
    }
  }

  for (const segment of resolved.path ?? []) {
    if (Array.isArray(value)) {
      value = value[Number(segment)]
    } else if (value && typeof value === 'object') {
      value = (value as Record<string, unknown>)[String(segment)]
    } else {
      return undefined
    }
    if (value === undefined || value === null) return undefined
  }
  return value
}

/** First non-empty field wins, so `name_cn || name` works without extra code. */
export function firstDetailValue(
  row: Record<string, unknown> | null | undefined,
  specs: Array<string | DetailFieldSpec> | undefined,
): unknown {
  for (const spec of specs ?? []) {
    const value = detailFieldValue(row, spec)
    if (value !== undefined && value !== null && value !== '') return value
  }
  return undefined
}

/** Resolve a templated URL such as `https://bgm.tv/subject/{value}`. */
export function detailUrl(
  row: Record<string, unknown> | null | undefined,
  spec: string | DetailFieldSpec | undefined,
): string | undefined {
  if (!row || !spec) return undefined
  const resolved: DetailFieldSpec = typeof spec === 'string' ? { column: spec } : spec
  const raw = detailFieldValue(row, resolved)
  if (raw === undefined || raw === null || raw === '') return undefined
  const text = String(raw)
  if (!resolved.template) return /^https?:\/\//i.test(text) ? text : undefined
  return resolved.template.replace('{value}', encodeURIComponent(text))
}

export function detailFieldLabel(
  table: string,
  spec: string | DetailFieldSpec | undefined,
): string {
  if (!spec) return ''
  if (typeof spec !== 'string' && spec.label) return spec.label
  const column = typeof spec === 'string' ? spec.split('.', 1)[0] : spec.column
  return columnLabel(table, column)
}

export function detailFieldPrefix(spec: string | DetailFieldSpec | undefined): string {
  return typeof spec === 'object' ? (spec.prefix ?? '') : ''
}

