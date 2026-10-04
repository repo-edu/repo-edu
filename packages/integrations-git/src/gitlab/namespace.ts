import type { Gitlab } from "@gitbeaker/rest"
import { isGitReply } from "../invocation-guard.js"

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
  const id = (group as { id?: unknown }).id
  return typeof id === "number" ? id : null
}
