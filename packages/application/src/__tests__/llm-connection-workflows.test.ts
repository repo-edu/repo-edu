import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { VerifyLlmDraftInput } from "@repo-edu/application-contract"
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
    streamText() {
      throw new Error("streamText is not used by connection verification.")
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

  it("forwards Claude api maxTokens to the factory", async () => {
    const { factory, calls } = recordingClientFactory()
    const handlers = createLlmConnectionWorkflowHandlers({
      createDraftLlmTextClient: factory,
    })
    await handlers["connection.verifyLlmDraft"]({
      provider: "claude",
      authMode: "api",
      apiKey: "sk-test",
      maxTokens: 8192,
    })
    assert.deepStrictEqual(calls[0]?.draft, {
      provider: "claude",
      authMode: "api",
      apiKey: "sk-test",
      maxTokens: 8192,
    })
  })

  it("rejects malformed Claude api drafts before creating a client", async () => {
    const { factory, calls } = recordingClientFactory()
    const handlers = createLlmConnectionWorkflowHandlers({
      createDraftLlmTextClient: factory,
    })

    await assert.rejects(
      () =>
        handlers["connection.verifyLlmDraft"]({
          provider: "claude",
          authMode: "api",
          apiKey: "sk-test",
        } as VerifyLlmDraftInput),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        (error as { type?: unknown }).type === "validation" &&
        ((error as { issues?: { path: string }[] }).issues ?? []).some(
          (issue) => issue.path === "maxTokens",
        ),
    )
    assert.equal(calls.length, 0)
  })

  it("rejects subscription drafts that include credentials", async () => {
    const { factory, calls } = recordingClientFactory()
    const handlers = createLlmConnectionWorkflowHandlers({
      createDraftLlmTextClient: factory,
    })

    await assert.rejects(
      () =>
        handlers["connection.verifyLlmDraft"]({
          provider: "codex",
          authMode: "subscription",
          apiKey: "sk-leak",
        } as VerifyLlmDraftInput),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        (error as { type?: unknown }).type === "validation" &&
        ((error as { issues?: { path: string }[] }).issues ?? []).some(
          (issue) => issue.path === "apiKey",
        ),
    )
    assert.equal(calls.length, 0)
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
        streamText() {
          throw new Error("streamText is not used by connection verification.")
        },
      }),
    })
    await assert.rejects(
      () =>
        handlers["connection.verifyLlmDraft"]({
          provider: "claude",
          authMode: "api",
          apiKey: "sk-bad",
          maxTokens: 8192,
        }),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        (error as { type?: unknown }).type === "provider" &&
        (error as { provider?: unknown }).provider === "llm" &&
        (error as { message?: unknown }).message === "bad key" &&
        (error as { retryable?: unknown }).retryable === false,
    )
  })
})
