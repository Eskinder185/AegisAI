// Typed fetch wrapper. Cookie session + CSRF header; every error is normalised to ApiError.
let csrf = ''
export const setCsrf = (t: string) => {
  csrf = t
}

export class ApiError extends Error {
  status: number
  code: string
  fields?: { field: string; message: string }[]
  requestId?: string
  constructor(status: number, code: string, message: string, requestId?: string, fields?: { field: string; message: string }[]) {
    super(message)
    this.status = status
    this.code = code
    this.requestId = requestId
    this.fields = fields
  }
}

export async function api<T = any>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      credentials: 'include',
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(method !== 'GET' ? { 'X-CSRF-Token': csrf } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'offline', 'Cannot reach the AegisAI API. Is it running on port 8000?')
  }
  const text = await res.text()
  let data: any = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }
  if (!res.ok) {
    const e = data?.error ?? {}
    throw new ApiError(res.status, e.code ?? 'http_error', e.message ?? `Request failed (${res.status})`, data?.request_id, e.fields)
  }
  return data as T
}

export const get = <T = any>(p: string) => api<T>('GET', p)
export const post = <T = any>(p: string, b?: unknown, h?: Record<string, string>) => api<T>('POST', p, b ?? {}, h)
export const patch = <T = any>(p: string, b: unknown) => api<T>('PATCH', p, b)
export const put = <T = any>(p: string, b: unknown) => api<T>('PUT', p, b)
export const del = <T = any>(p: string) => api<T>('DELETE', p)

export const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Unexpected error')
