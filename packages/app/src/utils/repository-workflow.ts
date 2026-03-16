import type { RepositoryBatchInput } from "@repo-edu/application-contract"
import type {
  PersistedAppSettings,
  PersistedCourse,
  RepositoryTemplate,
} from "@repo-edu/domain"

export type RepositoryWorkflowId = "repo.create" | "repo.clone"

export type CloneDirectoryLayout = "flat" | "by-team" | "by-task"
export type RepositoryOperationMode = "create" | "clone"

export type BuildRepositoryWorkflowRequestArgs = {
  course: PersistedCourse
  appSettings: PersistedAppSettings
  assignmentId: string
  operation: RepositoryOperationMode
  repositoryTemplate: RepositoryTemplate | null
  targetDirectory?: string
  directoryLayout?: CloneDirectoryLayout
  groupIds?: string[]
}

export function resolveRepositoryWorkflowId(
  operation: RepositoryOperationMode,
): RepositoryWorkflowId {
  if (operation === "create") return "repo.create"
  return "repo.clone"
}

export function buildRepositoryWorkflowRequest({
  course,
  appSettings,
  assignmentId,
  operation,
  repositoryTemplate,
  targetDirectory,
  directoryLayout,
  groupIds,
}: BuildRepositoryWorkflowRequestArgs): {
  workflowId: RepositoryWorkflowId
  input: RepositoryBatchInput
} {
  const workflowId = resolveRepositoryWorkflowId(operation)

  const input: RepositoryBatchInput = {
    course,
    appSettings,
    assignmentId,
    template: repositoryTemplate,
    groupIds,
  }

  if (operation === "clone") {
    input.targetDirectory = targetDirectory
    input.directoryLayout = directoryLayout
  }

  return { workflowId, input }
}
