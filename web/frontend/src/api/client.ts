import type { HealthResponse, SchemaResponse } from './types'

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
}
