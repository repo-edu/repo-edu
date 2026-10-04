import { Octokit } from "@octokit/rest"
import { resolveUserAgent } from "@repo-edu/domain/connection"
import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type { GitConnectionDraft } from "@repo-edu/integrations-git-contract"
import { sendGitRequest } from "../invocation-guard.js"
import { toGitHubReplyError } from "./errors.js"
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
  const octokit = new Octokit({
    auth: draft.token,
    baseUrl: resolveApiBaseUrl(draft),
    userAgent: resolveUserAgent(draft),
    request: {
      fetch: createHttpPortFetch(http),
    },
  })
  // Octokit wraps fetch failures, so the request rule applies above it. Every
  // hook receives one shared options object, so the inner request reads the
  // signal set here rather than an options object passed to it.
  octokit.hook.wrap("request", (request, options) =>
    sendGitRequest(options.method, options.request?.signal, async (signal) => {
      options.request = { ...options.request, signal }
      try {
        return await request(options)
      } catch (error) {
        throw toGitHubReplyError(error, options.method)
      }
    }),
  )
  return octokit
}
