import {
  type LlmAuthMode,
  LlmError,
  type LlmErrorKind,
  QUOTA_RETRY_AFTER_THRESHOLD_MS,
} from "@repo-edu/integrations-llm-contract"

const CAP_MARKERS =
  /(weekly|monthly|quota|limit reached|usage limit|usage cap|cap reached)/i
const RATE_LIMIT_MARKERS = /(rate limit|too many requests|429)/i
const AUTH_MARKERS =
  /(unauthorized|invalid api key|missing api key|401|403|authentication)/i
const NETWORK_MARKERS =
  /(econnreset|etimedout|enotfound|network error|connection (reset|refused|closed))/i
const ABORT_MARKERS = /(aborted|cancelled|canceled)/i
const RETRY_AFTER_RE = /retry[- ]?after[:= ]\s*(\d+(?:\.\d+)?)\s*(ms|s|m|h)?/i

type ClassifiedError = {
  kind: LlmErrorKind
  message: string
  retryAfterMs?: number
}

function readMessage(value: unknown): string {
  if (value instanceof Error) return value.message
  if (typeof value === "string") return value
  if (value && typeof value === "object") {
    const m = (value as { message?: unknown }).message
    if (typeof m === "string") return m
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function readRetryAfterMs(message: string): number | undefined {
  const match = message.match(RETRY_AFTER_RE)
  if (!match) return undefined
  const value = Number(match[1])
  if (!Number.isFinite(value)) return undefined
  switch ((match[2] ?? "s").toLowerCase()) {
    case "ms":
      return value
    case "h":
      return value * 60 * 60 * 1000
    case "m":
      return value * 60 * 1000
    default:
      return value * 1000
  }
}

export function classifyCodexSdkError(cause: unknown): ClassifiedError {
  const message = readMessage(cause)
  const retryAfterMs = readRetryAfterMs(message)

  if (AUTH_MARKERS.test(message)) {
    return { kind: "auth", message, retryAfterMs }
  }

  const looksRateLimited = RATE_LIMIT_MARKERS.test(message)
  const looksCap = CAP_MARKERS.test(message)
  if (looksRateLimited) {
    if (
      looksCap ||
      (retryAfterMs !== undefined &&
        retryAfterMs > QUOTA_RETRY_AFTER_THRESHOLD_MS)
    ) {
      return { kind: "quota_exhausted", message, retryAfterMs }
    }
    return { kind: "rate_limit", message, retryAfterMs }
  }
  if (looksCap) {
    return { kind: "quota_exhausted", message, retryAfterMs }
  }

  if (NETWORK_MARKERS.test(message)) {
    return { kind: "network", message, retryAfterMs }
  }

  if (cause && typeof cause === "object") {
    const code = (cause as { code?: unknown }).code
    if (
      typeof code === "string" &&
      (code === "ECONNRESET" || code === "ETIMEDOUT" || code === "ENOTFOUND")
    ) {
      return { kind: "network", message, retryAfterMs }
    }
    if (
      typeof code === "string" &&
      (code === "ABORT_ERR" || code === "ABORTED")
    ) {
      return { kind: "other", message, retryAfterMs }
    }
  }

  if (ABORT_MARKERS.test(message)) {
    return { kind: "other", message, retryAfterMs }
  }

  return { kind: "other", message, retryAfterMs }
}

export function toCodexLlmError(
  cause: unknown,
  authMode: LlmAuthMode,
): LlmError {
  if (cause instanceof LlmError) {
    if (cause.context.provider && cause.context.authMode) return cause
    return new LlmError(cause.kind, cause.message.replace(/^\[\w+\] /, ""), {
      cause: cause.cause,
      context: {
        provider: cause.context.provider ?? "codex",
        authMode: cause.context.authMode ?? authMode,
        retryAfterMs: cause.context.retryAfterMs,
      },
    })
  }
  const classified = classifyCodexSdkError(cause)
  return new LlmError(classified.kind, classified.message, {
    cause,
    context: {
      provider: "codex",
      authMode,
      retryAfterMs: classified.retryAfterMs,
    },
  })
}
