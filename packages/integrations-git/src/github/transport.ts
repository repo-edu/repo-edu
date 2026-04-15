import { Octokit } from "@octokit/rest"
import { resolveUserAgent } from "@repo-edu/domain/connection"
import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type { GitConnectionDraft } from "@repo-edu/integrations-git-contract"
import { createHttpPortFetch } from "./http-port-fetch.js"

function resolveApiBaseUrl(draft: GitConnectionDraft): string {
  if (draft.baseUrl === "") {
    return "https://api.github.com"
  }
  const base = draft.baseUrl.replace(/\/+$/, "")
  if (base === "https://github.com" || base === "http://github.com") {
    return "https://api.github.com"
  }
  return `${base}/api/v3`
}

export function createOctokit(
  http: HttpPort,
  draft: GitConnectionDraft,
): Octokit {
  return new Octokit({
    auth: draft.token,
    baseUrl: resolveApiBaseUrl(draft),
    userAgent: resolveUserAgent(draft),
    request: {
      fetch: createHttpPortFetch(http),
    },
  })
}
