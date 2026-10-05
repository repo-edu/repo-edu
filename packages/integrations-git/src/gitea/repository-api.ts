import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type { GitConnectionDraft } from "@repo-edu/integrations-git-contract"
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

/** The blob of a plain file on the branch, or `null` on an explicit 404. A
 * folder, symbolic link or submodule at the path fails the read, because a
 * branch update writes plain files only. */
export async function readFileSha(
  http: HttpPort,
  draft: GitConnectionDraft,
  owner: string,
  repositoryName: string,
  path: string,
  branchName: string,
  signal?: AbortSignal,
): Promise<string | null> {
  let data: unknown
  try {
    data = await giteaRequest(
      http,
      draft,
      "GET",
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repositoryName)}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branchName)}`,
      undefined,
      signal,
    )
  } catch (error) {
    if (!isGitReply(error, 404)) throw error
    return null
  }
  // A folder answers its entry list.
  const entry = (Array.isArray(data) ? {} : (data ?? {})) as {
    type?: unknown
    sha?: unknown
  }
  if (entry.type !== "file") {
    throw gitEffectFailure(
      "completed",
      `'${path}' on branch '${branchName}' is not a plain file, so the update cannot write it.`,
    )
  }
  if (typeof entry.sha !== "string") {
    throw gitEffectFailure(
      "completed",
      `Gitea answered file '${path}' on branch '${branchName}' without its blob.`,
    )
  }
  return entry.sha
}
