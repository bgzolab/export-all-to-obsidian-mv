export interface DetailFieldSpec {
  column: string
  label?: string
  /** Walk into a decoded JSON object/array; numeric segments index arrays. */
  path?: Array<string | number>
  prefix?: string
  /** `{value}` is replaced with the URL-encoded field value. */
  template?: string
}

export interface DetailRelatedSpec {
  label: string
  table: string
  /** Column on the current row that holds the target key/value. */
  column: string
  /** Target filter column; defaults to `column`. */
  targetColumn?: string
  /** `detail` links to one row; `filter` (default) opens the target list. */
  mode?: 'detail' | 'filter'
}

export interface DetailPreviewSpec {
  table: string
  column: string
  targetColumn?: string
}

export interface DetailConfig {
  /** Static fallback heading for relation tables without a natural title. */
  heading?: string
  title: Array<string | DetailFieldSpec>
  subtitle?: Array<string | DetailFieldSpec>
  cover?: string | DetailFieldSpec
  /** A nested array is a fallback chain: first non-empty field wins. */
  content?: Array<string | DetailFieldSpec | Array<string | DetailFieldSpec>>
  /** Short text used by preview cards instead of the first content field. */
  previewText?: string | DetailFieldSpec
  meta?: Array<string | DetailFieldSpec>
  stats?: Array<string | DetailFieldSpec>
  url?: string | DetailFieldSpec
  related?: DetailRelatedSpec[]
  preview?: DetailPreviewSpec
  embed?: 'bilibili' | 'netease-song' | 'netease-playlist'
}
