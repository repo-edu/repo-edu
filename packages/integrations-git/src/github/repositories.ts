import type { Octokit } from "@octokit/rest"
import type { PatchFile } from "@repo-edu/integrations-git-contract"
import { isNotFoundError } from "./errors.js"

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
    if (Array.isArray(response.data)) {
      return null
    }
    if (response.data.type !== "file") {
      return null
    }
    return toBase64FromUnknown(response.data.content, response.data.encoding)
  } catch (error) {
    if (isNotFoundError(error)) {
      return null
    }
    throw error
  }
}

export async function readRepositoryFileSha(
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
    if (Array.isArray(response.data)) {
      return null
    }
    if (response.data.type !== "file") {
      return null
    }
    return typeof response.data.sha === "string" ? response.data.sha : null
  } catch (error) {
    if (isNotFoundError(error)) {
      return null
    }
    throw error
  }
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

export async function resolveExistingPullRequestUrl(
  octokit: Octokit,
  owner: string,
  repositoryName: string,
  headBranch: string,
  baseBranch: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const response = await octokit.pulls.list({
    owner,
    repo: repositoryName,
    state: "open",
    head: `${owner}:${headBranch}`,
    base: baseBranch,
    request: { signal },
  })
  const first = response.data[0]
  if (!first || typeof first.html_url !== "string") {
    return null
  }
  return first.html_url
}
