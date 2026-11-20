import type {
  HealthResponse,
  QueryRequest,
  QueryResponse,
  SchemaResponse,
} from './types'

/**
 * Error thrown for non-2xx API responses. `detail` mirrors the backend's
 * `{"detail": "..."}` body so views can show a useful message.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface RowResponse {
  table: string
  row: Record<string, unknown>
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  })
  if (!response.ok) {
    let detail = response.statusText
    try {
      const body = await response.json()
      detail = body.detail ?? detail
    } catch {
      // Non-JSON error bodies keep the status text.
    }
    throw new ApiError(detail, response.status)
  }
  return response.json() as Promise<T>
}

export const api = {
  health: () => request<HealthResponse>('/health'),
  schema: () => request<SchemaResponse>('/schema'),
  queryTable: (table: string, body: QueryRequest) =>
    request<QueryResponse>(`/tables/${encodeURIComponent(table)}/query`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getRow: (table: string, pk: Record<string, unknown>) =>
    request<RowResponse>(`/tables/${encodeURIComponent(table)}/row`, {
      method: 'POST',
      body: JSON.stringify({ pk }),
    }),
}
