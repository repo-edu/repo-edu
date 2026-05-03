import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"
import { LlmError } from "@repo-edu/integrations-llm-contract"
import { applyEnvOverrides, resolveClaudeAuth } from "../auth"

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
    assert.deepEqual(resolved.envOverrides, {})
    assert.deepEqual(resolved.unsetVars, [])
  })

  it("infers api mode when ANTHROPIC_API_KEY is in process.env", () => {
    process.env[ANTHROPIC] = "secret-from-shell"
    const resolved = resolveClaudeAuth(undefined)
    assert.equal(resolved.authMode, "api")
    assert.deepEqual(resolved.envOverrides, {})
  })

  it("explicit api with config.apiKey overrides env var when different", () => {
    process.env[ANTHROPIC] = "shell-key"
    const resolved = resolveClaudeAuth({
      authMode: "api",
      apiKey: "config-key",
    })
    assert.equal(resolved.authMode, "api")
    assert.equal(resolved.envOverrides[ANTHROPIC], "config-key")
  })

  it("explicit subscription strips ANTHROPIC_API_KEY from env", () => {
    process.env[ANTHROPIC] = "shell-key"
    const resolved = resolveClaudeAuth({ authMode: "subscription" })
    assert.equal(resolved.authMode, "subscription")
    assert.deepEqual(resolved.unsetVars, [ANTHROPIC])
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

describe("applyEnvOverrides", () => {
  it("temporarily sets env overrides and restores them", () => {
    process.env[ANTHROPIC] = "before"
    const apply = applyEnvOverrides({
      authMode: "api",
      envOverrides: { [ANTHROPIC]: "during" },
      unsetVars: [],
    })
    assert.equal(process.env[ANTHROPIC], "during")
    apply.restore()
    assert.equal(process.env[ANTHROPIC], "before")
  })

  it("unsets ANTHROPIC_API_KEY for subscription and restores it", () => {
    process.env[ANTHROPIC] = "before"
    const apply = applyEnvOverrides({
      authMode: "subscription",
      envOverrides: {},
      unsetVars: [ANTHROPIC],
    })
    assert.equal(process.env[ANTHROPIC], undefined)
    apply.restore()
    assert.equal(process.env[ANTHROPIC], "before")
  })
})
