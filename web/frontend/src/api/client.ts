import type {
  HealthResponse,
  QueryRequest,
  QueryResponse,
  ResponseDetail,
  ResponsesResponse,
  RunDetailResponse,
  RunsResponse,
  SchemaResponse,
  TimelineHeatmapResponse,
  TimelineResponse,
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {  const response = await fetch(`/api${path}`, {
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
  timeline: (params: { day?: string; year?: number; limit?: number; offset?: number }) =>
    request<TimelineResponse>(`/timeline${queryString(params)}`),
  timelineHeatmap: (params: { year?: number } = {}) =>
    request<TimelineHeatmapResponse>(`/timeline/heatmap${queryString(params)}`),
  runs: (params: { platform?: string; status?: string; limit?: number; offset?: number }) =>
    request<RunsResponse>(`/runs${queryString(params)}`),
  run: (id: number | string) => request<RunDetailResponse>(`/runs/${id}`),
  responses: (params: {
    run_id?: number
    platform?: string
    endpoint?: string
    status_code?: number
    q?: string
    limit?: number
    offset?: number
  }) => request<ResponsesResponse>(`/responses${queryString(params)}`),
  response: (id: number | string) => request<ResponseDetail>(`/responses/${id}`),
}

/** Serialize defined params only; arrays are not used by the raw API. */
function queryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value))
  }
  const encoded = search.toString()
  return encoded ? `?${encoded}` : ''
}
