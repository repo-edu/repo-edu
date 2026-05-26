import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  type GenerateTextRequest,
  LlmError,
  type LlmTextClient,
} from "@repo-edu/integrations-llm-contract"

const codexSpec = {
  provider: "codex" as const,
  family: "gpt-5.4",
  modelId: "gpt-5.4",
  effort: "medium" as const,
}

const claudeSpec = {
  provider: "claude" as const,
  family: "sonnet",
  modelId: "claude-sonnet-4-6",
  effort: "medium" as const,
}

const usage = {
  inputTokens: 1,
  cachedInputTokens: 0,
  outputTokens: 1,
  reasoningOutputTokens: 0,
  wallMs: 0,
  authMode: "subscription" as const,
}

function fakeRequest(
  spec: typeof codexSpec | typeof claudeSpec,
): GenerateTextRequest {
  return { spec, prompt: "ping" }
}

describe("Dispatcher routing", () => {
  it("routes by spec.provider and surfaces unknown providers as plain Error", async () => {
    const claude: LlmTextClient = {
      async generateText(request) {
        return {
          reply: `claude:${request.spec.modelId}`,
          usage,
        }
      },
      async *streamText(request) {
        yield { kind: "text-delta", text: `claude:${request.spec.modelId}` }
        yield { kind: "done", usage }
      },
    }
    const codex: LlmTextClient = {
      async generateText(request) {
        return {
          reply: `codex:${request.spec.modelId}`,
          usage: { ...usage, authMode: "api" },
        }
      },
      async *streamText(request) {
        yield { kind: "text-delta", text: `codex:${request.spec.modelId}` }
        yield { kind: "done", usage: { ...usage, authMode: "api" } }
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
      streamText(request) {
        return route(request.spec.provider).streamText(request)
      },
    }

    const claudeResult = await client.generateText(fakeRequest(claudeSpec))
    assert.equal(claudeResult.reply, "claude:claude-sonnet-4-6")
    const codexResult = await client.generateText(fakeRequest(codexSpec))
    assert.equal(codexResult.reply, "codex:gpt-5.4")

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
