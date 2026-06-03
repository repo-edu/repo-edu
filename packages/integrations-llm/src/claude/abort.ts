export function claudeAbortError(cause?: unknown): DOMException {
  return new DOMException(
    cause instanceof Error && cause.message.length > 0
      ? cause.message
      : "Operation cancelled.",
    "AbortError",
  )
}

export function isAbortLikeError(cause: unknown): boolean {
  if (cause instanceof DOMException && cause.name === "AbortError") {
    return true
  }
  if (!(cause instanceof Error)) {
    return false
  }
  const code = (cause as { code?: unknown }).code
  return (
    cause.name === "AbortError" || code === "ABORT_ERR" || code === "ABORTED"
  )
}

export function throwIfClaudeAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw claudeAbortError(signal.reason)
  }
}
