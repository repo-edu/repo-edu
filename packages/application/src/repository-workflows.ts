import type { WorkflowHandlerMap } from "@repo-edu/application-contract"
import { createRepoBulkCloneHandler } from "./repository-workflows/bulk-clone-handler.js"
import { createRepoCloneHandler } from "./repository-workflows/clone-handler.js"
import { createRepoCreateHandler } from "./repository-workflows/create-handler.js"
import { createRepoListNamespaceHandler } from "./repository-workflows/list-namespace-handler.js"
import type { RepositoryWorkflowPorts } from "./repository-workflows/ports.js"
import { createRepoUpdateHandler } from "./repository-workflows/update-handler.js"

export type { RepositoryWorkflowPorts } from "./repository-workflows/ports.js"

type RepositoryWorkflowIds =
  | "repo.create"
  | "repo.clone"
  | "repo.update"
  | "repo.listNamespace"
  | "repo.bulkClone"

export function createRepositoryWorkflowHandlers(
  ports: RepositoryWorkflowPorts,
): Pick<WorkflowHandlerMap<RepositoryWorkflowIds>, RepositoryWorkflowIds> {
  return {
    ...createRepoCreateHandler(ports),
    ...createRepoCloneHandler(ports),
    ...createRepoUpdateHandler(ports),
    ...createRepoListNamespaceHandler(ports),
    ...createRepoBulkCloneHandler(ports),
  }
}
