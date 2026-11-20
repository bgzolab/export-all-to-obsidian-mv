export interface ColumnMeta {
  name: string
  type: string
  not_null?: boolean
  pk?: number
  json: boolean
  hidden?: boolean
}

export interface TableMeta {
  name: string
  platform: string
  kind: 'projection' | 'raw'
  row_count: number
  primary_key: string[]
  columns: ColumnMeta[]
}

export interface SchemaResponse {
  tables: TableMeta[]
  platforms: Record<string, number>
}

export interface HealthResponse {
  status: string
  db: string
  user_version: number
  readonly: boolean
}

export interface SortSpec {
  column: string
  dir: 'asc' | 'desc'
}

export interface FilterSpec {
  column: string
  op: string
  value: unknown
}

export interface QueryRequest {
  columns?: string[]
  filters?: FilterSpec[]
  search?: string
  sort?: SortSpec[]
  limit?: number
  offset?: number
}

export interface QueryResponse {
  table: string
  columns: Array<{ name: string; type: string; json: boolean }>
  rows: Array<Record<string, unknown>>
  total: number
  limit: number
  offset: number
}
