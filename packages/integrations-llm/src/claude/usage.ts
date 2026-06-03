import type { LlmAuthMode, LlmUsage } from "@repo-edu/integrations-llm-contract"

export type RawClaudeUsage =
  | {
      input_tokens?: number | null
      output_tokens?: number | null
      cache_read_input_tokens?: number | null
      cache_creation_input_tokens?: number | null
      reasoning_output_tokens?: number | null
      output_tokens_details?: {
        thinking_tokens?: number | null
      } | null
    }
  | null
  | undefined

export type ClaudeUsageAccumulator = {
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningOutputTokens: number
}

export function createUsageAccumulator(): ClaudeUsageAccumulator {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
  }
}

export function addUsage(
  acc: ClaudeUsageAccumulator,
  usage: RawClaudeUsage,
): void {
  if (!usage) return
  acc.inputTokens += usage.input_tokens ?? 0
  acc.inputTokens += usage.cache_creation_input_tokens ?? 0
  acc.outputTokens += usage.output_tokens ?? 0
  acc.cachedInputTokens += usage.cache_read_input_tokens ?? 0
  acc.reasoningOutputTokens +=
    usage.reasoning_output_tokens ??
    usage.output_tokens_details?.thinking_tokens ??
    0
}

export function mergeUsageSnapshot(
  current: RawClaudeUsage,
  next: RawClaudeUsage,
): RawClaudeUsage {
  if (!next) return current
  const currentRecord = current ?? {}
  return {
    ...currentRecord,
    // Keep prior values when a later snapshot reports a field as null:
    // streamed `message_delta` usage echoes input/cache counters as null,
    // and overwriting would drop the totals captured at `message_start`.
    ...Object.fromEntries(
      Object.entries(next).filter(([, value]) => value != null),
    ),
  }
}

export function usageFromSnapshot(
  usage: RawClaudeUsage,
  wallMs: number,
  authMode: LlmAuthMode,
): LlmUsage {
  const acc = createUsageAccumulator()
  addUsage(acc, usage)
  return finalizeUsage(acc, wallMs, authMode)
}

export function finalizeUsage(
  acc: ClaudeUsageAccumulator,
  wallMs: number,
  authMode: LlmAuthMode,
): LlmUsage {
  return {
    inputTokens: acc.inputTokens,
    cachedInputTokens: acc.cachedInputTokens,
    outputTokens: acc.outputTokens,
    reasoningOutputTokens: acc.reasoningOutputTokens,
    wallMs,
    authMode,
  }
}
