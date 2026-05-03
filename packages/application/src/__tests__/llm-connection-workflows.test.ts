import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { getVerifyDefaultSpec } from "@repo-edu/integrations-llm-catalog"
import {
  type GenerateTextRequest,
  LlmError,
  type LlmTextClient,
} from "@repo-edu/integrations-llm-contract"
import {
  createLlmConnectionWorkflowHandlers,
  type LlmDraftConnection,
} from "../llm-connection-workflows.js"

function recordingClientFactory() {
  const calls: {
    draft: LlmDraftConnection
    request: GenerateTextRequest
  }[] = []
  const factory = (draft: LlmDraftConnection): LlmTextClient => ({
    async generateText(request) {
      calls.push({ draft, request })
      return {
        reply: "ok",
        usage: {
          inputTokens: 1,
          cachedInputTokens: 0,
          outputTokens: 1,
          reasoningOutputTokens: 0,
          wallMs: 1,
          authMode: draft.authMode,
        },
      }
    },
  })
  return { factory, calls }
}

describe("connection.verifyLlmDraft", () => {
  it("returns verified=true on a non-empty reply", async () => {
    const { factory } = recordingClientFactory()
    const handlers = createLlmConnectionWorkflowHandlers({
      createDraftLlmTextClient: factory,
    })
    const result = await handlers["connection.verifyLlmDraft"]({
      provider: "claude",
      authMode: "subscription",
      apiKey: "",
    })
    assert.equal(result.verified, true)
    assert.ok(result.checkedAt.length > 0)
  })

  it("forwards the draft credentials to the factory and never reads active settings", async () => {
    const { factory, calls } = recordingClientFactory()
    const handlers = createLlmConnectionWorkflowHandlers({
      createDraftLlmTextClient: factory,
    })
    await handlers["connection.verifyLlmDraft"]({
      provider: "codex",
      authMode: "api",
      apiKey: "sk-test",
    })
    assert.equal(calls.length, 1)
    assert.deepStrictEqual(calls[0]?.draft, {
      provider: "codex",
      authMode: "api",
      apiKey: "sk-test",
    })
  })

  it("uses the catalog-marked verify default for the provider", async () => {
    const { factory, calls } = recordingClientFactory()
    const handlers = createLlmConnectionWorkflowHandlers({
      createDraftLlmTextClient: factory,
    })
    await handlers["connection.verifyLlmDraft"]({
      provider: "claude",
      authMode: "subscription",
      apiKey: "",
    })
    const verifySpec = getVerifyDefaultSpec("claude")
    assert.ok(verifySpec)
    assert.equal(calls[0]?.request.spec.modelId, verifySpec?.modelId)
    assert.equal(calls[0]?.request.spec.effort, verifySpec?.effort)
  })

  it("normalizes LlmError into an app-level provider error", async () => {
    const handlers = createLlmConnectionWorkflowHandlers({
      createDraftLlmTextClient: () => ({
        async generateText() {
          throw new LlmError("auth", "bad key", {
            context: { provider: "claude", authMode: "api" },
          })
        },
      }),
    })
    await assert.rejects(
      () =>
        handlers["connection.verifyLlmDraft"]({
          provider: "claude",
          authMode: "api",
          apiKey: "sk-bad",
        }),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        (error as { type?: unknown }).type === "provider" &&
        (error as { provider?: unknown }).provider === "llm",
    )
  })
})
