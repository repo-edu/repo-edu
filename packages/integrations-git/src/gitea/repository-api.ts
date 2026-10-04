import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type {
  GitConnectionDraft,
  PatchFile,
} from "@repo-edu/integrations-git-contract"
import { gitEffectFailure, isGitReply } from "../invocation-guard.js"
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

export async function readExistingRepositoryUrls(
  http: HttpPort,
  draft: GitConnectionDraft,
  organization: string,
  repositoryName: string,
  signal?: AbortSignal,
): Promise<GiteaRepositoryUrls | null> {
  return extractRepositoryUrls(
    await giteaRequest(
      http,
      draft,
      "GET",
      `/repos/${encodeURIComponent(organization)}/${encodeURIComponent(repositoryName)}`,
      undefined,
      signal,
    ),
  )
}

type RepositoryFile = { sha: string | null; contentBase64: string | null }

/** An explicit 404 is the only absent answer. */
export async function readRepositoryFile(
  http: HttpPort,
  draft: GitConnectionDraft,
  owner: string,
  repositoryName: string,
  path: string,
  ref: string,
  signal?: AbortSignal,
): Promise<RepositoryFile> {
  let data: unknown
  try {
    data = await giteaRequest(
      http,
      draft,
      "GET",
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repositoryName)}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`,
      undefined,
      signal,
    )
  } catch (error) {
    if (!isGitReply(error, 404)) throw error
    return { sha: null, contentBase64: null }
  }
  if (typeof data !== "object" || data === null) {
    throw gitEffectFailure(
      "completed",
      `Gitea answered an unreadable entry for '${path}' on ref '${ref}'.`,
    )
  }
  const file = data as { sha?: unknown }
  return {
    sha: typeof file.sha === "string" ? file.sha : null,
    contentBase64: toBase64FromGiteaContent(data),
  }
}
