import {
  type LlmAuthMode,
  LlmError,
  type LlmErrorKind,
  QUOTA_RETRY_AFTER_THRESHOLD_MS,
} from "@repo-edu/integrations-llm-contract"

const CAP_MARKERS =
  /(weekly|monthly|quota|limit reached|usage limit|cap reached)/i

type ClassifiedError = {
  kind: LlmErrorKind
  message: string
  retryAfterMs?: number
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function readRetryAfterMs(record: Record<string, unknown>): number | undefined {
  const direct = asNumber(record.retry_after_ms ?? record.retryAfterMs)
  if (direct !== undefined) return direct
  const seconds = asNumber(record.retry_after ?? record.retryAfter)
  if (seconds !== undefined) return seconds * 1000
  const headers = record.headers
  if (headers && typeof headers === "object") {
    const raw =
      (headers as Record<string, unknown>)["retry-after"] ??
      (headers as Record<string, unknown>)["Retry-After"]
    const seconds = Number(raw)
    if (Number.isFinite(seconds)) return seconds * 1000
  }
  return undefined
}

function readStatus(record: Record<string, unknown>): number | undefined {
  return (
    asNumber(record.status) ??
    asNumber(record.statusCode) ??
    asNumber((record.response as Record<string, unknown> | undefined)?.status)
  )
}

function readErrorType(record: Record<string, unknown>): string | undefined {
  const direct = asString(record.type)
  if (direct) return direct
  const error = record.error as Record<string, unknown> | undefined
  if (error) {
    const nested = asString(error.type)
    if (nested) return nested
  }
  return undefined
}

function readMessage(value: unknown): string {
  if (value instanceof Error) return value.message
  if (typeof value === "string") return value
  if (value && typeof value === "object") {
    const message = asString((value as Record<string, unknown>).message)
    if (message) return message
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function classifyClaudeSdkError(cause: unknown): ClassifiedError {
  const message = readMessage(cause)
  const record =
    cause && typeof cause === "object" ? (cause as Record<string, unknown>) : {}
  const status = readStatus(record)
  const errorType = readErrorType(record)
  const retryAfterMs = readRetryAfterMs(record)
  const looksCap = CAP_MARKERS.test(message)

  if (
    status === 401 ||
    status === 403 ||
    errorType === "authentication_error"
  ) {
    return { kind: "auth", message, retryAfterMs }
  }

  const isRateLimitStatus = status === 429
  const isRateLimitType =
    errorType === "rate_limit_error" || errorType === "rate_limit"
  if (isRateLimitStatus || isRateLimitType) {
    if (
      looksCap ||
      (retryAfterMs !== undefined &&
        retryAfterMs > QUOTA_RETRY_AFTER_THRESHOLD_MS)
    ) {
      return { kind: "quota_exhausted", message, retryAfterMs }
    }
    return { kind: "rate_limit", message, retryAfterMs }
  }

  if (looksCap || errorType === "overloaded_error") {
    return { kind: "quota_exhausted", message, retryAfterMs }
  }

  if (errorType === "api_connection_error" || errorType === "timeout_error") {
    return { kind: "network", message, retryAfterMs }
  }

  const code = asString(record.code)
  if (code === "ECONNRESET" || code === "ETIMEDOUT" || code === "ENOTFOUND") {
    return { kind: "network", message, retryAfterMs }
  }

  return { kind: "other", message, retryAfterMs }
}

export function toClaudeLlmError(
  cause: unknown,
  authMode: LlmAuthMode,
): LlmError {
  if (cause instanceof LlmError) {
    if (cause.context.provider && cause.context.authMode) return cause
    return new LlmError(cause.kind, cause.message.replace(/^\[\w+\] /, ""), {
      cause: cause.cause,
      context: {
        provider: cause.context.provider ?? "claude",
        authMode: cause.context.authMode ?? authMode,
        retryAfterMs: cause.context.retryAfterMs,
      },
    })
  }
  const classified = classifyClaudeSdkError(cause)
  return new LlmError(classified.kind, classified.message, {
    cause,
    context: {
      provider: "claude",
      authMode,
      retryAfterMs: classified.retryAfterMs,
    },
  })
}
