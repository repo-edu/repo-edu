import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"
import { LlmError } from "@repo-edu/integrations-llm-contract"
import { applyEnvOverrides, resolveCodexAuth } from "../auth"

const CODEX = "CODEX_API_KEY"

let saved: string | undefined

beforeEach(() => {
  saved = process.env[CODEX]
  delete process.env[CODEX]
})

afterEach(() => {
  if (saved === undefined) {
    delete process.env[CODEX]
  } else {
    process.env[CODEX] = saved
  }
})

describe("resolveCodexAuth", () => {
  it("infers subscription mode when no key is present", () => {
    const resolved = resolveCodexAuth(undefined)
    assert.equal(resolved.authMode, "subscription")
    assert.equal(resolved.apiKey, undefined)
    assert.deepEqual(resolved.envOverrides, {})
    assert.deepEqual(resolved.unsetVars, [])
  })

  it("infers api mode when CODEX_API_KEY is in process.env", () => {
    process.env[CODEX] = "secret-from-shell"
    const resolved = resolveCodexAuth(undefined)
    assert.equal(resolved.authMode, "api")
    assert.equal(resolved.apiKey, "secret-from-shell")
    assert.deepEqual(resolved.envOverrides, {})
    assert.deepEqual(resolved.unsetVars, [])
  })

  it("explicit api with config.apiKey wins over env var", () => {
    process.env[CODEX] = "shell-key"
    const resolved = resolveCodexAuth({
      authMode: "api",
      apiKey: "config-key",
    })
    assert.equal(resolved.authMode, "api")
    assert.equal(resolved.apiKey, "config-key")
  })

  it("explicit subscription strips CODEX_API_KEY from env", () => {
    process.env[CODEX] = "shell-key"
    const resolved = resolveCodexAuth({ authMode: "subscription" })
    assert.equal(resolved.authMode, "subscription")
    assert.equal(resolved.apiKey, undefined)
    assert.deepEqual(resolved.unsetVars, [CODEX])
  })

  it("explicit subscription strips a config.env override too", () => {
    const resolved = resolveCodexAuth({
      authMode: "subscription",
      env: { [CODEX]: "from-config" },
    })
    assert.equal(resolved.authMode, "subscription")
    assert.deepEqual(resolved.unsetVars, [CODEX])
    assert.deepEqual(resolved.envOverrides, {})
  })

  it("explicit api throws LlmError('auth', ...) when no key resolves", () => {
    assert.throws(
      () => resolveCodexAuth({ authMode: "api" }),
      (error: unknown) =>
        error instanceof LlmError &&
        error.kind === "auth" &&
        error.context.provider === "codex" &&
        error.context.authMode === "api",
    )
  })

  it("forwards baseUrl and non-key env entries", () => {
    const resolved = resolveCodexAuth({
      authMode: "api",
      apiKey: "k",
      baseUrl: "https://example.invalid",
      env: { OPENAI_ORG: "org-1", [CODEX]: "ignored" },
    })
    assert.equal(resolved.baseUrl, "https://example.invalid")
    assert.deepEqual(resolved.envOverrides, { OPENAI_ORG: "org-1" })
  })
})

describe("applyEnvOverrides (codex)", () => {
  it("temporarily sets env overrides and restores them", () => {
    const apply = applyEnvOverrides({
      authMode: "api",
      apiKey: "k",
      baseUrl: undefined,
      envOverrides: { CODEX_TEST_VAR: "during" },
      unsetVars: [],
    })
    assert.equal(process.env.CODEX_TEST_VAR, "during")
    apply.restore()
    assert.equal(process.env.CODEX_TEST_VAR, undefined)
  })

  it("unsets CODEX_API_KEY for subscription and restores it", () => {
    process.env[CODEX] = "before"
    const apply = applyEnvOverrides({
      authMode: "subscription",
      apiKey: undefined,
      baseUrl: undefined,
      envOverrides: {},
      unsetVars: [CODEX],
    })
    assert.equal(process.env[CODEX], undefined)
    apply.restore()
    assert.equal(process.env[CODEX], "before")
  })
})
