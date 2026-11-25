import bangumiIcon from '@/assets/platforms/bangumi.svg?url'
import bilibiliIcon from '@/assets/platforms/bilibili.svg?url'
import cnblogsIcon from '@/assets/platforms/cnblogs.svg?url'
import githubIcon from '@/assets/platforms/github.svg?url'
import neteaseIcon from '@/assets/platforms/netease.svg?url'
import qireaderIcon from '@/assets/platforms/qireader.svg?url'
import twitterIcon from '@/assets/platforms/twitter.svg?url'
import v2exIcon from '@/assets/platforms/v2ex.svg?url'
import weiboIcon from '@/assets/platforms/weibo.svg?url'
import zhihuIcon from '@/assets/platforms/zhihu.svg?url'

const ICONS: Record<string, string> = {
  bangumi: bangumiIcon,
  bilibili: bilibiliIcon,
  cnblog: cnblogsIcon,
  github: githubIcon,
  netease: neteaseIcon,
  qireader: qireaderIcon,
  twitter: twitterIcon,
  v2ex: v2exIcon,
  weibo: weiboIcon,
  zhihu: zhihuIcon,
}

export function platformIcon(key: string): string | undefined {
  return ICONS[key]
}

/** CSS variable consumed by the shared `.platform-icon` mask rules. */
export function platformIconStyle(key: string): Record<string, string> | undefined {
  const icon = platformIcon(key)
  return icon ? { '--icon-url': `url("${icon}")` } : undefined
}
