import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  LlmError,
  QUOTA_RETRY_AFTER_THRESHOLD_MS,
} from "@repo-edu/integrations-llm-contract"
import { classifyClaudeSdkError, toClaudeLlmError } from "../errors"

describe("classifyClaudeSdkError", () => {
  it("classifies 401 as auth", () => {
    const result = classifyClaudeSdkError({ status: 401, message: "no creds" })
    assert.equal(result.kind, "auth")
  })

  it("classifies 429 with short retry-after as rate_limit", () => {
    const result = classifyClaudeSdkError({
      status: 429,
      message: "slow down",
      retry_after: 5,
    })
    assert.equal(result.kind, "rate_limit")
    assert.equal(result.retryAfterMs, 5_000)
  })

  it("classifies 429 with long retry-after as quota_exhausted", () => {
    const result = classifyClaudeSdkError({
      status: 429,
      message: "weekly limit reached",
      retry_after: 7 * 60 * 60,
    })
    assert.equal(result.kind, "quota_exhausted")
    assert.ok((result.retryAfterMs ?? 0) > QUOTA_RETRY_AFTER_THRESHOLD_MS)
  })

  it("classifies cap-style messages as quota_exhausted regardless of status", () => {
    const result = classifyClaudeSdkError({
      message: "monthly usage limit exceeded",
    })
    assert.equal(result.kind, "quota_exhausted")
  })

  it("classifies network-shaped errors", () => {
    const result = classifyClaudeSdkError({
      code: "ECONNRESET",
      message: "connection reset",
    })
    assert.equal(result.kind, "network")
  })

  it("falls back to other when nothing matches", () => {
    const result = classifyClaudeSdkError({ message: "unknown" })
    assert.equal(result.kind, "other")
  })
})

describe("toClaudeLlmError", () => {
  it("wraps SDK errors with provider and authMode context", () => {
    const cause = new Error("boom")
    const err = toClaudeLlmError(cause, "subscription")
    assert.ok(err instanceof LlmError)
    assert.equal(err.context.provider, "claude")
    assert.equal(err.context.authMode, "subscription")
    assert.equal(err.cause, cause)
  })

  it("preserves an existing LlmError with provider/authMode if already populated", () => {
    const original = new LlmError("rate_limit", "slow", {
      context: { provider: "claude", authMode: "api", retryAfterMs: 100 },
    })
    const err = toClaudeLlmError(original, "subscription")
    assert.equal(err, original)
  })

  it("fills in missing provider/authMode on existing LlmError", () => {
    const original = new LlmError("network", "blip")
    const err = toClaudeLlmError(original, "subscription")
    assert.notEqual(err, original)
    assert.equal(err.context.provider, "claude")
    assert.equal(err.context.authMode, "subscription")
  })
})
