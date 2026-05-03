import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  LlmError,
  packageId,
  QUOTA_RETRY_AFTER_THRESHOLD_MS,
  supportedLlmProviders,
} from "../index"

describe("integrations-llm-contract", () => {
  it("exposes a stable packageId", () => {
    assert.equal(packageId, "@repo-edu/integrations-llm-contract")
  })

  it("supportedLlmProviders matches LlmProvider union", () => {
    assert.deepEqual([...supportedLlmProviders], ["claude", "codex"])
  })

  it("threshold is 6 hours in ms", () => {
    assert.equal(QUOTA_RETRY_AFTER_THRESHOLD_MS, 6 * 60 * 60 * 1000)
  })

  it("LlmError carries kind, message, and context", () => {
    const cause = new Error("boom")
    const err = new LlmError("rate_limit", "slow down", {
      cause,
      context: {
        provider: "claude",
        authMode: "subscription",
        retryAfterMs: 1000,
      },
    })
    assert.equal(err.kind, "rate_limit")
    assert.match(err.message, /\[rate_limit\] slow down/)
    assert.equal(err.cause, cause)
    assert.equal(err.context.provider, "claude")
    assert.equal(err.context.authMode, "subscription")
    assert.equal(err.context.retryAfterMs, 1000)
    assert.equal(err.name, "LlmError")
  })

  it("LlmError context defaults to {} when omitted", () => {
    const err = new LlmError("other", "x")
    assert.deepEqual(err.context, {})
  })
})
