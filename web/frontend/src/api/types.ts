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
