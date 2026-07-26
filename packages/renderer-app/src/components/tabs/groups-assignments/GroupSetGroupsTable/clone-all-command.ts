import type { RepositoryCloneResult } from "@repo-edu/application-contract"
import type { CloneAllMutationVariables } from "./clone-all-repositories.js"

export type CloneAllCommandExecution = () => Promise<RepositoryCloneResult>

const executionByVariables = new WeakMap<
  CloneAllMutationVariables,
  CloneAllCommandExecution
>()

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
