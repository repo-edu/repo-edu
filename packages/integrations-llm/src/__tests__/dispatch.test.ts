import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  type GenerateTextRequest,
  LlmError,
  type LlmTextClient,
} from "@repo-edu/integrations-llm-contract"
import { createCodexLlmTextClient } from "../codex"

const codexSpec = {
  provider: "codex" as const,
  family: "gpt-5.5",
  modelId: "gpt-5.5",
  effort: "medium" as const,
}

const claudeSpec = {
  provider: "claude" as const,
  family: "sonnet",
  modelId: "claude-sonnet-4-6",
  effort: "medium" as const,
}

function fakeRequest(
  spec: typeof codexSpec | typeof claudeSpec,
): GenerateTextRequest {
  return { spec, prompt: "ping" }
}

describe("Codex stub", () => {
  it("throws LlmError('other', ...) until the real adapter ships", async () => {
    const client: LlmTextClient = createCodexLlmTextClient()
    await assert.rejects(
      () => client.generateText(fakeRequest(codexSpec)),
      (error: unknown) => {
        if (!(error instanceof LlmError)) return false
        if (error.kind !== "other") return false
        if (error.context.provider !== "codex") return false
        return true
      },
    )
  })
})

describe("Dispatcher routing", () => {
  it("routes by spec.provider and surfaces unknown providers as plain Error", async () => {
    const claude: LlmTextClient = {
      async generateText(request) {
        return {
          reply: `claude:${request.spec.modelId}`,
          usage: {
            inputTokens: 1,
            cachedInputTokens: 0,
            outputTokens: 1,
            reasoningOutputTokens: 0,
            wallMs: 0,
            authMode: "subscription",
          },
        }
      },
    }
    const codex: LlmTextClient = {
      async generateText(request) {
        return {
          reply: `codex:${request.spec.modelId}`,
          usage: {
            inputTokens: 0,
            cachedInputTokens: 0,
            outputTokens: 0,
            reasoningOutputTokens: 0,
            wallMs: 0,
            authMode: "api",
          },
        }
      },
    }
    const route = (provider: string): LlmTextClient => {
      if (provider === "claude") return claude
      if (provider === "codex") return codex
      throw new Error(`unknown provider: ${provider}`)
    }
    const client: LlmTextClient = {
      generateText(request) {
        return route(request.spec.provider).generateText(request)
      },
    }

    const claudeResult = await client.generateText(fakeRequest(claudeSpec))
    assert.equal(claudeResult.reply, "claude:claude-sonnet-4-6")
    const codexResult = await client.generateText(fakeRequest(codexSpec))
    assert.equal(codexResult.reply, "codex:gpt-5.5")

    const bogusSpec = {
      ...claudeSpec,
      provider: "bogus",
    } as unknown as typeof claudeSpec
    await assert.rejects(
      () => client.generateText({ spec: bogusSpec, prompt: "x" }),
      (error: unknown) =>
        error instanceof Error &&
        !(error instanceof LlmError) &&
        /unknown provider/.test(error.message),
    )
  })
})
