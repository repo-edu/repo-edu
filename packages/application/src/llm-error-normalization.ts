import type { AppError } from "@repo-edu/application-contract"
import { isAppError } from "@repo-edu/application-contract"
import { LlmError } from "@repo-edu/integrations-llm-contract"
import { toCancelledAppError } from "./workflow-helpers.js"

export function normalizeLlmProviderError(
  error: unknown,
  operation: string,
): AppError {
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
