import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type {
  GitConnectionDraft,
  PatchFile,
} from "@repo-edu/integrations-git-contract"
import { giteaRequest } from "./transport.js"

export type GiteaRepositoryUrls = {
  repositoryUrl: string
  cloneUrl: string
}

export function extractRepositoryCloneUrl(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null
  const cloneUrl = (data as { clone_url?: unknown }).clone_url
  return typeof cloneUrl === "string" ? cloneUrl : null
}

export function extractRepositoryUrls(
  data: unknown,
): GiteaRepositoryUrls | null {
  if (typeof data !== "object" || data === null) return null
  const repository = data as { html_url?: unknown; clone_url?: unknown }
  const cloneUrl = extractRepositoryCloneUrl(data)
  if (typeof repository.html_url !== "string" || cloneUrl === null) {
    return null
  }
  return {
    repositoryUrl: repository.html_url,
    cloneUrl,
  }
}

function toBase64FromGiteaContent(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null
  const file = data as { content?: unknown; encoding?: unknown }
  if (typeof file.content !== "string") return null
  return file.encoding === "base64"
    ? file.content.replace(/\n/g, "")
    : Buffer.from(file.content, "utf8").toString("base64")
}

export function normalizeTemplateDiffStatus(
  status: string,
): PatchFile["status"] {
  if (status === "added" || status === "removed" || status === "renamed") {
    return status
  }
  return "modified"
}

export async function resolveExistingRepositoryUrls(
  http: HttpPort,
  draft: GitConnectionDraft,
  organization: string,
  repositoryName: string,
  signal?: AbortSignal,
): Promise<GiteaRepositoryUrls | null> {
  const response = await giteaRequest(
    http,
    draft,
    "GET",
    `/repos/${encodeURIComponent(organization)}/${encodeURIComponent(repositoryName)}`,
    undefined,
    signal,
  )
  return response.status >= 200 && response.status < 300
    ? extractRepositoryUrls(response.data)
    : null
}

export async function readRepositoryFile(
  http: HttpPort,
  draft: GitConnectionDraft,
  owner: string,
  repositoryName: string,
  path: string,
  ref: string,
  signal?: AbortSignal,
): Promise<{ sha: string | null; contentBase64: string | null }> {
  const response = await giteaRequest(
    http,
    draft,
    "GET",
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repositoryName)}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`,
    undefined,
    signal,
  )
  if (response.status === 404) {
    return { sha: null, contentBase64: null }
  }
  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `Failed to resolve file '${path}' on ref '${ref}' (${response.status}).`,
    )
  }
  if (typeof response.data !== "object" || response.data === null) {
    return { sha: null, contentBase64: null }
  }
  const file = response.data as { sha?: unknown }
  return {
    sha: typeof file.sha === "string" ? file.sha : null,
    contentBase64: toBase64FromGiteaContent(response.data),
  }
}
