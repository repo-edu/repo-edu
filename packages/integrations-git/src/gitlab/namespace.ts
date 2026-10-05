import type { Gitlab } from "@gitbeaker/rest"
import { gitEffectFailure, isGitReply } from "../invocation-guard.js"

export async function resolveGroupId(
  api: Gitlab,
  groupPath: string,
): Promise<number | null> {
  let group: unknown
  try {
    group = await api.Groups.show(groupPath)
  } catch (error) {
    if (!isGitReply(error, 404)) throw error
    return null
  }
  const id = (group as { id?: unknown } | null)?.id
  if (typeof id !== "number") {
    throw gitEffectFailure(
      "completed",
      `GitLab answered group '${groupPath}' without its id.`,
    )
  }
  return id
}
