import type {
  ExclusiveCommandId,
  ExclusiveRequestOperation,
  WorkflowHandler,
  WorkflowHandlerMap,
  WorkflowInput,
  WorkflowResult,
} from "@repo-edu/application-contract"
import type { HostAdmission } from "./host-admission"
import type { HostRequest } from "./host-admission-model"
import type { createHostRequestTransport } from "./host-request-transport"
import { commandPayloadSchemas } from "./request-command-schemas"

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
    "progress" | "output"
  >
}): Promise<WorkflowResult<ExclusiveCommandId> | undefined> {
  const { request, admission, handlers, transport, signal } = options
  const before = admission.getSnapshot()
  if (
    before.phase !== "preparing" ||
    before.stage !== "input-pending" ||
    before.request !== request
  )
    throw new Error("Command input arrived outside its preparation turn.")
  const operation = commandPayloadSchemas(before.command).input.parse(
    options.operation,
  ) as ExclusiveRequestOperation
  admission.dispatch({ type: "input-prepared", request })
  const running = () => {
    const state = admission.getSnapshot()
    return state.phase === "executing.running" && state.request === request
  }
  if (!running()) return
  const handler = handlers[
    operation.workflowId
  ] as WorkflowHandler<ExclusiveCommandId>
  // The existing examination handler's control key is host-local. The port is
  // the sole cancellation authority; no generation identity crosses this wire.
  const input =
    operation.workflowId === "examination.generateQuestions"
      ? {
          ...structuredClone(operation.input),
          generationControlId: crypto.randomUUID(),
        }
      : structuredClone(operation.input)
  try {
    const result = await handler(input as WorkflowInput<ExclusiveCommandId>, {
      signal,
      onProgress: (progress) => transport.progress(request, progress),
      onOutput: (output) => transport.output(request, output),
    })
    if (!running()) return
    admission.dispatch({
      type: "outcome-fixed",
      request,
      completion: { operation, result: structuredClone(result) },
    })
    return result
  } catch (error) {
    // Truthful expected failures are connected by the settlement step. A failed
    // durable owner must already terminate here, before any release can occur.
    admission.dispatch({ type: "terminal", error })
    return undefined
  }
}
