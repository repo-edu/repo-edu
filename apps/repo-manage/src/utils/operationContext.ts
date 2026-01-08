import type {
  GitConnection,
  LmsConnection,
  LmsOperationContext,
  OperationConfigs,
  RepoOperationContext,
} from "../bindings/types"

export const buildRepoOperationContext = (
  gitConnection: GitConnection | null,
  operations: OperationConfigs,
): RepoOperationContext | null => {
  if (!gitConnection) return null
  return {
    target_org: operations.target_org,
    repo_name_template: operations.repo_name_template,
    git_connection: gitConnection,
  }
}

export const buildLmsOperationContext = (
  connection: LmsConnection | null,
  courseId: string,
): LmsOperationContext | null => {
  if (!connection) return null
  return {
    connection,
    course_id: courseId,
  }
}
