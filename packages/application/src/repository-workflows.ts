import type { WorkflowHandlerMap } from "@repo-edu/application-contract"
import { createRepoCloneHandler } from "./repository-workflows/clone-handler.js"
import { createRepoCreateHandler } from "./repository-workflows/create-handler.js"
import type { RepositoryWorkflowPorts } from "./repository-workflows/ports.js"
import { createRepoUpdateHandler } from "./repository-workflows/update-handler.js"

export type { RepositoryWorkflowPorts } from "./repository-workflows/ports.js"

export function createRepositoryWorkflowHandlers(
  ports: RepositoryWorkflowPorts,
): Pick<
  WorkflowHandlerMap<"repo.create" | "repo.clone" | "repo.update">,
  "repo.create" | "repo.clone" | "repo.update"
> {
  return {
    ...createRepoCreateHandler(ports),
    ...createRepoCloneHandler(ports),
    ...createRepoUpdateHandler(ports),
  }
}
