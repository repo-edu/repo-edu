import { type LlmAuthMode, LlmError } from "@repo-edu/integrations-llm-contract"
import { ResponseError } from "vscode-jsonrpc"
import type { CodexHelperFailure } from "./helper-protocol.js"

export type HelperFailure = {
  readonly error: Error
  readonly outcome: "known" | "unknown"
}

export function abortError(message = "Operation cancelled."): DOMException {
  return new DOMException(message, "AbortError")
}

export function unknownOutcomeError(
  authMode: LlmAuthMode,
  cause?: unknown,
): LlmError {
  return new LlmError(
    "other",
    "The Codex helper was lost; the outside outcome is unknown.",
    {
      cause,
      context: { provider: "codex", authMode },
    },
  )
}

function isHelperFailure(value: unknown): value is CodexHelperFailure {
  return (
    value !== null &&
    typeof value === "object" &&
    "type" in value &&
    typeof value.type === "string" &&
    "message" in value &&
    typeof value.message === "string"
  )
}

export function mapHelperFailure(
  cause: unknown,
  authMode: LlmAuthMode,
  signal: AbortSignal | undefined,
): HelperFailure {
  if (signal?.aborted) {
    return { error: abortError(), outcome: "known" }
  }
  if (!(cause instanceof ResponseError) || !isHelperFailure(cause.data)) {
    return {
      error: unknownOutcomeError(authMode, cause),
      outcome: "unknown",
    }
  }
  const failure = cause.data
  if (failure.type === "cancelled") {
    return { error: abortError(failure.message), outcome: "known" }
  }
  if (failure.type === "llm-error") {
    return {
      error: new LlmError(failure.kind, failure.message, {
        context: failure.context,
      }),
      outcome: "known",
    }
  }
  return {
    error: new LlmError("other", failure.message, {
      context: { provider: "codex", authMode },
    }),
    outcome: "known",
  }
}
