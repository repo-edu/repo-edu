import type { Gitlab } from "@gitbeaker/rest"
import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type {
  CreateRepositoriesRequest,
  GitConnectionDraft,
  PatchFile,
} from "@repo-edu/integrations-git-contract"
import { gitLabRestGet } from "./transport.js"

function resolveVisibility(
  request: CreateRepositoriesRequest,
): "public" | "internal" | "private" {
  return request.visibility
}

export function extractProjectUrl(project: unknown): string {
  if (typeof project !== "object" || project === null) {
    return ""
  }

  const record = project as {
    web_url?: unknown
    http_url_to_repo?: unknown
  }

  if (typeof record.web_url === "string") {
    return record.web_url
  }
  if (typeof record.http_url_to_repo === "string") {
    return record.http_url_to_repo
  }
  return ""
}

export async function createProject(
  api: Gitlab,
  namespaceId: number,
  repoName: string,
  request: CreateRepositoriesRequest,
): Promise<string> {
  const options: {
    name: string
    path: string
    namespaceId: number
    visibility: "public" | "internal" | "private"
    initializeWithReadme?: boolean
  } = {
    name: repoName,
    path: repoName,
    namespaceId,
    visibility: resolveVisibility(request),
  }

  if (request.autoInit) {
    options.initializeWithReadme = true
  }

  const project = await api.Projects.create(options)
  return extractProjectUrl(project)
}

export async function resolveProjectId(
  api: Gitlab,
  projectPath: string,
): Promise<number | null> {
  const project = await api.Projects.show(projectPath)
  const id = (project as { id?: unknown }).id
  return typeof id === "number" ? id : null
}

export function toBase64FromGitLabFile(data: unknown): string | null {
  if (typeof data !== "object" || data === null) {
    return null
  }
  const record = data as { content?: unknown; encoding?: unknown }
  if (typeof record.content !== "string") {
    return null
  }
  if (record.encoding === "base64") {
    return record.content.replace(/\n/g, "")
  }
  return Buffer.from(record.content, "utf8").toString("base64")
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
  if (response.status === 404) {
    return false
  }
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
  if (diff.deleted_file === true) {
    return "removed"
  }
  if (diff.renamed_file === true) {
    return "renamed"
  }
  if (diff.new_file === true) {
    return "added"
  }
  return "modified"
}
