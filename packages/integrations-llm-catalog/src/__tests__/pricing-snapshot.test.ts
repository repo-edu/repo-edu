import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { PRICING } from "../index.js"

// Vendor pricing pages (update both literals and the catalog when these
// change). A snapshot test forces the change to be deliberate.
//
// Anthropic:
//   Headline:    https://www.anthropic.com/pricing
//   Cached read: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
// OpenAI:
//   API price card: https://platform.openai.com/docs/pricing
const EXPECTED = {
  "claude-haiku-4-5": { input: 1, cachedInput: 0.1, output: 5 },
  "claude-sonnet-4-6": { input: 3, cachedInput: 0.3, output: 15 },
  "claude-opus-4-7": { input: 15, cachedInput: 1.5, output: 75 },
  "gpt-5.4-mini": { input: 0.5, cachedInput: 0.05, output: 3 },
  "gpt-5.4": { input: 3, cachedInput: 0.3, output: 18 },
  "gpt-5.5": { input: 5, cachedInput: 0.5, output: 30 },
}

describe("pricing snapshot", () => {
  test("priced models match the pinned vendor rates", () => {
    assert.deepEqual(PRICING, EXPECTED)
  })
})
