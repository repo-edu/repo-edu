import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { PRICING } from "../index.js"

// Vendor pricing pages (update both literals and the catalog when these
// change). A snapshot test forces the change to be deliberate.
//
// Anthropic:
//   Headline:    https://www.anthropic.com/pricing
//   Cached read: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
const EXPECTED = {
  "claude-haiku-4-5": { input: 1, cachedInput: 0.1, output: 5 },
  "claude-sonnet-4-6": { input: 3, cachedInput: 0.3, output: 15 },
  "claude-opus-4-7": { input: 15, cachedInput: 1.5, output: 75 },
}

describe("pricing snapshot", () => {
  test("priced models match the pinned vendor rates", () => {
    assert.deepEqual(PRICING, EXPECTED)
  })
})
