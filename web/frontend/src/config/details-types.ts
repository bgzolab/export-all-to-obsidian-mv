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

/** Load a readable body from a second table matched by URL or key. */
export interface DetailLookupSpec {
  table: string
  /** Column on the current row. */
  column: string
  /** Target filter column; defaults to `column`. */
  targetColumn?: string
  label: string
  /** First non-empty field wins. */
  fields: Array<string | DetailFieldSpec>
  emptyText: string
}

/** Provenance rows such as likes, bookmarks, favorites or thanks. */
export interface DetailSourceSpec {
  table: string
  /** Column on the current row. */
  column: string
  /** Target filter column; defaults to `column`. */
  targetColumn?: string
  label: string
  timeColumn?: string
  timeLabel?: string
}

/** Child rows rendered inline in a detail page. */
export interface DetailChildrenSpec {
  table: string
  /** Column on the current row. */
  column: string
  /** Target filter column; defaults to `column`. */
  targetColumn?: string
  label: string
  sort?: { column: string; dir: 'asc' | 'desc' }
  limit?: number
  emptyText?: string
  title?: Array<string | DetailFieldSpec>
  content?: Array<string | DetailFieldSpec | Array<string | DetailFieldSpec>>
  meta?: Array<string | DetailFieldSpec>
}

/** Many-to-many folders (Bilibili favorite folders). */
export interface FolderSpec {
  /** Join table carrying source key, folder key and optional time. */
  linkTable: string
  /** Column on the current row. */
  linkColumn: string
  /** Link-table column matching `linkColumn`. */
  linkTargetColumn: string
  /** Link-table column holding the folder key. */
  linkKeyColumn: string
  linkTimeColumn?: string
  folderTable: string
  folderKeyColumn: string
  folderTitle: Array<string | DetailFieldSpec>
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
  lookup?: DetailLookupSpec
  sources?: DetailSourceSpec[]
  children?: DetailChildrenSpec
  folders?: FolderSpec
}
