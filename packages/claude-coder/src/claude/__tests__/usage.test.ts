import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { addUsage, createUsageAccumulator, finalizeUsage } from "../usage"

describe("Claude coder usage accounting", () => {
  it("counts cache creation as normal input and cache reads separately", () => {
    const usage = createUsageAccumulator()
    addUsage(usage, {
      input_tokens: 10,
      cache_creation_input_tokens: 3,
      cache_read_input_tokens: 4,
      output_tokens: 5,
      output_tokens_details: { thinking_tokens: 2 },
    })

    assert.deepStrictEqual(finalizeUsage(usage, 25, "subscription"), {
      inputTokens: 13,
      cachedInputTokens: 4,
      outputTokens: 5,
      reasoningOutputTokens: 2,
      wallMs: 25,
      authMode: "subscription",
    })
  })
})
