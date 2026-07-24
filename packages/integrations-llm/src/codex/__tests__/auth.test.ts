import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"
import { LlmError } from "@repo-edu/integrations-llm-contract"
import { resolveCodexAuth } from "../auth"

const CODEX = "CODEX_API_KEY"

let saved: string | undefined
let savedParent: string | undefined

beforeEach(() => {
  saved = process.env[CODEX]
  savedParent = process.env.CODEX_TEST_PARENT
  delete process.env[CODEX]
  delete process.env.CODEX_TEST_PARENT
})

afterEach(() => {
  if (saved === undefined) {
    delete process.env[CODEX]
  } else {
    process.env[CODEX] = saved
  }
  if (savedParent === undefined) {
    delete process.env.CODEX_TEST_PARENT
  } else {
    process.env.CODEX_TEST_PARENT = savedParent
  }
})

describe("resolveCodexAuth", () => {
  it("infers subscription mode when no key is present", () => {
    const resolved = resolveCodexAuth(undefined)
    assert.equal(resolved.authMode, "subscription")
    assert.equal(resolved.clientOptions.apiKey, undefined)
    assert.equal(resolved.clientOptions.env?.[CODEX], undefined)
  })

  it("infers api mode when CODEX_API_KEY is in process.env", () => {
    process.env[CODEX] = "secret-from-shell"
    const resolved = resolveCodexAuth(undefined)
    assert.equal(resolved.authMode, "api")
    assert.equal(resolved.clientOptions.apiKey, "secret-from-shell")
    assert.equal(resolved.clientOptions.env?.[CODEX], "secret-from-shell")
  })

  it("explicit api with config.apiKey wins over env var", () => {
    process.env[CODEX] = "shell-key"
    const resolved = resolveCodexAuth({
      authMode: "api",
      apiKey: "config-key",
    })
    assert.equal(resolved.authMode, "api")
    assert.equal(resolved.clientOptions.apiKey, "config-key")
    assert.equal(resolved.clientOptions.env?.[CODEX], "config-key")
  })

  it("explicit subscription strips CODEX_API_KEY from env", () => {
    process.env[CODEX] = "shell-key"
    const resolved = resolveCodexAuth({ authMode: "subscription" })
    assert.equal(resolved.authMode, "subscription")
    assert.equal(resolved.clientOptions.apiKey, undefined)
    assert.equal(resolved.clientOptions.env?.[CODEX], undefined)
    assert.equal(process.env[CODEX], "shell-key")
  })

  it("explicit subscription strips a config.env override too", () => {
    const resolved = resolveCodexAuth({
      authMode: "subscription",
      env: { [CODEX]: "from-config" },
    })
    assert.equal(resolved.authMode, "subscription")
    assert.equal(resolved.clientOptions.env?.[CODEX], undefined)
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

  it("builds immutable SDK options with the complete child environment", () => {
    process.env.CODEX_TEST_PARENT = "parent"
    const resolved = resolveCodexAuth({
      authMode: "api",
      apiKey: "k",
      baseUrl: "https://example.invalid",
      binaryPath: "/opt/codex",
      env: { OPENAI_ORG: "org-1", [CODEX]: "ignored" },
    })
    assert.equal(resolved.clientOptions.baseUrl, "https://example.invalid")
    assert.equal(resolved.clientOptions.codexPathOverride, "/opt/codex")
    assert.equal(resolved.clientOptions.env?.OPENAI_ORG, "org-1")
    assert.equal(resolved.clientOptions.env?.CODEX_TEST_PARENT, "parent")
    assert.equal(resolved.clientOptions.env?.[CODEX], "k")
    assert.equal(Object.isFrozen(resolved), true)
    assert.equal(Object.isFrozen(resolved.clientOptions), true)
    assert.equal(Object.isFrozen(resolved.clientOptions.env), true)
  })
})
