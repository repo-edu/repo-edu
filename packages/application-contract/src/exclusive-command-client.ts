import type {
  ExclusiveAuthoritativeValues,
  ExclusiveCommandId,
  ExclusiveSettlementInput,
} from "./exclusive-command-contract.js"
import type { CommitPersistencePreparation } from "./persistence-preparation.js"
import type {
  WorkflowInput,
  WorkflowOutput,
  WorkflowProgress,
  WorkflowResult,
} from "./workflow-client.js"
import type { WorkflowCallOptions } from "./workflow-core.js"

export type ExclusiveBodyClient = {
  run<K extends ExclusiveCommandId>(
    command: K,
    capture: () => WorkflowInput<K>,
    options?: ExclusiveCallOptions<K>,
  ): Promise<WorkflowResult<K>>
}

export type ExclusiveCallOptions<K extends ExclusiveCommandId> =
  WorkflowCallOptions<WorkflowProgress<K>, WorkflowOutput<K>> & {
    settlementInput?: ExclusiveSettlementInput<K>
    applyAuthoritative?: (
      values: ExclusiveAuthoritativeValues<K>,
    ) => void | Promise<void>
  }

/** The session reserves the body before this request may create host intent. */
export type ExclusiveCommandClient = {
  runBody<T>(
    command: ExclusiveCommandId,
    preparation: (commit: CommitPersistencePreparation) => Promise<void>,
    body: (client: ExclusiveBodyClient) => Promise<T>,
    settle: () => Promise<void>,
  ): Promise<T>
}
