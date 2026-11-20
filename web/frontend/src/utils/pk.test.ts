import { describe, expect, it } from 'vitest'

import { decodePk, encodePk } from './pk'

describe('primary key encoding', () => {
  it('round-trips a single-column key', () => {
    const pk = { content_id: '2099831118455481183' }
    expect(decodePk(encodePk(pk))).toEqual(pk)
  })

  it('round-trips a composite key with mixed types', () => {
    const pk = { fav_id: 49128283, media_id: 24722 }
    expect(decodePk(encodePk(pk))).toEqual(pk)
  })

  it('round-trips UTF-8 values', () => {
    const pk = { slug: '如何看待中科大', id: 'a/b+c' }
    expect(decodePk(encodePk(pk))).toEqual(pk)
  })

  it('produces a URL-safe segment without padding', () => {
    const encoded = encodePk({ slug: 'a/b+c?' })
    expect(encoded).not.toMatch(/[+/=]/)
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('returns null for malformed input', () => {
    expect(decodePk('%%%')).toBeNull()
    expect(decodePk('')).toBeNull()
    expect(decodePk('bm90LWpzb24')).toBeNull()
  })
})
