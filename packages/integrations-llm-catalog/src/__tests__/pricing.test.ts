import assert from "node:assert/strict"
import { describe, test } from "node:test"
import type { LlmUsage } from "@repo-edu/integrations-llm-contract"
import { formatCostByMode, parseShortCode, tokenCostUsd } from "../index.js"

function usage(input: number, cached: number, output: number): LlmUsage {
  return {
    inputTokens: input,
    cachedInputTokens: cached,
    outputTokens: output,
    reasoningOutputTokens: 0,
    wallMs: 0,
    authMode: "api",
  }
}

describe("tokenCostUsd", () => {
  test("includes cached-input contribution at the cached rate", () => {
    const spec = parseShortCode("22", "mp")
    // sonnet-4-6: input $3, cached $0.30, output $15 per Mtok
    const u = usage(1_000_000, 1_000_000, 1_000_000)
    const cost = tokenCostUsd(spec, u)
    assert.ok(cost !== undefined)
    // 3 + 0.3 + 15 = 18.30
    assert.equal(Number(cost.toFixed(4)), 18.3)
  })

  test("returns undefined when pricing is absent", () => {
    const spec = parseShortCode("22", "mp")
    const noPriceSpec = { ...spec, priceUsdPerMTok: undefined }
    assert.equal(tokenCostUsd(noPriceSpec, usage(1, 0, 1)), undefined)
  })
})

describe("formatCostByMode", () => {
  test("api mode renders bare $", () => {
    assert.equal(formatCostByMode("api", 1.234), "$1.23")
  })

  test("subscription mode prefixes with ~", () => {
    assert.equal(formatCostByMode("subscription", 1.234), "~$1.23")
  })

  test("absent pricing renders the em-dash placeholder", () => {
    assert.equal(formatCostByMode("api", undefined), "usd: —")
    assert.equal(formatCostByMode("subscription", undefined), "usd: —")
  })

  test("under-cent rounds to <$0.01 (with tilde for subscription)", () => {
    assert.equal(formatCostByMode("api", 0.001), "<$0.01")
    assert.equal(formatCostByMode("subscription", 0.001), "~<$0.01")
  })
})
