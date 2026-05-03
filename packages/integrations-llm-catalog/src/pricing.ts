import type { LlmUsage } from "@repo-edu/integrations-llm-contract"
import type { FixtureModelSpec, PriceCard } from "./types"

// Anthropic pricing snapshot.
//   Input/output rate card: https://www.anthropic.com/pricing
//   Cached-read rate:       https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
// Update both the rates and src/__tests__/pricing-snapshot.test.ts together.
export const PRICING: Record<string, PriceCard> = {
  "claude-haiku-4-5": { input: 1, cachedInput: 0.1, output: 5 },
  "claude-sonnet-4-6": { input: 3, cachedInput: 0.3, output: 15 },
  "claude-opus-4-7": { input: 15, cachedInput: 1.5, output: 75 },
}

const TOKENS_PER_MTOK = 1_000_000

export function getPriceCard(modelId: string): PriceCard | undefined {
  return PRICING[modelId]
}

export function tokenCostUsd(
  spec: FixtureModelSpec,
  usage: LlmUsage,
): number | undefined {
  const card = spec.priceUsdPerMTok
  if (!card) return undefined
  return (
    (usage.inputTokens * card.input +
      usage.cachedInputTokens * card.cachedInput +
      usage.outputTokens * card.output) /
    TOKENS_PER_MTOK
  )
}

export function formatCostByMode(
  authMode: LlmUsage["authMode"],
  usd: number | undefined,
): string {
  if (usd === undefined) return "usd: —"
  const formatted = usd < 0.01 ? "<$0.01" : `$${usd.toFixed(2)}`
  return authMode === "subscription" ? `~${formatted}` : formatted
}
