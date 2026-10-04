import {
  CommandOutcomeError,
  type ExclusiveCommandId,
  type ExclusiveRequestOperation,
  type WorkflowHandler,
  type WorkflowHandlerMap,
  type WorkflowInput,
  type WorkflowResult,
} from "@repo-edu/application-contract"
import type { HostAdmission } from "./host-admission"
import type { HostRequest } from "./host-admission-model"
import { settleHostCommand } from "./host-command-settlement"
import type { createHostRequestTransport } from "./host-request-transport"

/** The execution boundary returns the official handler result to settlement.
 * It never derives an effect disposition from an error category. */
export async function executeHostCommand(options: {
  request: HostRequest
  operation: ExclusiveRequestOperation
  signal: AbortSignal
  admission: HostAdmission
  handlers: WorkflowHandlerMap
  transport: Pick<
    ReturnType<typeof createHostRequestTransport>,
    "progress" | "output" | "settlement"
  >
}): Promise<WorkflowResult<ExclusiveCommandId> | undefined> {
  const { request, admission, handlers, transport, signal } = options
  const operation = options.operation
  if (admission.dispatch({ type: "input-prepared", request }) !== "accepted")
    return
  const executionPhase = () => {
    const state = admission.getSnapshot()
    if (state.phase === "closing.aborting") return "aborting"
    return state.phase === "executing.running" && state.request === request
      ? "running"
      : "other"
  }
  const handler = handlers[
    operation.workflowId
  ] as WorkflowHandler<ExclusiveCommandId>
  const input = structuredClone(operation.input)
  try {
    const result = await handler(input as WorkflowInput<ExclusiveCommandId>, {
      signal,
      onProgress: (progress) => {
        if (executionPhase() !== "aborting")
          transport.progress(request, progress)
      },
      onOutput: (output) => {
        if (executionPhase() !== "aborting") transport.output(request, output)
      },
    })
    if (executionPhase() !== "running") return
    admission.dispatch({
      type: "outcome-fixed",
      request,
      completion: {
        operation,
        outcome: {
          disposition: "completed",
          completion: { status: "succeeded", result: structuredClone(result) },
        },
      },
    })
    await settleHostCommand(request, admission, handlers, transport)
    return result
  } catch (error) {
    const phase = executionPhase()
    if (
      phase === "aborting" &&
      error instanceof CommandOutcomeError &&
      error.outcome.disposition === "stopped"
    )
      return undefined
    if (
      phase === "running" &&
      error instanceof CommandOutcomeError &&
      (error.outcome.disposition !== "uncertain" ||
        error.outcome.reason === "confirmation-expired")
    ) {
      admission.dispatch({
        type: "outcome-fixed",
        request,
        completion: { operation, outcome: error.outcome },
      })
      try {
        await settleHostCommand(request, admission, handlers, transport)
      } catch (failure) {
        admission.terminal(failure)
      }
    } else admission.terminal(error)
    return undefined
  }
}
