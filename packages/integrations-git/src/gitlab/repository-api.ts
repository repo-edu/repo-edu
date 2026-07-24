import type { Gitlab } from "@gitbeaker/rest"
import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type {
  GitConnectionDraft,
  PatchFile,
} from "@repo-edu/integrations-git-contract"
import { isNotFoundError } from "./errors.js"
import { gitLabRestGet } from "./transport.js"

export type GitLabProjectUrls = {
  repositoryUrl: string
  cloneUrl: string
}

export function extractProjectCloneUrl(project: unknown): string | null {
  if (typeof project !== "object" || project === null) return null
  const cloneUrl = (project as { http_url_to_repo?: unknown }).http_url_to_repo
  return typeof cloneUrl === "string" ? cloneUrl : null
}

export function extractProjectUrls(project: unknown): GitLabProjectUrls | null {
  if (typeof project !== "object" || project === null) return null
  const record = project as {
    web_url?: unknown
    http_url_to_repo?: unknown
  }
  const cloneUrl = extractProjectCloneUrl(project)
  if (typeof record.web_url !== "string" || cloneUrl === null) {
    return null
  }
  return {
    repositoryUrl: record.web_url,
    cloneUrl,
  }
}

export async function createProject(
  api: Gitlab,
  namespaceId: number,
  repositoryName: string,
  visibility: "public" | "internal" | "private",
  autoInit: boolean,
): Promise<GitLabProjectUrls | null> {
  const project = await api.Projects.create({
    name: repositoryName,
    path: repositoryName,
    namespaceId,
    visibility,
    ...(autoInit ? { initializeWithReadme: true } : {}),
  })
  return extractProjectUrls(project)
}

export async function resolveProjectId(
  api: Gitlab,
  projectPath: string,
): Promise<number | null> {
  let project: unknown
  try {
    project = await api.Projects.show(projectPath)
  } catch (error) {
    if (!isNotFoundError(error)) throw error
    return null
  }
  const id = (project as { id?: unknown }).id
  return typeof id === "number" ? id : null
}

export function toBase64FromGitLabFile(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null
  const record = data as { content?: unknown; encoding?: unknown }
  if (typeof record.content !== "string") return null
  return record.encoding === "base64"
    ? record.content.replace(/\n/g, "")
    : Buffer.from(record.content, "utf8").toString("base64")
}

export async function fileExistsInBranch(
  http: HttpPort,
  draft: GitConnectionDraft,
  projectId: number,
  path: string,
  branchName: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const response = await gitLabRestGet(
    http,
    draft,
    `/projects/${projectId}/repository/files/${encodeURIComponent(path)}?ref=${encodeURIComponent(branchName)}`,
    signal,
  )
  if (response.status === 404) return false
  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `Failed to inspect file '${path}' on '${branchName}' (${response.status}).`,
    )
  }
  return true
}

export function normalizeTemplateDiffStatus(
  diff: Record<string, unknown>,
): PatchFile["status"] {
  if (diff.deleted_file === true) return "removed"
  if (diff.renamed_file === true) return "renamed"
  if (diff.new_file === true) return "added"
  return "modified"
}
