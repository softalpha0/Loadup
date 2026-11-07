import type { ApiErrorBody } from '../../shared/types'

const TOKEN_KEY = 'loadup:token'

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}
export function setToken(t: string | null) {
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY) } catch { /* ignore */ }
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: any) {
    super(message)
  }
}

let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(fn: () => void) { onUnauthorized = fn }

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const token = getToken()
  let res: Response
  try {
    res = await fetch('/api' + path, {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers: {
        ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token && opts.auth !== false ? { authorization: `Bearer ${token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'NETWORK', 'Network error')
  }
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const b = json as ApiErrorBody
    if (res.status === 401 && b.error === 'UNAUTHENTICATED') onUnauthorized?.()
    throw new ApiError(res.status, b.error ?? 'HTTP_' + res.status, b.message ?? 'Request failed', b.details)
  }
  return json as T
}
