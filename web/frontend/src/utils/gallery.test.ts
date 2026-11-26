import { describe, expect, it } from 'vitest'

import type { TableMeta } from '@/api/types'
import { BILIBILI_FOLDERS } from '@/config/tables'
import type { GalleryConfig } from '@/config/tables'
import type { FolderEntry } from './extras'
import { coverInitial, galleryCard, galleryRowKey } from './gallery'

function table(overrides: Partial<TableMeta> = {}): TableMeta {
  return {
    name: 'bangumi_collection',
    platform: 'bangumi',
    kind: 'projection',
    row_count: 1,
    primary_key: ['subject_id', 'collection_id'],
    columns: [
      { name: 'subject_id', type: 'INTEGER', json: false, pk: 1 },
      { name: 'collection_id', type: 'INTEGER', json: false, pk: 2 },
      { name: 'type', type: 'INTEGER', json: false },
      { name: 'subject_type', type: 'INTEGER', json: false },
      { name: 'rate', type: 'INTEGER', json: false },
      { name: 'ep_status', type: 'INTEGER', json: false },
      { name: 'updated_at', type: 'TEXT', json: false },
      { name: 'subject_json', type: 'TEXT', json: true },
    ],
    ...overrides,
  }
}

const gallery: GalleryConfig = {
  cover: ['subject_json.images.common', 'subject_json.images.large'],
  title: ['subject_json.name_cn', 'subject_json.name'],
  subtitle: ['subject_json.name'],
  badges: ['type', 'subject_type', 'rate'],
  meta: [
    { spec: 'updated_at', label: '收藏' },
    { spec: 'ep_status', label: '进度' },
  ],
  aspect: 'poster',
}

describe('gallery cards', () => {
  it('reads JSON title, cover, badges and meta from a collection row', () => {
    const card = galleryCard(table(), gallery, {
      subject_id: 12,
      collection_id: 3,
      type: 1,
      subject_type: 2,
      rate: 8,
      ep_status: 12,
      updated_at: '2026-11-20T12:00:00+08:00',
      subject_json: {
        name: 'ちょびっツ',
        name_cn: '人形电脑天使心',
        images: { common: 'https://img.test/cover.jpg' },
      },
    })
    expect(card.title).toBe('人形电脑天使心')
    expect(card.subtitle).toBe('ちょびっツ')
    expect(card.cover).toBe('https://img.test/cover.jpg')
    expect(card.badges).toEqual(['想看', '动画', '8 分'])
    expect(card.meta.map((item) => item.label)).toEqual(['收藏', '进度'])
    expect(card.meta[0]?.value).toContain('2026-11-20')
  })

  it('falls back to the original title and hides a duplicate subtitle', () => {
    const card = galleryCard(table(), gallery, {
      subject_id: 1,
      collection_id: 2,
      subject_json: { name: 'Original' },
    })
    expect(card.title).toBe('Original')
    expect(card.subtitle).toBe('')
    expect(card.cover).toBe('')
  })

  it('attaches Bilibili favorite folders by media id', () => {
    const media = table({
      name: 'bilibili_media',
      platform: 'bilibili',
      primary_key: ['media_id'],
      columns: [
        { name: 'media_id', type: 'INTEGER', json: false, pk: 1 },
        { name: 'title', type: 'TEXT', json: false },
        { name: 'cover', type: 'TEXT', json: false },
      ],
    })
    const folders = new Map<string, FolderEntry[]>([
      ['42', [{ folder: '默认收藏夹', time: '2026-11-20 12:00' }]],
    ])
    const card = galleryCard(
      media,
      { title: ['title'], cover: ['cover'], folders: true },
      { media_id: 42, title: '视频', cover: '//i0.hdslb.com/a.jpg' },
      { folders, folderSpec: BILIBILI_FOLDERS },
    )
    expect(card.cover).toBe('https://i0.hdslb.com/a.jpg')
    expect(card.folders[0]?.folder).toBe('默认收藏夹')
  })

  it('builds stable keys and placeholder initials', () => {
    expect(galleryRowKey(table(), { subject_id: 12, collection_id: 3 })).toBe('12|3')
    expect(coverInitial('  人形电脑天使心')).toBe('人')
    expect(coverInitial('')).toBe('?')
  })
})
