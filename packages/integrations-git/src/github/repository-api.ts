import type { Octokit } from "@octokit/rest"
import { gitEffectFailure, isGitReply } from "../invocation-guard.js"

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
