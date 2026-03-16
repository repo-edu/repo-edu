import type {
  RepositoryBatchInput,
  RepositoryUpdateInput,
} from "@repo-edu/application-contract"
import type {
  PersistedAppSettings,
  PersistedCourse,
  RepositoryTemplate,
} from "@repo-edu/domain"

export type RepositoryWorkflowId = "repo.create" | "repo.clone" | "repo.update"

export type CloneDirectoryLayout = "flat" | "by-team" | "by-task"
export type RepositoryOperationMode = "create" | "clone" | "update"

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
  if (operation === "clone") return "repo.clone"
  return "repo.update"
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
  input: RepositoryBatchInput | RepositoryUpdateInput
} {
  const workflowId = resolveRepositoryWorkflowId(operation)

  const baseInput: RepositoryBatchInput = {
    course,
    appSettings,
    assignmentId,
    template: repositoryTemplate,
    groupIds,
  }

  if (operation === "update") {
    return {
      workflowId,
      input: {
        course,
        appSettings,
        assignmentId,
      },
    }
  }

  if (operation === "clone") {
    baseInput.targetDirectory = targetDirectory
    baseInput.directoryLayout = directoryLayout
  }

  return { workflowId, input: baseInput }
}
