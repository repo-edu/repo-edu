import type {
  RepositoryCloneResult,
  RepositoryListNamespaceResult,
} from "@repo-edu/application-contract"
import type { QueryClient } from "@tanstack/react-query"
import type { SessionOperationGateway } from "../../../../session/session-operations.js"
import {
  buildCloneAllWorkflowInput,
  type CloneAllMutationVariables,
  type CloneAllPublishedListingInput,
  cloneAllListingQueryKeys,
} from "./clone-all-repositories.js"

export type CloneAllCommandExecution = () => Promise<RepositoryCloneResult>

const executionByVariables = new WeakMap<
  CloneAllMutationVariables,
  CloneAllCommandExecution
>()

export function executeCloneAllCommand(
  operations: SessionOperationGateway,
  queryClient: QueryClient,
  publishedInput: CloneAllPublishedListingInput,
  variables: CloneAllMutationVariables,
  mutate: (
    variables: CloneAllMutationVariables,
  ) => Promise<RepositoryCloneResult>,
): Promise<RepositoryCloneResult | undefined> {
  return operations.execute("repo.bulkClone", async (scope) => {
    registerCloneAllCommand(variables, () => {
      const listing = queryClient.getQueryState<RepositoryListNamespaceResult>(
        cloneAllListingQueryKeys.admission(variables.listingAdmissionId),
      )
      const input = buildCloneAllWorkflowInput({
        variables,
        publishedInput,
        listResult: listing?.status === "success" ? listing.data : undefined,
      })
      return scope.run("repo.bulkClone", input)
    })
    try {
      return await mutate(variables)
    } finally {
      executionByVariables.delete(variables)
    }
  })
}

export function registerCloneAllCommand(
  variables: CloneAllMutationVariables,
  execution: CloneAllCommandExecution,
): void {
  executionByVariables.set(variables, execution)
}

export function executeRegisteredCloneAllCommand(
  variables: CloneAllMutationVariables,
): Promise<RepositoryCloneResult> {
  const execution = executionByVariables.get(variables)
  executionByVariables.delete(variables)
  if (execution === undefined) {
    throw new Error("Clone-all command execution is not registered.")
  }
  return execution()
}
