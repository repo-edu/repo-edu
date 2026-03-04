export const packageId = "@repo-edu/host-runtime-contract"

// ---------------------------------------------------------------------------
// HttpPort — the host-side fetch abstraction (architecture plan §3)
// ---------------------------------------------------------------------------

export type HttpRequest = {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: string
  signal?: AbortSignal
}

export type HttpResponse = {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
}

export type HttpPort = {
  fetch(request: HttpRequest): Promise<HttpResponse>
}
