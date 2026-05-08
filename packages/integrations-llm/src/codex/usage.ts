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
  const cachedInputTokens = usage?.cached_input_tokens ?? 0
  const totalInputTokens = usage?.input_tokens ?? 0
  return {
    inputTokens: Math.max(totalInputTokens - cachedInputTokens, 0),
    cachedInputTokens,
    outputTokens: usage?.output_tokens ?? 0,
    reasoningOutputTokens: usage?.reasoning_output_tokens ?? 0,
    wallMs,
    authMode,
  }
}
