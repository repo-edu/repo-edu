import type { RepositoryBatchInput } from "@repo-edu/application-contract"
import type {
  PersistedAppSettings,
  PersistedCourse,
  RepoOperationMode,
  RepositoryTemplate,
} from "@repo-edu/domain"

export type RepositoryWorkflowId = "repo.create" | "repo.clone" | "repo.delete"

export type CloneDirectoryLayout = "flat" | "by-team" | "by-task"

export type BuildRepositoryWorkflowRequestArgs = {
  course: PersistedCourse
  appSettings: PersistedAppSettings
  assignmentId: string
  operation: RepoOperationMode
  repositoryTemplate: RepositoryTemplate | null
  targetDirectory: string
  directoryLayout: CloneDirectoryLayout
}

export function resolveRepositoryWorkflowId(
  operation: RepoOperationMode,
): RepositoryWorkflowId {
  if (operation === "create") return "repo.create"
  if (operation === "clone") return "repo.clone"
  return "repo.delete"
}

export function buildRepositoryWorkflowRequest({
  course,
  appSettings,
  assignmentId,
  operation,
  repositoryTemplate,
  targetDirectory,
  directoryLayout,
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
  }

  if (operation === "clone") {
    input.targetDirectory = targetDirectory
    input.directoryLayout = directoryLayout
  }

  if (operation === "delete") {
    input.confirmDelete = true
  }

  return { workflowId, input }
}
