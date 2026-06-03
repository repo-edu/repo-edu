import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"
import { LlmError } from "@repo-edu/integrations-llm-contract"
import { resolveClaudeAuth } from "../auth"

const ANTHROPIC = "ANTHROPIC_API_KEY"

let saved: string | undefined

beforeEach(() => {
  saved = process.env[ANTHROPIC]
  delete process.env[ANTHROPIC]
})

afterEach(() => {
  if (saved === undefined) {
    delete process.env[ANTHROPIC]
  } else {
    process.env[ANTHROPIC] = saved
  }
})

describe("resolveClaudeAuth", () => {
  it("infers subscription mode when no key is present", () => {
    const resolved = resolveClaudeAuth(undefined)
    assert.equal(resolved.authMode, "subscription")
    assert.equal(resolved.childEnv[ANTHROPIC], undefined)
  })

  it("infers api mode when ANTHROPIC_API_KEY is in process.env", () => {
    process.env[ANTHROPIC] = "secret-from-shell"
    const resolved = resolveClaudeAuth(undefined)
    assert.equal(resolved.authMode, "api")
    assert.equal(resolved.apiKey, "secret-from-shell")
  })

  it("explicit api resolves config.apiKey without mutating env", () => {
    process.env[ANTHROPIC] = "shell-key"
    const resolved = resolveClaudeAuth({
      authMode: "api",
      apiKey: "config-key",
    })
    assert.equal(resolved.authMode, "api")
    assert.equal(resolved.apiKey, "config-key")
    assert.equal(process.env[ANTHROPIC], "shell-key")
  })

  it("explicit subscription strips ANTHROPIC_API_KEY from child env only", () => {
    process.env[ANTHROPIC] = "shell-key"
    const resolved = resolveClaudeAuth({ authMode: "subscription" })
    assert.equal(resolved.authMode, "subscription")
    assert.equal(resolved.childEnv[ANTHROPIC], undefined)
    assert.equal(process.env[ANTHROPIC], "shell-key")
  })

  it("subscription config env overrides are preserved except ANTHROPIC_API_KEY", () => {
    const resolved = resolveClaudeAuth({
      authMode: "subscription",
      env: { ANTHROPIC_API_KEY: "config-key", CLAUDE_CONFIG_DIR: "/tmp/x" },
    })
    assert.equal(resolved.authMode, "subscription")
    assert.equal(resolved.childEnv[ANTHROPIC], undefined)
    assert.equal(resolved.childEnv.CLAUDE_CONFIG_DIR, "/tmp/x")
  })

  it("explicit api throws LlmError('auth', ...) when no key resolves", () => {
    assert.throws(
      () => resolveClaudeAuth({ authMode: "api" }),
      (error: unknown) =>
        error instanceof LlmError &&
        error.kind === "auth" &&
        error.context.provider === "claude" &&
        error.context.authMode === "api",
    )
  })
})
