import type { Gitlab } from "@gitbeaker/rest"

export async function resolveGroupId(
  api: Gitlab,
  groupPath: string,
): Promise<number | null> {
  const group = await api.Groups.show(groupPath)
  const id = (group as { id?: unknown }).id
  return typeof id === "number" ? id : null
}
