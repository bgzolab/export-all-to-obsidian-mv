import { describe, expect, it } from 'vitest'

import { platformConfigFor, platformKeys, platformLabel } from './platforms'

describe('platform catalogue', () => {
  it('shows configured platforms that exist in the database only', () => {
    expect(platformKeys(['zhihu', 'raw', 'future'])).toEqual(['zhihu', 'future'])
  })

  it('exposes friendly labels and primary tables', () => {
    expect(platformLabel('github')).toBe('GitHub')
    expect(platformConfigFor('twitter')?.primaryTable).toBe('twitter_tweet')
    expect(platformConfigFor('v2ex')?.primaryTable).toBe('v2ex_topic')
    expect(platformLabel('future')).toBe('future')
  })
})
