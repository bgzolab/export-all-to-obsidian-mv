export interface TweetMedia {
  type: string
  /** Photo, or the poster frame for a video/GIF. */
  url: string
  videoUrl?: string
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}

function parseBody(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

/** The timeline nests tweets under user/timeline/instructions/entries. */
function findTweet(value: unknown, tweetId: string): Record<string, unknown> | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findTweet(item, tweetId)
      if (found) return found
    }
    return undefined
  }
  const record = asRecord(value)
  if (!record) return undefined

  const legacy = asRecord(record.legacy)
  const id = asString(legacy?.id_str) ?? asString(record.rest_id)
  if (legacy && id === tweetId) return record

  for (const child of Object.values(record)) {
    const found = findTweet(child, tweetId)
    if (found) return found
  }
  return undefined
}

function mediaItem(value: unknown): TweetMedia | undefined {
  const record = asRecord(value)
  if (!record) return undefined
  const url = asString(record.media_url_https) ?? asString(record.media_url)
  if (!url || !/^https?:\/\//i.test(url)) return undefined

  const type = asString(record.type) ?? 'photo'
  let videoUrl: string | undefined
  if (type === 'video' || type === 'animated_gif') {
    const variants = asRecord(record.video_info)?.variants
    let bestBitrate = -1
    for (const item of Array.isArray(variants) ? variants : []) {
      const variant = asRecord(item)
      if (!variant || variant.content_type !== 'video/mp4') continue
      const candidate = asString(variant.url)
      const bitrate = Number(variant.bitrate ?? 0)
      if (candidate && /^https?:\/\//i.test(candidate) && bitrate > bestBitrate) {
        bestBitrate = bitrate
        videoUrl = candidate
      }
    }
  }
  return { type, url, videoUrl }
}

function mediaArray(tweet: Record<string, unknown> | undefined): unknown[] {
  const legacy = asRecord(tweet?.legacy)
  const extended = asRecord(legacy?.extended_entities)?.media
  const entities = asRecord(legacy?.entities)?.media
  return Array.isArray(extended) ? extended : Array.isArray(entities) ? entities : []
}

/**
 * Read attached media from the raw likes/bookmarks page that produced a tweet.
 * The projection only keeps text and counters, so the detail page uses the
 * tweet's `response_id` to recover photos and video variants.
 */
export function findTweetMedia(payload: unknown, tweetId: string): TweetMedia[] {
  const tweet = findTweet(parseBody(payload), tweetId)
  if (!tweet) return []
  let media = mediaArray(tweet)
  if (!media.length) {
    // A retweet keeps the original media inside retweeted_status_result.
    const retweeted = asRecord(asRecord(asRecord(tweet.legacy)?.retweeted_status_result)?.result)
    media = mediaArray(retweeted)
  }
  if (!media.length) return []

  const result: TweetMedia[] = []
  const seen = new Set<string>()
  for (const item of media) {
    const parsed = mediaItem(item)
    if (!parsed) continue
    const key = `${parsed.url}\n${parsed.videoUrl ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(parsed)
  }
  return result
}
