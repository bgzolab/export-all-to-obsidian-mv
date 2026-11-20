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
