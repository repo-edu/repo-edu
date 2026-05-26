/**
 * Rough character-based token estimate. Claude does not publish its
 * tokeniser, so this is an approximation — the commonly used
 * "4 characters per token" rule lands within roughly 20% of the true
 * count for source code in practice.
 *
 * Use for informational UI displays only. Never gate generation on
 * this value; the actual tokeniser may differ, and any real budget
 * check belongs in a provider-side count call at submit time.
 */
export function estimateTokensFromCharCount(charCount: number): number {
  return Math.ceil(charCount / 4)
}

export function formatTokenEstimate(charCount: number): string {
  const tokens = estimateTokensFromCharCount(charCount)
  if (tokens < 1_000) return `${tokens}`
  if (tokens < 10_000) return `${(tokens / 1_000).toFixed(1)}K`
  return `${Math.round(tokens / 1_000)}K`
}
