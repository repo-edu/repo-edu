import type { AppError } from "@repo-edu/application-contract"
import { CommandOutcomeError, isAppError } from "@repo-edu/application-contract"
import { LlmError } from "@repo-edu/integrations-llm-contract"
import { toCancelledAppError } from "./workflow-helpers.js"

export function normalizeLlmProviderError(
  error: unknown,
  operation: string,
): AppError {
  if (error instanceof CommandOutcomeError) throw error
  if (error instanceof LlmError && error.context.outcome) {
    const outcome = error.context.outcome
    throw new CommandOutcomeError(
      outcome === "completed"
        ? {
            disposition: "completed",
            completion: {
              status: "failed",
              error: { type: "effect", message: error.message },
              result: null,
            },
          }
        : { disposition: "uncertain", reason: outcome, message: error.message },
    )
  }
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
