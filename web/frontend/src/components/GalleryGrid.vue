<script setup lang="ts">
import { computed, reactive } from 'vue'

import type { TableMeta } from '@/api/types'
import type { FolderSpec, GalleryConfig } from '@/config/tables'
import type { FolderEntry } from '@/utils/extras'
import { coverInitial, galleryCard, galleryRowKey } from '@/utils/gallery'

const props = defineProps<{
  table: TableMeta
  rows: Array<Record<string, unknown>>
  config: GalleryConfig
  folders?: Map<string, FolderEntry[]>
  folderSpec?: FolderSpec
}>()

const emit = defineEmits<{ open: [row: Record<string, unknown>] }>()

const failedCovers = reactive(new Set<string>())

const cards = computed(() =>
  props.rows.map((row) => ({
    row,
    key: galleryRowKey(props.table, row),
    card: galleryCard(props.table, props.config, row, {
      folders: props.folders,
      folderSpec: props.folderSpec,
    }),
  })),
)

function markFailed(url: string) {
  failedCovers.add(url)
}

function open(row: Record<string, unknown>) {
  emit('open', row)
}
</script>

<template>
  <div class="gallery-grid" :class="`aspect-${config.aspect ?? 'video'}`">
    <button
      v-for="item in cards"
      :key="item.key"
      type="button"
      class="gallery-card"
      @click="open(item.row)"
    >
      <span class="gallery-cover">
        <img
          v-if="item.card.cover && !failedCovers.has(item.card.cover)"
          :src="item.card.cover"
          :alt="item.card.title"
          loading="lazy"
          referrerpolicy="no-referrer"
          @error="markFailed(item.card.cover)"
        />
        <span v-else class="gallery-placeholder">{{ coverInitial(item.card.title) }}</span>
      </span>
      <span class="gallery-body">
        <span class="gallery-title" :title="item.card.title">{{ item.card.title }}</span>
        <span v-if="item.card.subtitle" class="gallery-subtitle">
          {{ item.card.subtitle }}
        </span>
        <span v-if="item.card.badges.length" class="gallery-badges">
          <span v-for="badge in item.card.badges" :key="badge" class="gallery-badge">
            {{ badge }}
          </span>
        </span>
        <span v-if="item.card.folders.length" class="gallery-folders">
          <span
            v-for="folder in item.card.folders"
            :key="`${folder.folder}-${folder.time}`"
            class="gallery-folder"
          >
            {{ folder.folder }}<em v-if="folder.time"> · {{ folder.time }}</em>
          </span>
        </span>
        <span v-if="item.card.meta.length" class="gallery-meta">
          <span v-for="meta in item.card.meta" :key="meta.label">
            <b>{{ meta.label }}</b> {{ meta.value }}
          </span>
        </span>
      </span>
    </button>
  </div>
</template>

<style scoped>
.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(178px, 1fr));
  gap: 14px;
  padding: 4px 2px 20px;
}

.gallery-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  transition:
    border-color 120ms ease,
    box-shadow 120ms ease,
    transform 120ms ease;
}

.gallery-card:hover {
  border-color: var(--primary-border);
  box-shadow: 0 6px 18px rgba(30, 41, 59, 0.09);
  transform: translateY(-1px);
}

.gallery-card:focus-visible {
  outline: 2px solid var(--primary-strong);
  outline-offset: 2px;
}

.gallery-cover {
  position: relative;
  display: block;
  width: 100%;
  background: var(--surface-sunken);
  overflow: hidden;
}

.aspect-poster .gallery-cover {
  aspect-ratio: 2 / 3;
}

.aspect-video .gallery-cover {
  aspect-ratio: 16 / 9;
}

.gallery-cover img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.gallery-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-height: 96px;
  background: linear-gradient(135deg, var(--surface-hover), var(--border));
  color: var(--muted-light);
  font-size: 28px;
  font-weight: 600;
}

.gallery-body {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
  padding: 10px 11px 12px;
}

.gallery-title {
  display: -webkit-box;
  overflow: hidden;
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.gallery-subtitle {
  overflow: hidden;
  color: var(--muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gallery-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.gallery-badge {
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--surface-hover);
  color: var(--text-tertiary);
  font-size: 10px;
}

.gallery-folders {
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: var(--muted);
  font-size: 10px;
}

.gallery-folder em {
  color: var(--muted-light);
  font-style: normal;
}

.gallery-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 8px;
  color: var(--muted-light);
  font-size: 10px;
}

.gallery-meta b {
  color: var(--muted-light);
  font-weight: 500;
}
</style>
