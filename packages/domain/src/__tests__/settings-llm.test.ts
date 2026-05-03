import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  defaultAppSettings,
  type PersistedLlmConnection,
  persistedLlmConnectionSchema,
  resolveActiveLlmConnection,
} from "../settings.js"

describe("persistedLlmConnectionSchema", () => {
  it("accepts a subscription connection with empty apiKey", () => {
    const result = persistedLlmConnectionSchema.safeParse({
      id: "id-1",
      name: "Personal Anthropic",
      provider: "claude",
      authMode: "subscription",
      apiKey: "",
    })
    assert.equal(result.success, true)
  })

  it("accepts an api connection with non-empty apiKey", () => {
    const result = persistedLlmConnectionSchema.safeParse({
      id: "id-1",
      name: "Codex API",
      provider: "codex",
      authMode: "api",
      apiKey: "sk-...",
    })
    assert.equal(result.success, true)
  })

  it("rejects subscription connection with non-empty apiKey", () => {
    const result = persistedLlmConnectionSchema.safeParse({
      id: "id-1",
      name: "Bad",
      provider: "claude",
      authMode: "subscription",
      apiKey: "sk-leaked",
    })
    assert.equal(result.success, false)
  })

  it("rejects api connection with empty apiKey", () => {
    const result = persistedLlmConnectionSchema.safeParse({
      id: "id-1",
      name: "Bad",
      provider: "codex",
      authMode: "api",
      apiKey: "",
    })
    assert.equal(result.success, false)
  })
})

describe("resolveActiveLlmConnection", () => {
  const claudeSub: PersistedLlmConnection = {
    id: "claude-1",
    name: "Claude Sub",
    provider: "claude",
    authMode: "subscription",
    apiKey: "",
  }
  const codexApi: PersistedLlmConnection = {
    id: "codex-1",
    name: "Codex API",
    provider: "codex",
    authMode: "api",
    apiKey: "sk-codex",
  }

  it("returns null when no connections exist", () => {
    assert.equal(
      resolveActiveLlmConnection({
        llmConnections: [],
        activeLlmConnectionId: null,
      }),
      null,
    )
  })

  it("returns first connection when active id is null", () => {
    assert.equal(
      resolveActiveLlmConnection({
        llmConnections: [claudeSub, codexApi],
        activeLlmConnectionId: null,
      }),
      claudeSub,
    )
  })

  it("returns matching connection by id", () => {
    assert.equal(
      resolveActiveLlmConnection({
        llmConnections: [claudeSub, codexApi],
        activeLlmConnectionId: "codex-1",
      }),
      codexApi,
    )
  })

  it("falls back to first connection when active id is stale", () => {
    assert.equal(
      resolveActiveLlmConnection({
        llmConnections: [claudeSub, codexApi],
        activeLlmConnectionId: "deleted-id",
      }),
      claudeSub,
    )
  })
})

describe("defaultAppSettings — LLM fields", () => {
  it("seeds empty connections, no active id, and empty model map", () => {
    assert.deepStrictEqual(defaultAppSettings.llmConnections, [])
    assert.equal(defaultAppSettings.activeLlmConnectionId, null)
    assert.deepStrictEqual(defaultAppSettings.examinationModelsByProvider, {})
  })
})
