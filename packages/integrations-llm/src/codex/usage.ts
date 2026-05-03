import type { LlmAuthMode, LlmUsage } from "@repo-edu/integrations-llm-contract"

type RawCodexUsage =
  | {
      input_tokens?: number
      cached_input_tokens?: number
      output_tokens?: number
      reasoning_output_tokens?: number
    }
  | null
  | undefined

export function mapCodexUsage(
  usage: RawCodexUsage,
  wallMs: number,
  authMode: LlmAuthMode,
): LlmUsage {
  return {
    inputTokens: usage?.input_tokens ?? 0,
    cachedInputTokens: usage?.cached_input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    reasoningOutputTokens: usage?.reasoning_output_tokens ?? 0,
    wallMs,
    authMode,
  }
}
