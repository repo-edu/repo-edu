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

export type HelperLossDetail = {
  readonly cause?: unknown
  readonly output?: string
}

// The helper's own error output is the only account of why it died, so it
// belongs in the reported message rather than in a stream nobody reads.
export function unknownOutcomeError(
  authMode: LlmAuthMode,
  detail: HelperLossDetail = {},
): LlmError {
  const output = detail.output?.trim() ?? ""
  const message =
    output.length === 0
      ? "The Codex helper was lost; the outside outcome is unknown."
      : `The Codex helper was lost; the outside outcome is unknown. Helper output: ${output}`
  return new LlmError("other", message, {
    cause: detail.cause,
    context: { provider: "codex", authMode },
  })
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
  output = "",
): HelperFailure {
  if (signal?.aborted) {
    return { error: abortError(), outcome: "known" }
  }
  if (!(cause instanceof ResponseError) || !isHelperFailure(cause.data)) {
    return {
      error: unknownOutcomeError(authMode, { cause, output }),
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
