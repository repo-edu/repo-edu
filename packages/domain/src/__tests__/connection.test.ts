import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  DEFAULT_USER_AGENT,
  normalizeUserAgent,
  resolveUserAgent,
} from "../connection.js"

describe("normalizeUserAgent", () => {
  it("returns trimmed value when non-empty", () => {
    assert.equal(normalizeUserAgent("  Name  "), "Name")
  })

  it("returns undefined for empty and whitespace-only values", () => {
    assert.equal(normalizeUserAgent(""), undefined)
    assert.equal(normalizeUserAgent("   "), undefined)
  })

  it("returns undefined for null and undefined inputs", () => {
    assert.equal(normalizeUserAgent(null), undefined)
    assert.equal(normalizeUserAgent(undefined), undefined)
  })
})

describe("resolveUserAgent", () => {
  it("returns the normalized user-agent when provided", () => {
    assert.equal(
      resolveUserAgent({
        baseUrl: "",
        token: "",
        userAgent: "  Custom Agent  ",
      }),
      "Custom Agent",
    )
  })

  it("falls back to the default when user-agent is empty or missing", () => {
    assert.equal(
      resolveUserAgent({ baseUrl: "", token: "" }),
      DEFAULT_USER_AGENT,
    )
    assert.equal(
      resolveUserAgent({ baseUrl: "", token: "", userAgent: "   " }),
      DEFAULT_USER_AGENT,
    )
  })
})
