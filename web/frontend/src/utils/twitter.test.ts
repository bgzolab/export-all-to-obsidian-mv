import { describe, expect, it } from 'vitest'

import { findTweetMedia } from './twitter'

function payload(tweet: unknown) {
  return {
    data: {
      user: {
        result: {
          timeline_v2: {
            timeline: { instructions: [{ entries: [{ content: { itemContent: { tweet_results: { result: tweet } } } }] }] },
          },
        },
      },
    },
  }
}

describe('tweet media extraction', () => {
  it('finds photos and the highest-bitrate mp4 variant', () => {
    const tweet = {
      legacy: {
        id_str: '42',
        extended_entities: {
          media: [
            { type: 'photo', media_url_https: 'https://img.test/a.jpg' },
            {
              type: 'video',
              media_url_https: 'https://img.test/poster.jpg',
              video_info: {
                variants: [
                  { content_type: 'video/mp4', bitrate: 100, url: 'https://video.test/low.mp4' },
                  { content_type: 'video/mp4', bitrate: 900, url: 'https://video.test/high.mp4' },
                ],
              },
            },
          ],
        },
      },
    }
    expect(findTweetMedia(payload(tweet), '42')).toEqual([
      { type: 'photo', url: 'https://img.test/a.jpg', videoUrl: undefined },
      {
        type: 'video',
        url: 'https://img.test/poster.jpg',
        videoUrl: 'https://video.test/high.mp4',
      },
    ])
  })

  it('unwraps TweetWithVisibilityResults and accepts a raw JSON string', () => {
    const tweet = {
      __typename: 'TweetWithVisibilityResults',
      tweet: {
        legacy: {
          id_str: '7',
          entities: { media: [{ type: 'photo', media_url: 'https://img.test/b.png' }] },
        },
      },
    }
    expect(findTweetMedia(JSON.stringify(payload(tweet)), '7')).toEqual([
      { type: 'photo', url: 'https://img.test/b.png', videoUrl: undefined },
    ])
  })

  it('falls back to the retweeted tweet media', () => {
    const tweet = {
      legacy: {
        id_str: '11',
        retweeted_status_result: {
          result: {
            legacy: {
              id_str: '10',
              extended_entities: {
                media: [{ type: 'photo', media_url_https: 'https://img.test/rt.jpg' }],
              },
            },
          },
        },
      },
    }
    expect(findTweetMedia(payload(tweet), '11')).toEqual([
      { type: 'photo', url: 'https://img.test/rt.jpg', videoUrl: undefined },
    ])
  })

  it('returns an empty list for text-only or missing tweets', () => {
    expect(findTweetMedia(payload({ rest_id: '8', legacy: { id_str: '8' } }), '8')).toEqual([])
    expect(findTweetMedia(payload({ legacy: { id_str: '9' } }), '404')).toEqual([])
    expect(findTweetMedia('not json', '9')).toEqual([])
    expect(
      findTweetMedia(
        payload({
          legacy: {
            id_str: '12',
            extended_entities: { media: [{ type: 'photo', media_url_https: 'javascript:alert(1)' }] },
          },
        }),
        '12',
      ),
    ).toEqual([])
  })
})
