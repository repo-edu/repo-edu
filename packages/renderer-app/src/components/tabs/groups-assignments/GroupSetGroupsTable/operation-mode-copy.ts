import type { GitProviderKind } from "@repo-edu/domain/connection"
import type { OperationModeKey } from "../../../../utils/repository-workflow.js"

export const operationModeLabels: Record<OperationModeKey, string> = {
  create: "Create Repos",
  update: "Update Repos",
  clone: "Clone Repos",
  "clone-all": "Clone All",
}

const staticOperationModeTooltips: Record<
  Exclude<OperationModeKey, "clone-all">,
  string
> = {
  create: "Create one repository per group from the assignment template",
  update: "Open pull requests with the latest template changes",
  clone: "Clone assignment repositories to a local folder",
}

export const operationModeOrder: readonly OperationModeKey[] = [
  "create",
  "update",
  "clone",
  "clone-all",
]

export const selectedOutlineButtonClass =
  "!bg-selection ![background-image:none] !text-foreground"

export function operationModeTooltip(
  mode: OperationModeKey,
  provider: GitProviderKind | null | undefined,
): string {
  if (mode === "clone-all") {
    const container = provider === "gitlab" ? "GitLab Group" : "Organization"
    return `List and clone all repositories in the ${container}`
  }
  return staticOperationModeTooltips[mode]
}
