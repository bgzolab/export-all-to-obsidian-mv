/**
 * Human-facing names and small value dictionaries for the projection tables.
 * Raw column names stay available in tooltips and the detail "all fields"
 * section, but every list, filter and form should show these labels instead.
 */
const COLUMN_LABELS: Record<string, string> = {
  album_json: '专辑',
  alias_json: '别名',
  amount: '变动金额',
  archived: '已归档',
  artists_json: '歌手',
  attachments_json: '附件',
  attr: '属性',
  attitudes_count: '赞',
  author_json: '作者',
  balance: '余额',
  banned: '已下架',
  body: '正文',
  body_html: '正文',
  bv_id: 'BV 号',
  bvid: 'BV 号',
  characters_json: '角色',
  characters_response_id: '角色响应',
  collection_json: '收藏统计',
  collection_id: '收藏夹',
  comment: '短评',
  comment_count: '评论',
  comments_count: '评论',
  command: '命令',
  content: '内容',
  content_id: '内容 ID',
  content_json: '内容 JSON',
  content_kind: '对象类型',
  content_rendered: '正文 HTML',
  cnt_info_json: '互动数据',
  cover: '封面',
  cover_img_url: '封面',
  cover_type: '封面类型',
  crawled_at: '抓取时间',
  create_time: '创建时间',
  created: '创建时间',
  created_at: '发布时间',
  created_time: '创建时间',
  creator_id: '创建者 ID',
  creator_json: '创建者',
  ctime: '创建时间',
  date: '日期',
  date_added: '收藏时间',
  db_created_at: '首次同步',
  db_updated_at: '同步时间',
  description: '简介',
  detail_response_id: '详情响应',
  detail_track_count: '详情曲目数',
  detail_track_update_time: '详情曲目更新时间',
  device_json: '设备',
  duration: '时长',
  endpoint: '接口',
  entry_id: '条目 ID',
  ep_status: '话进度',
  eps: '话数',
  error: '错误',
  fav_id: '收藏夹 ID',
  fav_state: '收藏状态',
  fav_time: '收藏时间',
  favorite_count: '喜欢',
  favorited: '已收藏',
  fee: '付费类型',
  fetched_at: '抓取时间',
  fid: '收藏夹 ID',
  finished_at: '结束时间',
  fork: 'Fork',
  forks_count: 'Forks',
  from_cnblogs: '来自博客园',
  full_name: '仓库',
  full_text: '正文',
  homepage: '主页',
  html_url: '仓库链接',
  id: 'ID',
  images_json: '图片',
  infobox_json: '信息栏',
  intro: '简介',
  is_long_text: '长文',
  is_saved: '已收藏',
  is_top: '置顶',
  language: '语言',
  last_modified: '最后修改',
  last_reply_by: '最后回复者',
  last_touched: '最后活跃',
  license: '许可证',
  like_state: '点赞状态',
  link: '链接',
  link_url: '原文链接',
  locked: '锁定',
  long_text: '长文正文',
  long_text_response_id: '长文响应',
  media_count: '内容数',
  media_id: '媒体 ID',
  media_list_link: '合集链接',
  member: '用户',
  member_json: '用户',
  meta_tags_json: '标签',
  metadata_missing: '元数据缺失',
  mblogid: '微博短 ID',
  mid: '用户 ID',
  mtime: '更新时间',
  mv: 'MV ID',
  name: '名称',
  name_cn: '中文名',
  node_json: '节点',
  nsfw: 'NSFW',
  numeric_id: '数字 ID',
  ogv_json: '番剧信息',
  open_issues_count: 'Issues',
  operation: '操作',
  ordered: '排序',
  origin_json: '来源',
  owner_login: '所有者',
  page: '分 P 数',
  pic_ids_json: '图片 ID',
  pic_infos_json: '图片',
  pic_num: '图片数',
  platform: '平台',
  play_count: '播放量',
  play_time: '播放时间',
  playlist_id: '歌单 ID',
  pop: '热度',
  position: '序号',
  post_id: '文章 ID',
  privacy: '私密',
  private: '私密',
  pubtime: '发布时间',
  publish_time: '发布时间',
  published_at: '发布时间',
  question_json: '问题',
  rate: '评分',
  rating_json: '评分',
  readme: 'README',
  readme_response_id: 'README 响应',
  redirect: '重定向',
  region_name: '地区',
  reply_count: '回复',
  reply_id: '回复 ID',
  replies: '回复数',
  repo_id: '仓库 ID',
  repo_name: '仓库名',
  reposts_count: '转发',
  request: '请求',
  resource_type: '资源类型',
  response_id: '原始响应',
  retweet_count: '转发',
  run_id: '同步批次',
  scope: '范围',
  season_json: '剧集信息',
  series: '系列',
  sha256: 'SHA-256',
  song_id: '歌曲 ID',
  song_json: '歌曲',
  source: '来源',
  source_entry_id: '源条目 ID',
  source_url: '原文链接',
  special_type: '歌单类型',
  starred_at: 'Star 时间',
  stargazers_count: 'Stars',
  started_at: '开始时间',
  state: '状态',
  status: '状态',
  status_code: 'HTTP 状态',
  subject_id: '条目 ID',
  subject_json: '条目',
  subject_type: '条目类型',
  subscribed: '已订阅',
  subscribed_count: '订阅数',
  summary: '摘要',
  supplements_json: '附言',
  syntax: '语法',
  tag_ids_json: '标签 ID',
  tags_json: '标签',
  text: '正文',
  text_raw: '正文纯文本',
  thanked_at: '感谢时间',
  thanks: '感谢数',
  timestamp: '时间戳',
  title: '标题',
  topic_id: '主题 ID',
  topic_title: '主题标题',
  topics_json: '标签',
  total_episodes: '总集数',
  track_count: '曲目数',
  track_update_time: '曲目更新时间',
  trans_names_json: '译名',
  tweet_id: '推文 ID',
  type: '类型',
  type_id: '条目类型',
  ugc_json: 'UGC 信息',
  updated_at: '更新时间',
  updated_time: '更新时间',
  update_time: '更新时间',
  upper_json: 'UP 主',
  url: '链接',
  user_json: '用户',
  version: '版本',
  view_count: '阅读量',
  vol_status: '卷进度',
  volumes: '卷数',
  voteup_count: '赞同',
  wz_link_id: '收藏 ID',
}

