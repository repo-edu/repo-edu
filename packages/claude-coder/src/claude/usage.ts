import type { LlmAuthMode, LlmUsage } from "@repo-edu/integrations-llm-contract"

type RawUsage =
  | {
      input_tokens?: number
      output_tokens?: number
      cache_read_input_tokens?: number
      cache_creation_input_tokens?: number
      reasoning_output_tokens?: number
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

export function addUsage(acc: ClaudeUsageAccumulator, usage: RawUsage): void {
  if (!usage) return
  acc.inputTokens += usage.input_tokens ?? 0
  acc.outputTokens += usage.output_tokens ?? 0
  acc.cachedInputTokens += usage.cache_read_input_tokens ?? 0
  acc.reasoningOutputTokens += usage.reasoning_output_tokens ?? 0
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
