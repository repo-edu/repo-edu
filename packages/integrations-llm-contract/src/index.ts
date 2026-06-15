export const packageId = "@repo-edu/integrations-llm-contract"

// Threshold separating short-window rate limits from long-window quota
// exhaustion, used by adapter classification heuristics. SDK error shapes
// evolve; tune here, not per-call.
export const QUOTA_RETRY_AFTER_THRESHOLD_MS = 6 * 60 * 60 * 1000

export const supportedLlmProviders = ["claude", "codex"] as const
export type LlmProvider = (typeof supportedLlmProviders)[number]

export type LlmEffort =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max"

export type LlmAuthMode = "subscription" | "api"

export type LlmModelSpec = {
  provider: LlmProvider
  family: string
  modelId: string
  effort: LlmEffort
}

export type LlmUsage = {
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningOutputTokens: number
  wallMs: number
  authMode: LlmAuthMode
}

export type LlmResult = {
  reply: string
  usage: LlmUsage
}

export type LlmStreamEvent =
  | { kind: "text-delta"; text: string }
  | { kind: "activity"; label: string }
  | { kind: "done"; usage: LlmUsage }

export type GenerateTextRequest = {
  spec: LlmModelSpec
  prompt: string
  signal?: AbortSignal
}

export type LlmErrorKind =
  | "rate_limit"
  | "quota_exhausted"
  | "auth"
  | "network"
  | "guardrail"
  | "other"

export type LlmErrorContext = {
  provider?: LlmProvider
  authMode?: LlmAuthMode
  retryAfterMs?: number
}

export type LlmErrorOptions = {
  cause?: unknown
  context?: LlmErrorContext
}

export class LlmError extends Error {
  readonly kind: LlmErrorKind
  readonly context: LlmErrorContext

  constructor(
    kind: LlmErrorKind,
    message: string,
    options: LlmErrorOptions = {},
  ) {
    super(message, { cause: options.cause })
    this.name = "LlmError"
    this.kind = kind
    this.context = options.context ?? {}
  }
}

export type LlmTextClient = {
  generateText(request: GenerateTextRequest): Promise<LlmResult>
  streamText(request: GenerateTextRequest): AsyncIterable<LlmStreamEvent>
}

export type LlmProviderRuntimeConfig = {
  authMode?: LlmAuthMode
  env?: Record<string, string>
  apiKey?: string
  baseUrl?: string
}

export type ClaudeLlmProviderRuntimeConfig = LlmProviderRuntimeConfig & {
  maxTokens?: number
}

export type CodexLlmProviderRuntimeConfig = LlmProviderRuntimeConfig & {
  // Absolute path to the Codex native binary. When set it is passed to the SDK
  // as `codexPathOverride`, bypassing the SDK's node_modules resolution. Hosts
  // set this when the resolved binary is not directly spawnable (e.g. a
  // packaged Electron build, where the SDK resolves an `app.asar` path that
  // child_process cannot exec).
  binaryPath?: string
}

export type LlmRuntimeConfig = {
  claude?: ClaudeLlmProviderRuntimeConfig
  codex?: CodexLlmProviderRuntimeConfig
}
