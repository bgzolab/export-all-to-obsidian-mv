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

export interface RunSummary {
  id: number
  platform: string
  operation: string
  scope: string | null
  command: string | null
  started_at: string
  finished_at: string | null
  status: string
  error: string | null
}

export interface RunsResponse {
  runs: RunSummary[]
  total: number
  limit: number
  offset: number
}

export interface RunDetailResponse {
  run: RunSummary
  response_count: number
}

export interface ResponseSummary {
  id: number
  run_id: number
  endpoint: string
  request: unknown
  status_code: number | null
  fetched_at: string
  sha256: string | null
  error: string | null
}

export interface ResponsesResponse {
  responses: ResponseSummary[]
  total: number
  limit: number
  offset: number
}

export interface ResponseDetail extends ResponseSummary {
  body: unknown
  body_truncated: boolean
  body_size: number
  content_type: 'json' | 'text' | 'empty'
}
