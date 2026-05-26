import type { WorkflowCallOptions, WorkflowEvent } from "./workflow-core.js"
import type { WorkflowId, WorkflowPayloads } from "./workflow-payloads.js"

export type WorkflowInput<TWorkflowId extends WorkflowId> =
  WorkflowPayloads[TWorkflowId]["input"]

export type WorkflowProgress<TWorkflowId extends WorkflowId> =
  WorkflowPayloads[TWorkflowId]["progress"]

export type WorkflowOutput<TWorkflowId extends WorkflowId> =
  WorkflowPayloads[TWorkflowId]["output"]

export type WorkflowResult<TWorkflowId extends WorkflowId> =
  WorkflowPayloads[TWorkflowId]["result"]

export type WorkflowEventFor<TWorkflowId extends WorkflowId> = WorkflowEvent<
  WorkflowProgress<TWorkflowId>,
  WorkflowOutput<TWorkflowId>,
  WorkflowResult<TWorkflowId>
>

export type WorkflowHandler<TWorkflowId extends WorkflowId> = (
  input: WorkflowInput<TWorkflowId>,
  options?: WorkflowCallOptions<
    WorkflowProgress<TWorkflowId>,
    WorkflowOutput<TWorkflowId>
  >,
) => Promise<WorkflowResult<TWorkflowId>>

export type WorkflowHandlerMap<TWorkflowId extends WorkflowId = WorkflowId> = {
  [TId in TWorkflowId]: WorkflowHandler<TId>
}

export type WorkflowClient<TWorkflowId extends WorkflowId = WorkflowId> = {
  run<TId extends TWorkflowId>(
    workflowId: TId,
    input: WorkflowInput<TId>,
    options?: WorkflowCallOptions<WorkflowProgress<TId>, WorkflowOutput<TId>>,
  ): Promise<WorkflowResult<TId>>
}

export function createWorkflowClient<TWorkflowId extends WorkflowId>(
  handlers: WorkflowHandlerMap<TWorkflowId>,
): WorkflowClient<TWorkflowId> {
  return {
    run<TId extends TWorkflowId>(
      workflowId: TId,
      input: WorkflowInput<TId>,
      options?: WorkflowCallOptions<WorkflowProgress<TId>, WorkflowOutput<TId>>,
    ): Promise<WorkflowResult<TId>> {
      const handler = handlers[workflowId] as WorkflowHandler<TId>

      return handler(input, options)
    },
  }
}
