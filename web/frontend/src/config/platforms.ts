/**
 * User-facing platform catalogue. Counts are read from the live schema by
 * table name; the copy here only explains what each platform means and which
 * table is the main "saved items" list.
 */
export interface PlatformMetric {
  label: string
  table: string
  unit: string
}

export interface PlatformConfig {
  key: string
  label: string
  mark: string
  color: string
  description: string
  primaryTable: string
  metrics: PlatformMetric[]
}

export const PLATFORMS: PlatformConfig[] = [
  {
    key: 'bangumi',
    label: 'Bangumi',
    mark: '番',
    color: '#c2415a',
    description: '动画、书籍与游戏的收藏进度',
    primaryTable: 'bangumi_collection',
    metrics: [
      { label: '收藏', table: 'bangumi_collection', unit: '条' },
      { label: '条目资料', table: 'bangumi_subject', unit: '条' },
    ],
  },
  {
    key: 'bilibili',
    label: '哔哩哔哩',
    mark: 'B',
    color: '#d9366f',
    description: '收藏夹里的视频与专栏',
    primaryTable: 'bilibili_media',
    metrics: [
      { label: '收藏视频', table: 'bilibili_media', unit: '个' },
      { label: '收藏夹', table: 'bilibili_fav', unit: '个' },
    ],
  },
  {
    key: 'cnblog',
    label: '博客园',
    mark: '园',
    color: '#2563eb',
    description: '收藏的博客文章与已抓取正文',
    primaryTable: 'cnblog_bookmark',
    metrics: [
      { label: '收藏文章', table: 'cnblog_bookmark', unit: '篇' },
      { label: '已抓正文', table: 'cnblog_post', unit: '篇' },
    ],
  },
  {
    key: 'github',
    label: 'GitHub',
    mark: 'G',
    color: '#24292f',
    description: 'Star 过的开源仓库',
    primaryTable: 'github_star',
    metrics: [{ label: 'Star 仓库', table: 'github_star', unit: '个' }],
  },
  {
    key: 'netease',
    label: '网易云音乐',
    mark: '云',
    color: '#c62f2f',
    description: '歌单、曲库与最近播放',
    primaryTable: 'netease_song',
    metrics: [
      { label: '收藏歌曲', table: 'netease_song', unit: '首' },
      { label: '歌单', table: 'netease_playlist', unit: '个' },
      { label: '播放记录', table: 'netease_play_record', unit: '条' },
    ],
  },
  {
    key: 'qireader',
    label: 'QiReader',
    mark: '阅',
    color: '#0f766e',
    description: 'RSS 稍后读与文章正文',
    primaryTable: 'qireader_entry',
    metrics: [
      { label: '稍后读', table: 'qireader_entry', unit: '条' },
      { label: '已抓正文', table: 'qireader_article', unit: '篇' },
    ],
  },
  {
    key: 'twitter',
    label: 'Twitter / X',
    mark: 'X',
    color: '#0b63b8',
    description: '喜欢的推文与书签',
    primaryTable: 'twitter_like',
    metrics: [
      { label: '喜欢', table: 'twitter_like', unit: '条' },
      { label: '书签', table: 'twitter_bookmark', unit: '条' },
      { label: '推文', table: 'twitter_tweet', unit: '条' },
    ],
  },
  {
    key: 'v2ex',
    label: 'V2EX',
    mark: 'V',
    color: '#52525b',
    description: '收藏主题、感谢记录与回复',
    primaryTable: 'v2ex_favorite',
    metrics: [
      { label: '收藏主题', table: 'v2ex_favorite', unit: '个' },
      { label: '感谢记录', table: 'v2ex_thanks', unit: '条' },
      { label: '回复', table: 'v2ex_reply', unit: '条' },
    ],
  },
  {
    key: 'weibo',
    label: '微博',
    mark: '微',
    color: '#c81e2e',
    description: '保存的微博正文与图片',
    primaryTable: 'weibo_post',
    metrics: [{ label: '微博', table: 'weibo_post', unit: '条' }],
  },
  {
    key: 'zhihu',
    label: '知乎',
    mark: '知',
    color: '#0f5ed7',
    description: '收藏的回答、文章与想法',
    primaryTable: 'zhihu_content',
    metrics: [{ label: '收藏内容', table: 'zhihu_content', unit: '条' }],
  },
]

const PLATFORM_BY_KEY = new Map(PLATFORMS.map((platform) => [platform.key, platform]))
const PLATFORM_LABELS: Record<string, string> = Object.fromEntries(
  PLATFORMS.map((platform) => [platform.key, platform.label]),
)

export function platformLabel(key: string): string {
  return PLATFORM_LABELS[key] ?? key
}

export function platformConfigFor(key: string): PlatformConfig | undefined {
  return PLATFORM_BY_KEY.get(key)
}

/** Table names are prefixed with the platform key (`zhihu_content`). */
export function platformKeyForTable(table: string): string {
  return table.split('_', 1)[0]
}

export function platformConfigForTable(table: string): PlatformConfig | undefined {
  return platformConfigFor(platformKeyForTable(table))
}

/** Configured platforms present in the schema, then any future platform. */
export function platformKeys(schemaKeys: string[]): string[] {
  const known = PLATFORMS.map((platform) => platform.key)
  const present = known.filter((key) => schemaKeys.includes(key))
  const extra = schemaKeys.filter((key) => key !== 'raw' && !known.includes(key)).sort()
  return [...present, ...extra]
}
