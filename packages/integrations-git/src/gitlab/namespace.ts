import type { Gitlab } from "@gitbeaker/rest"
import { isNotFoundError } from "./errors.js"

export async function resolveGroupId(
  api: Gitlab,
  groupPath: string,
): Promise<number | null> {
  let group: unknown
  try {
    group = await api.Groups.show(groupPath)
  } catch (error) {
    if (!isNotFoundError(error)) throw error
    return null
  }
  const id = (group as { id?: unknown }).id
  return typeof id === "number" ? id : null
}
