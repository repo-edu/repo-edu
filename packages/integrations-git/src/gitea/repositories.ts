import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type {
  CreateRepositoriesRequest,
  GitConnectionDraft,
  PatchFile,
} from "@repo-edu/integrations-git-contract"
import { giteaRequest } from "./transport.js"

export function resolvePrivateFlag(
  request: CreateRepositoriesRequest,
): boolean {
  return request.visibility !== "public"
}

export function extractRepositoryUrl(data: unknown): string {
  if (typeof data !== "object" || data === null) {
    return ""
  }

  const repository = data as {
    html_url?: unknown
    clone_url?: unknown
    website?: unknown
  }

  if (typeof repository.html_url === "string") {
    return repository.html_url
  }
  if (typeof repository.clone_url === "string") {
    return repository.clone_url
  }
  if (typeof repository.website === "string") {
    return repository.website
  }

  return ""
}

function toBase64FromGiteaContent(data: unknown): string | null {
  if (typeof data !== "object" || data === null) {
    return null
  }
  const file = data as { content?: unknown; encoding?: unknown }
  if (typeof file.content !== "string") {
    return null
  }
  if (file.encoding === "base64") {
    return file.content.replace(/\n/g, "")
  }
  return Buffer.from(file.content, "utf8").toString("base64")
}

export function normalizeTemplateDiffStatus(
  status: string,
): PatchFile["status"] {
  if (status === "added") {
    return "added"
  }
  if (status === "removed") {
    return "removed"
  }
  if (status === "renamed") {
    return "renamed"
  }
  return "modified"
}

export async function resolveExistingRepositoryUrl(
  http: HttpPort,
  draft: GitConnectionDraft,
  organization: string,
  repositoryName: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const response = await giteaRequest(
    http,
    draft,
    "GET",
    `/repos/${encodeURIComponent(organization)}/${encodeURIComponent(repositoryName)}`,
    undefined,
    signal,
  )
  if (response.status < 200 || response.status >= 300) {
    return null
  }
  const repositoryUrl = extractRepositoryUrl(response.data)
  return repositoryUrl === "" ? null : repositoryUrl
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