/**
 * Column names that mean something different per platform. Keep this list
 * small: only add an override when the generic label above would mislead.
 */
const TABLE_COLUMN_LABELS: Record<string, Record<string, string>> = {
  bangumi_collection: {
    collection_id: '收藏 ID',
    type: '收藏类型',
    subject_type: '条目类型',
    updated_at: '收藏时间',
  },
  bangumi_subject: {
    date: '发售日期',
    name: '原名',
    type_id: '条目类型',
  },
  bilibili_fav: {
    type: '收藏夹类型',
  },
  bilibili_media: {
    type: '内容类型',
  },
  cnblog_post: {
    source_url: '原文链接',
  },
  github_star: {
    description: '仓库简介',
    created_at: '仓库创建时间',
    updated_at: '仓库更新时间',
    pushed_at: '最后推送',
    starred_at: 'Star 时间',
  },
  netease_playlist: {
    name: '歌单名称',
    type: '歌单类型',
  },
  netease_song: {
    name: '歌曲名',
  },
  sync_response: {
    id: '响应 ID',
  },
  sync_run: {
    id: '批次 ID',
  },
  v2ex_reply: {
    content: '正文',
    created: '回复时间',
  },
  v2ex_thanks: {
    description: '说明',
  },
  v2ex_topic: {
    content: '正文',
    created: '发布时间',
  },
  weibo_post: {
    post_id: '微博 ID',
    text: '正文',
    user_json: '用户',
  },
  zhihu_content: {
    type: '内容类型',
    created_time: '发布时间',
    updated_time: '内容更新时间',
  },
  zhihu_collection_item: {
    created: '收藏时间',
  },
}

export function columnLabel(table: string, column: string): string {
  return TABLE_COLUMN_LABELS[table]?.[column] ?? COLUMN_LABELS[column] ?? column
}

const BOOLEAN_COLUMNS = new Set([
  'archived',
  'banned',
  'favorited',
  'fork',
  'from_cnblogs',
  'is_long_text',
  'is_saved',
  'is_top',
  'locked',
  'metadata_missing',
  'nsfw',
  'ordered',
  'privacy',
  'private',
  'subscribed',
])

export function isBooleanColumn(column: string): boolean {
  return BOOLEAN_COLUMNS.has(column) || /^(is_|has_|can_)/.test(column)
}

const DURATION_UNITS: Record<string, 's' | 'ms'> = {
  'bilibili_media.duration': 's',
  'netease_song.duration': 'ms',
}

export function durationUnitFor(table: string, column: string): 's' | 'ms' | undefined {
  return DURATION_UNITS[`${table}.${column}`]
}

/** IDs stay ungrouped: `24722` must not render as `24,722`. */
export function isIdColumn(column: string): boolean {
  return column === 'id' || column.endsWith('_id') || column === 'sha256'
}

const COLUMN_VALUE_LABELS: Record<string, Record<string, string>> = {
  content_kind: { topic: '主题', reply: '回复' },
  resource_type: { SONG: '歌曲', ALBUM: '专辑', PLAYLIST: '歌单' },
  status: { success: '成功', partial: '部分完成', failed: '失败', running: '进行中' },
}

const TABLE_VALUE_LABELS: Record<string, Record<string, Record<string, string>>> = {
  bangumi_collection: {
    type: { '1': '想看', '2': '看过', '3': '在看', '4': '搁置', '5': '抛弃' },
    subject_type: { '1': '书籍', '2': '动画', '3': '音乐', '4': '游戏', '6': '三次元' },
  },
  bangumi_subject: {
    type_id: { '1': '书籍', '2': '动画', '3': '音乐', '4': '游戏', '6': '三次元' },
  },
  bilibili_fav: {
    type: { '11': '默认收藏夹' },
  },
  bilibili_media: {
    type: { '2': '视频', '12': '专栏', '21': '番剧' },
  },
  netease_song: {
    fee: { '0': '免费', '1': 'VIP', '4': '购买专辑', '8': '低音质免费' },
  },
  zhihu_content: {
    type: { answer: '回答', article: '文章', pin: '想法', zvideo: '视频' },
  },
}

export function valueLabelFor(table: string, column: string, value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  const key = String(value)
  return TABLE_VALUE_LABELS[table]?.[column]?.[key] ?? COLUMN_VALUE_LABELS[column]?.[key]
}

export function statusLabel(value: string): string {
  return COLUMN_VALUE_LABELS.status[value] ?? value
}

export function statusSeverity(value: string): 'success' | 'danger' | 'info' | 'warn' | 'secondary' {
  if (value === 'success') return 'success'
  if (value === 'failed') return 'danger'
  if (value === 'running') return 'info'
  if (value === 'partial') return 'warn'
  return 'secondary'
}

const OPERATION_LABELS: Record<string, string> = {
  bookmarks: '书签',
  collection: '收藏',
  collections: '收藏',
  favlist: '收藏夹',
  favorites: '收藏',
  likes: '喜欢',
  readlater: '稍后读',
  stars: 'Star',
  sync: '同步',
  tipped: '感谢',
}

export function operationLabel(value: string): string {
  return OPERATION_LABELS[value] ?? value
}
