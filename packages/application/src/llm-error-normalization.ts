import type { AppError } from "@repo-edu/application-contract"
import { CommandOutcomeError, isAppError } from "@repo-edu/application-contract"
import { LlmError } from "@repo-edu/integrations-llm-contract"
import { commandCompletedFailure, commandRefusal } from "./command-outcomes.js"
import { toCancelledAppError } from "./workflow-helpers.js"

/** The LLM adapter owns refusal, completion and uncertainty proof. Only an
 * exclusive command calls this; ordinary calls normalise the same error to an
 * `AppError`. */
export function rethrowLlmOutcome(error: unknown): void {
  if (!(error instanceof LlmError) || error.context.outcome === undefined)
    return
  const outcome = error.context.outcome
  const failure = { type: "effect" as const, message: error.message }
  if (outcome === "refused") throw commandRefusal(failure)
  if (outcome === "completed") throw commandCompletedFailure(failure)
  throw new CommandOutcomeError({
    disposition: "uncertain",
    reason: outcome,
    message: error.message,
  })
}

export function normalizeLlmProviderError(
  error: unknown,
  operation: string,
): AppError {
  if (error instanceof CommandOutcomeError) throw error
  if (isAppError(error)) {
    return error
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return toCancelledAppError()
  }
  if (error instanceof LlmError) {
    return {
      type: "provider",
      message: error.message,
      provider: "llm",
      operation,
      retryable: isRetryableLlmError(error),
    }
  }
  return {
    type: "provider",
    message: error instanceof Error ? error.message : String(error),
    provider: "llm",
    operation,
    retryable: true,
  }
}

function isRetryableLlmError(error: LlmError): boolean {
  return error.kind !== "auth" && error.kind !== "guardrail"
}
