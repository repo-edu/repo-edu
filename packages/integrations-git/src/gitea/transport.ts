import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type { GitConnectionDraft } from "@repo-edu/integrations-git-contract"

export function resolveApiBase(draft: GitConnectionDraft): string | null {
  const baseUrl = draft.baseUrl.trim()
  if (!baseUrl) {
    return null
  }

  const base = baseUrl.replace(/\/+$/, "")
  if (base.endsWith("/api/v1")) {
    return base
  }

  return `${base}/api/v1`
}

function createHeaders(draft: GitConnectionDraft): Record<string, string> {
  return {
    Authorization: `token ${draft.token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  }
}

export async function giteaRequest(
  http: HttpPort,
  draft: GitConnectionDraft,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: string,
  signal?: AbortSignal,
): Promise<{ status: number; data: unknown }> {
  const apiBase = resolveApiBase(draft)
  if (!apiBase) {
    throw new Error("Gitea baseUrl is required.")
  }

  const response = await http.fetch({
    url: `${apiBase}${path}`,
    method,
    headers: createHeaders(draft),
    body,
    signal,
  })

  let data: unknown = null
  if (response.body) {
    try {
      data = JSON.parse(response.body)
    } catch {
      data = response.body
    }
  }

  return { status: response.status, data }
}
