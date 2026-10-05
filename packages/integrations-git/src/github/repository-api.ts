import type { Octokit } from "@octokit/rest"
import type { PatchFile } from "@repo-edu/integrations-git-contract"
import { gitEffectFailure, isGitReply } from "../invocation-guard.js"

function toBase64FromUnknown(
  content: unknown,
  encoding: unknown,
): string | null {
  if (typeof content !== "string") {
    return null
  }
  if (encoding === "base64") {
    return content.replace(/\n/g, "")
  }
  return Buffer.from(content, "utf8").toString("base64")
}

export async function readRepositoryFileBase64(
  octokit: Octokit,
  owner: string,
  repositoryName: string,
  path: string,
  ref: string,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const response = await octokit.repos.getContent({
      owner,
      repo: repositoryName,
      path,
      ref,
      request: { signal },
    })
    if (Array.isArray(response.data) || response.data.type !== "file") {
      return null
    }
    return toBase64FromUnknown(response.data.content, response.data.encoding)
  } catch (error) {
    if (isGitReply(error, 404)) {
      return null
    }
    throw error
  }
}

/** The blob of a plain file on the branch, or `null` on an explicit 404. A
 * folder, symbolic link or submodule at the path fails the read, because a
 * branch update writes plain files only. */
export async function readRepositoryFileSha(
  octokit: Octokit,
  owner: string,
  repositoryName: string,
  path: string,
  branchName: string,
  signal?: AbortSignal,
): Promise<string | null> {
  let response: Awaited<ReturnType<Octokit["repos"]["getContent"]>>
  try {
    response = await octokit.repos.getContent({
      owner,
      repo: repositoryName,
      path,
      ref: branchName,
      request: { signal },
    })
  } catch (error) {
    if (isGitReply(error, 404)) return null
    throw error
  }
  // A folder answers its entry list.
  const entry = (Array.isArray(response.data) ? {} : response.data) as {
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
      `GitHub answered file '${path}' on branch '${branchName}' without its blob.`,
    )
  }
  return entry.sha
}

export function normalizeTemplateDiffStatus(
  status: string,
): PatchFile["status"] {
  if (status === "added" || status === "removed" || status === "renamed") {
    return status
  }
  return "modified"
}
