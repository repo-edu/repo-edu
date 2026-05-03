import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { LlmError } from "@repo-edu/integrations-llm-contract"
import {
  bucketLabel,
  type CappedBucket,
  findCappedBucket,
  recordCapFromError,
} from "./sweep-buckets.js"

describe("findCappedBucket", () => {
  test("returns undefined when no buckets are capped", () => {
    assert.equal(findCappedBucket([], "claude"), undefined)
  })

  test("matches by provider regardless of auth mode (uniform per process)", () => {
    const buckets: CappedBucket[] = [
      { provider: "claude", authMode: "subscription", kind: "rate_limit" },
    ]
    assert.deepEqual(findCappedBucket(buckets, "claude"), buckets[0])
    assert.equal(findCappedBucket(buckets, "codex"), undefined)
  })
})

describe("recordCapFromError", () => {
  test("records provider/authMode/kind from the error", () => {
    const buckets: CappedBucket[] = []
    const err = new LlmError("rate_limit", "limit", {
      context: { provider: "claude", authMode: "subscription" },
    })
    const bucket = recordCapFromError(buckets, err, "claude")
    assert.deepEqual(bucket, {
      provider: "claude",
      authMode: "subscription",
      kind: "rate_limit",
    })
    assert.equal(buckets.length, 1)
  })

  test("uses fallback provider when error context lacks one", () => {
    const buckets: CappedBucket[] = []
    const err = new LlmError("quota_exhausted", "weekly limit")
    const bucket = recordCapFromError(buckets, err, "codex")
    assert.equal(bucket.provider, "codex")
    assert.equal(bucket.authMode, null)
    assert.equal(bucket.kind, "quota_exhausted")
  })

  test("returns existing bucket on duplicate provider/authMode pair", () => {
    const buckets: CappedBucket[] = [
      { provider: "claude", authMode: "api", kind: "rate_limit" },
    ]
    const err = new LlmError("rate_limit", "again", {
      context: { provider: "claude", authMode: "api" },
    })
    const bucket = recordCapFromError(buckets, err, "claude")
    assert.equal(bucket, buckets[0])
    assert.equal(buckets.length, 1)
  })

  test("appends new bucket when provider matches but authMode differs", () => {
    const buckets: CappedBucket[] = [
      { provider: "claude", authMode: "subscription", kind: "rate_limit" },
    ]
    const err = new LlmError("rate_limit", "api too", {
      context: { provider: "claude", authMode: "api" },
    })
    recordCapFromError(buckets, err, "claude")
    assert.equal(buckets.length, 2)
  })
})

describe("bucketLabel", () => {
  test("renders provider/authMode", () => {
    assert.equal(
      bucketLabel({
        provider: "claude",
        authMode: "subscription",
        kind: "rate_limit",
      }),
      "claude/subscription",
    )
  })

  test("uses 'unknown' when authMode is null", () => {
    assert.equal(
      bucketLabel({ provider: "codex", authMode: null, kind: "rate_limit" }),
      "codex/unknown",
    )
  })
})
