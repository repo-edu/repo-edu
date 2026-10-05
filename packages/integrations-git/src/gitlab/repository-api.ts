import type { Gitlab } from "@gitbeaker/rest"
import { gitEffectFailure, isGitReply } from "../invocation-guard.js"

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
    if (!isGitReply(error, 404)) throw error
    return null
  }
  const id = (project as { id?: unknown } | null)?.id
  if (typeof id !== "number") {
    throw gitEffectFailure(
      "completed",
      `GitLab answered project '${projectPath}' without its id.`,
    )
  }
  return id
}

/** Whether a plain file sits at `path` on the branch. GitLab's file reply has
 * no file mode, so the entry is read from its folder's listing. A missing path
 * or folder reads as absent. A folder, symbolic link or submodule fails the
 * call, because a branch update writes plain files only. Every plain file mode
 * starts with `100`. */
export async function plainFileExistsInBranch(
  api: Gitlab,
  projectId: number,
  path: string,
  branchName: string,
): Promise<boolean> {
  const slash = path.lastIndexOf("/")
  let entries: unknown
  try {
    entries = await api.Repositories.allRepositoryTrees(projectId, {
      ref: branchName,
      ...(slash === -1 ? {} : { path: path.slice(0, slash) }),
      pagination: "keyset",
      perPage: 100,
    })
  } catch (error) {
    if (!isGitReply(error, 404)) throw error
    return false
  }
  if (!Array.isArray(entries)) {
    throw gitEffectFailure(
      "completed",
      `GitLab answered an unreadable folder listing for '${path}' on branch '${branchName}'.`,
    )
  }
  const entry = entries.find(
    (candidate) => (candidate as { path?: unknown } | null)?.path === path,
  ) as { type?: unknown; mode?: unknown } | undefined
  if (entry === undefined) return false
  if (
    entry.type !== "blob" ||
    typeof entry.mode !== "string" ||
    !entry.mode.startsWith("100")
  ) {
    throw gitEffectFailure(
      "completed",
      `'${path}' on branch '${branchName}' is not a plain file, so the update cannot write it.`,
    )
  }
  return true
}
