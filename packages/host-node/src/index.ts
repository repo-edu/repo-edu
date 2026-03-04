import type { HttpPort, HttpRequest, HttpResponse } from "@repo-edu/host-runtime-contract"
import { packageId as hostRuntimePackageId } from "@repo-edu/host-runtime-contract"

export const packageId = "@repo-edu/host-node"
export const workspaceDependencies = [hostRuntimePackageId] as const

// ---------------------------------------------------------------------------
// NodeHttpPort — Node-side fetch implementation (architecture plan §3)
// ---------------------------------------------------------------------------

export function createNodeHttpPort(): HttpPort {
  return {
    async fetch(request: HttpRequest): Promise<HttpResponse> {
      const response = await globalThis.fetch(request.url, {
        method: request.method ?? "GET",
        headers: request.headers,
        body: request.body,
        signal: request.signal,
      })

      const headers: Record<string, string> = {}
      response.headers.forEach((value, key) => {
        headers[key] = value
      })

      return {
        status: response.status,
        statusText: response.statusText,
        headers,
        body: await response.text(),
      }
    },
  }
}
