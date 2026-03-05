import type { RepositoryBatchInput } from "@repo-edu/application-contract";
import type { RepoOperationMode, RepositoryTemplate } from "@repo-edu/domain";

export type RepositoryWorkflowId = "repo.create" | "repo.clone" | "repo.delete";

export type CloneDirectoryLayout = "flat" | "by-team" | "by-task";

export type BuildRepositoryWorkflowRequestArgs = {
  activeProfileId: string;
  assignmentId: string;
  operation: RepoOperationMode;
  repositoryTemplate: RepositoryTemplate | null;
  targetDirectory: string;
  directoryLayout: CloneDirectoryLayout;
};

export function resolveRepositoryWorkflowId(
  operation: RepoOperationMode,
): RepositoryWorkflowId {
  if (operation === "create") return "repo.create";
  if (operation === "clone") return "repo.clone";
  return "repo.delete";
}

export function buildRepositoryWorkflowRequest({
  activeProfileId,
  assignmentId,
  operation,
  repositoryTemplate,
  targetDirectory,
  directoryLayout,
}: BuildRepositoryWorkflowRequestArgs): {
  workflowId: RepositoryWorkflowId;
  input: RepositoryBatchInput;
} {
  const workflowId = resolveRepositoryWorkflowId(operation);

  const input: RepositoryBatchInput = {
    profileId: activeProfileId,
    assignmentId,
    template: repositoryTemplate,
  };

  if (operation === "clone") {
    input.targetDirectory = targetDirectory;
    input.directoryLayout = directoryLayout;
  }

  if (operation === "delete") {
    input.confirmDelete = true;
  }

  return { workflowId, input };
}
