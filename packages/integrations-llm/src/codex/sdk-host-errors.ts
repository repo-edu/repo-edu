import { type LlmAuthMode, LlmError } from "@repo-edu/integrations-llm-contract"
import { ResponseError } from "vscode-jsonrpc"
import type { CodexSdkHostProtocolFailure } from "./sdk-host-protocol.js"

export type CodexSdkHostFailure = {
  readonly error: Error
  readonly outcome: "known" | "unknown"
}

export function abortError(
  message = "Operation cancelled.",
  cause?: unknown,
): DOMException {
  const error = new DOMException(message, "AbortError")
  if (cause !== undefined) {
    Object.defineProperty(error, "cause", {
      configurable: true,
      enumerable: false,
      value: cause,
    })
  }
  return error
}

export type CodexSdkHostLossDetail = {
  readonly cause?: unknown
  readonly output?: string
}

// The Codex SDK host process's own error output is the only account of why it
// died, so it belongs in the reported message rather than an unread stream.
export function unknownOutcomeError(
  authMode: LlmAuthMode,
  detail: CodexSdkHostLossDetail = {},
): LlmError {
  const output = detail.output?.trim() ?? ""
  const message =
    output.length === 0
      ? "The Codex SDK host process was lost; the outside outcome is unknown."
      : `The Codex SDK host process was lost; the outside outcome is unknown. Codex SDK host process output: ${output}`
  return new LlmError("other", message, {
    cause: detail.cause,
    context: { provider: "codex", authMode },
  })
}

function isCodexSdkHostProtocolFailure(
  value: unknown,
): value is CodexSdkHostProtocolFailure {
  return (
    value !== null &&
    typeof value === "object" &&
    "type" in value &&
    typeof value.type === "string" &&
    "message" in value &&
    typeof value.message === "string"
  )
}

export function mapCodexSdkHostFailure(
  cause: unknown,
  authMode: LlmAuthMode,
  signal: AbortSignal | undefined,
  output = "",
): CodexSdkHostFailure {
  if (signal?.aborted) {
    return { error: abortError(), outcome: "known" }
  }
  if (
    !(cause instanceof ResponseError) ||
    !isCodexSdkHostProtocolFailure(cause.data)
  ) {
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
