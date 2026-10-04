import { resolveUserAgent } from "@repo-edu/domain/connection"
import type { HttpPort, HttpResponse } from "@repo-edu/host-runtime-contract"
import type { GitConnectionDraft } from "@repo-edu/integrations-git-contract"
import { gitEffectFailure, sendGitHttpRequest } from "../invocation-guard.js"

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
    "User-Agent": resolveUserAgent(draft),
  }
}

function parseBody(body: string): unknown {
  if (!body) return null
  try {
    return JSON.parse(body)
  } catch {
    return body
  }
}

function replyDetail(response: HttpResponse): string {
  const data = parseBody(response.body)
  if (typeof data === "string") return data
  if (typeof data !== "object" || data === null) return ""
  const record = data as { message?: unknown; error?: unknown }
  if (typeof record.message === "string") return record.message
  if (typeof record.error === "string") return record.error
  return ""
}

/** Answers only a 2xx reply. Any other status throws a reply error that the
 * caller catches only for the statuses it names as answers. */
export async function giteaRequest(
  http: HttpPort,
  draft: GitConnectionDraft,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const apiBase = resolveApiBase(draft)
  if (!apiBase) {
    throw gitEffectFailure("completed", "Gitea baseUrl is required.")
  }

  const response = await sendGitHttpRequest(
    http,
    {
      url: `${apiBase}${path}`,
      method,
      headers: createHeaders(draft),
      body,
    },
    signal,
    replyDetail,
  )
  return parseBody(response.body)
}
