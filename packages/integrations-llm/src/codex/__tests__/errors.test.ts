import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  LlmError,
  QUOTA_RETRY_AFTER_THRESHOLD_MS,
} from "@repo-edu/integrations-llm-contract"
import { classifyCodexSdkError, toCodexLlmError } from "../errors"

describe("classifyCodexSdkError", () => {
  it("classifies authentication failures via 401/unauthorized", () => {
    assert.equal(
      classifyCodexSdkError(new Error("401 Unauthorized")).kind,
      "auth",
    )
    assert.equal(
      classifyCodexSdkError(new Error("invalid api key")).kind,
      "auth",
    )
  })

  it("classifies short-window 429 as rate_limit", () => {
    const err = classifyCodexSdkError(
      new Error("429 rate limit; retry-after 5s"),
    )
    assert.equal(err.kind, "rate_limit")
    assert.equal(err.retryAfterMs, 5_000)
  })

  it("classifies long-window 429 as quota_exhausted", () => {
    const err = classifyCodexSdkError(
      new Error("rate limit; retry-after 25200s"),
    )
    assert.equal(err.kind, "quota_exhausted")
    assert.ok((err.retryAfterMs ?? 0) > QUOTA_RETRY_AFTER_THRESHOLD_MS)
  })

  it("classifies cap-style messages as quota_exhausted", () => {
    assert.equal(
      classifyCodexSdkError(new Error("monthly usage cap exceeded")).kind,
      "quota_exhausted",
    )
    assert.equal(
      classifyCodexSdkError(new Error("usage limit reached")).kind,
      "quota_exhausted",
    )
  })

  it("classifies network-shaped errors", () => {
    assert.equal(
      classifyCodexSdkError({ code: "ECONNRESET", message: "reset" }).kind,
      "network",
    )
    assert.equal(
      classifyCodexSdkError(new Error("network error: connection refused"))
        .kind,
      "network",
    )
  })

  it("falls back to other when nothing matches", () => {
    assert.equal(classifyCodexSdkError(new Error("unknown")).kind, "other")
  })

  it("parses retry-after with unit suffixes", () => {
    assert.equal(
      classifyCodexSdkError(new Error("429 rate limit retry-after 30s"))
        .retryAfterMs,
      30_000,
    )
    assert.equal(
      classifyCodexSdkError(new Error("rate limit retry-after 2m"))
        .retryAfterMs,
      120_000,
    )
    assert.equal(
      classifyCodexSdkError(new Error("rate limit Retry-After: 1h"))
        .retryAfterMs,
      3_600_000,
    )
  })
})

describe("toCodexLlmError", () => {
  it("wraps SDK errors with provider and authMode context", () => {
    const cause = new Error("boom")
    const err = toCodexLlmError(cause, "subscription")
    assert.ok(err instanceof LlmError)
    assert.equal(err.context.provider, "codex")
    assert.equal(err.context.authMode, "subscription")
    assert.equal(err.cause, cause)
  })

  it("preserves an existing LlmError with provider/authMode populated", () => {
    const original = new LlmError("rate_limit", "slow", {
      context: { provider: "codex", authMode: "api", retryAfterMs: 100 },
    })
    const err = toCodexLlmError(original, "subscription")
    assert.equal(err, original)
  })

  it("fills in missing provider/authMode on existing LlmError", () => {
    const original = new LlmError("network", "blip")
    const err = toCodexLlmError(original, "subscription")
    assert.notEqual(err, original)
    assert.equal(err.context.provider, "codex")
    assert.equal(err.context.authMode, "subscription")
  })
})
