import {
  type ExclusiveTerminalSettlement,
  exclusiveCommandDeclarations,
  type WorkflowHandlerMap,
} from "@repo-edu/application-contract"
import type { HostAdmission } from "./host-admission"
import type { HostRequest } from "./host-admission-model"
import type { createHostRequestTransport } from "./host-request-transport"

type SettlementTransport = Pick<
  ReturnType<typeof createHostRequestTransport>,
  "settlement"
>

export function settleCancelledPreparation(
  request: HostRequest,
  admission: HostAdmission,
  transport: SettlementTransport,
): void {
  const state = admission.getSnapshot()
  if (
    state.phase !== "executing.settling" ||
    state.request !== request ||
    state.completion !== null
  )
    return
  transport.settlement(request, {
    workflowId: state.command,
    outcome: { disposition: "stopped", result: null },
    authoritative: undefined,
  })
}

/** Runs after the official outcome is fixed, while the request owns admission.
 * Cancellation can no longer change the result or interrupt settlement reads. */
export async function settleHostCommand(
  request: HostRequest,
  admission: HostAdmission,
  handlers: WorkflowHandlerMap,
  transport: SettlementTransport,
): Promise<void> {
  const state = admission.getSnapshot()
  if (
    state.phase !== "executing.settling" ||
    state.request !== request ||
    !state.completion
  )
    return
  const { operation, outcome } = state.completion
  const current = () => admission.getSnapshot() === state
  if (
    outcome.disposition === "uncertain" &&
    outcome.reason !== "confirmation-expired"
  )
    throw new Error("Unproven effects cannot release command admission.")
  const result =
    outcome.disposition === "completed"
      ? outcome.completion.result
      : outcome.disposition === "stopped"
        ? outcome.result
        : null
  if (result === null) {
    transport.settlement(request, {
      workflowId: operation.workflowId,
      outcome,
      authoritative: undefined,
    } as ExclusiveTerminalSettlement)
    return
  }
  // Course results remain with the course transition step. Only that owner may
  // compose and commit the complete course before this request can settle.
  if (
    exclusiveCommandDeclarations[operation.workflowId].courseTransition ===
    "required"
  )
    return
  let authoritative: ExclusiveTerminalSettlement["authoritative"]
  if (operation.workflowId === "examination.archive.import") {
    const { summaries, questions } = operation.settlementInput
    const questionSummaries = await handlers[
      "examination.lookupQuestionSummaries"
    ](
      structuredClone(summaries) as Parameters<
        (typeof handlers)["examination.lookupQuestionSummaries"]
      >[0],
    )
    if (!current()) return
    const values = []
    for (const input of questions) {
      values.push(
        await handlers["examination.lookupQuestions"](
          structuredClone(input) as Parameters<
            (typeof handlers)["examination.lookupQuestions"]
          >[0],
        ),
      )
      if (!current()) return
    }
    authoritative = { questionSummaries, questions: values }
  }
  if (current())
    transport.settlement(request, {
      workflowId: operation.workflowId,
      outcome,
      authoritative,
    } as ExclusiveTerminalSettlement)
}
