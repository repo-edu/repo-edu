import assert from "node:assert/strict"
import { promises as fs } from "node:fs"
import { afterEach, beforeEach, describe, it } from "node:test"
import type {
  Codex,
  Input as CodexInput,
  CodexOptions,
  ThreadEvent,
  ThreadOptions,
  TurnOptions,
} from "@openai/codex-sdk"
import {
  type GenerateTextRequest,
  LlmError,
  type LlmModelSpec,
} from "@repo-edu/integrations-llm-contract"
import { createCodexLlmTextClient } from "../index"

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

const codexSpec: LlmModelSpec = {
  provider: "codex",
  family: "gpt-5.4",
  modelId: "gpt-5.4",
  effort: "medium",
}

const codexMaxSpec: LlmModelSpec = {
  provider: "codex",
  family: "gpt-5.5",
  modelId: "gpt-5.5",
  effort: "max",
}

const claudeSpec: LlmModelSpec = {
  provider: "claude",
  family: "sonnet",
  modelId: "claude-sonnet-4-6",
  effort: "medium",
}

type FakeCall = {
  constructorOptions: CodexOptions
  threadOptions: ThreadOptions
  promptInput: string
  observedEnvKey: string | undefined
}

type FakeOutcome = {
  events?: ThreadEvent[]
  throwOnRun?: unknown
}

function createFakeCodex(outcome: FakeOutcome): {
  factory: (options: CodexOptions) => Codex
  calls: FakeCall[]
} {
  const calls: FakeCall[] = []
  const factory = (constructorOptions: CodexOptions): Codex => {
    return {
      startThread(threadOptions: ThreadOptions = {}) {
        return {
          get id() {
            return null
          },
          async runStreamed(input: CodexInput, _turnOptions?: TurnOptions) {
            calls.push({
              constructorOptions,
              threadOptions,
              promptInput: typeof input === "string" ? input : "",
              observedEnvKey: process.env[CODEX],
            })
            const events = outcome.events ?? []
            const throwOnRun = outcome.throwOnRun
            return {
              events: (async function* () {
                if (throwOnRun) throw throwOnRun
                for (const event of events) yield event
              })(),
            }
          },
          async run() {
            throw new Error("fake.run() not used; runStreamed is the path")
          },
        } as unknown as ReturnType<Codex["startThread"]>
      },
      resumeThread() {
        throw new Error("fake.resumeThread() not used in tests")
      },
    } as unknown as Codex
  }
  return { factory, calls }
}

function request(spec: LlmModelSpec, prompt = "ping"): GenerateTextRequest {
  return { spec, prompt }
}

describe("createCodexLlmTextClient — guard rails", () => {
  it("throws plain Error for non-codex specs", async () => {
    const { factory } = createFakeCodex({ events: [] })
    const client = createCodexLlmTextClient(undefined, { factory })
    await assert.rejects(
      () => client.generateText(request(claudeSpec)),
      (err: unknown) =>
        err instanceof Error &&
        !(err instanceof LlmError) &&
        /non-codex spec/.test(err.message),
    )
  })

  it("throws LlmError('other', ...) for effort 'max'", async () => {
    const { factory } = createFakeCodex({ events: [] })
    const client = createCodexLlmTextClient(undefined, { factory })
    await assert.rejects(
      () => client.generateText(request(codexMaxSpec)),
      (err: unknown) =>
        err instanceof LlmError &&
        err.kind === "other" &&
        err.context.provider === "codex" &&
        /'max' is not supported/.test(err.message),
    )
  })
})

describe("createCodexLlmTextClient — thread options snapshot", () => {
  it("starts a read-only thread in a neutral temp directory with web search disabled", async () => {
    process.env[CODEX] = "k"
    const { factory, calls } = createFakeCodex({
      events: [
        {
          type: "item.completed",
          item: { id: "1", type: "agent_message", text: "pong" },
        },
        {
          type: "turn.completed",
          usage: {
            input_tokens: 10,
            cached_input_tokens: 0,
            output_tokens: 4,
            reasoning_output_tokens: 0,
          },
        },
      ],
    })
    const client = createCodexLlmTextClient(undefined, { factory })
    const result = await client.generateText(request(codexSpec))
    assert.equal(result.reply, "pong")
    assert.equal(result.usage.inputTokens, 10)
    assert.equal(result.usage.outputTokens, 4)
    assert.equal(result.usage.authMode, "api")

    assert.equal(calls.length, 1)
    const call = calls[0]
    assert.equal(call.threadOptions.model, "gpt-5.4")
    assert.equal(call.threadOptions.modelReasoningEffort, "medium")
    assert.equal(call.threadOptions.sandboxMode, "read-only")
    assert.equal(call.threadOptions.approvalPolicy, "never")
    assert.equal(call.threadOptions.skipGitRepoCheck, true)
    assert.equal(call.threadOptions.webSearchMode, "disabled")
    const wd = call.threadOptions.workingDirectory
    assert.ok(typeof wd === "string" && wd.length > 0)
    assert.match(call.promptInput, /strict prompt\/reply mode/)

    // Temp dir is removed after the call
    if (wd) {
      await assert.rejects(() => fs.access(wd))
    }
  })

  it("maps usage: null to zero token counts and still reports wallMs", async () => {
    process.env[CODEX] = "k"
    const { factory } = createFakeCodex({
      events: [
        {
          type: "item.completed",
          item: { id: "1", type: "agent_message", text: "ok" },
        },
        { type: "turn.completed", usage: null as never },
      ],
    })
    const client = createCodexLlmTextClient(undefined, { factory })
    const result = await client.generateText(request(codexSpec))
    assert.equal(result.usage.inputTokens, 0)
    assert.equal(result.usage.cachedInputTokens, 0)
    assert.equal(result.usage.outputTokens, 0)
    assert.equal(result.usage.reasoningOutputTokens, 0)
    assert.ok(typeof result.usage.wallMs === "number")
  })

  it("propagates xhigh reasoning effort", async () => {
    process.env[CODEX] = "k"
    const { factory, calls } = createFakeCodex({
      events: [
        {
          type: "item.completed",
          item: { id: "1", type: "agent_message", text: "x" },
        },
        {
          type: "turn.completed",
          usage: {
            input_tokens: 0,
            cached_input_tokens: 0,
            output_tokens: 0,
            reasoning_output_tokens: 0,
          },
        },
      ],
    })
    const client = createCodexLlmTextClient(undefined, { factory })
    const xhighSpec: LlmModelSpec = { ...codexSpec, effort: "xhigh" }
    await client.generateText(request(xhighSpec))
    assert.equal(calls[0].threadOptions.modelReasoningEffort, "xhigh")
  })

  it("omits modelReasoningEffort for tier-only families ('none')", async () => {
    process.env[CODEX] = "k"
    const { factory, calls } = createFakeCodex({
      events: [
        {
          type: "item.completed",
          item: { id: "1", type: "agent_message", text: "x" },
        },
        {
          type: "turn.completed",
          usage: {
            input_tokens: 0,
            cached_input_tokens: 0,
            output_tokens: 0,
            reasoning_output_tokens: 0,
          },
        },
      ],
    })
    const miniSpec: LlmModelSpec = {
      provider: "codex",
      family: "gpt-5.4-mini",
      modelId: "gpt-5.4-mini",
      effort: "none",
    }
    const client = createCodexLlmTextClient(undefined, { factory })
    await client.generateText(request(miniSpec))
    assert.equal(calls[0].threadOptions.modelReasoningEffort, undefined)
  })
})

describe("createCodexLlmTextClient — auth-mode handling", () => {
  it("explicit api passes apiKey to the SDK", async () => {
    const { factory, calls } = createFakeCodex({
      events: [
        {
          type: "item.completed",
          item: { id: "1", type: "agent_message", text: "x" },
        },
        {
          type: "turn.completed",
          usage: {
            input_tokens: 0,
            cached_input_tokens: 0,
            output_tokens: 0,
            reasoning_output_tokens: 0,
          },
        },
      ],
    })
    const client = createCodexLlmTextClient(
      { authMode: "api", apiKey: "config-key" },
      { factory },
    )
    const result = await client.generateText(request(codexSpec))
    assert.equal(result.usage.authMode, "api")
    assert.equal(calls[0].constructorOptions.apiKey, "config-key")
  })

  it("explicit subscription strips CODEX_API_KEY from process.env during the call", async () => {
    process.env[CODEX] = "shell-key"
    const { factory, calls } = createFakeCodex({
      events: [
        {
          type: "item.completed",
          item: { id: "1", type: "agent_message", text: "x" },
        },
        {
          type: "turn.completed",
          usage: {
            input_tokens: 0,
            cached_input_tokens: 0,
            output_tokens: 0,
            reasoning_output_tokens: 0,
          },
        },
      ],
    })
    const client = createCodexLlmTextClient(
      { authMode: "subscription" },
      { factory },
    )
    const result = await client.generateText(request(codexSpec))
    assert.equal(result.usage.authMode, "subscription")
    assert.equal(calls[0].observedEnvKey, undefined)
    assert.equal(calls[0].constructorOptions.apiKey, undefined)
    // restored after the call
    assert.equal(process.env[CODEX], "shell-key")
  })

  it("explicit api with no resolved key throws LlmError('auth')", async () => {
    const { factory } = createFakeCodex({ events: [] })
    const client = createCodexLlmTextClient({ authMode: "api" }, { factory })
    await assert.rejects(
      () => client.generateText(request(codexSpec)),
      (err: unknown) =>
        err instanceof LlmError &&
        err.kind === "auth" &&
        err.context.provider === "codex" &&
        err.context.authMode === "api",
    )
  })

  it("inferred mode defaults to subscription when no key is present", async () => {
    const { factory, calls } = createFakeCodex({
      events: [
        {
          type: "item.completed",
          item: { id: "1", type: "agent_message", text: "x" },
        },
        {
          type: "turn.completed",
          usage: {
            input_tokens: 0,
            cached_input_tokens: 0,
            output_tokens: 0,
            reasoning_output_tokens: 0,
          },
        },
      ],
    })
    const client = createCodexLlmTextClient(undefined, { factory })
    const result = await client.generateText(request(codexSpec))
    assert.equal(result.usage.authMode, "subscription")
    assert.equal(calls[0].constructorOptions.apiKey, undefined)
  })
})

describe("createCodexLlmTextClient — error classification", () => {
  it("wraps a turn.failed event into an LlmError with codex context", async () => {
    process.env[CODEX] = "k"
    const { factory } = createFakeCodex({
      events: [
        {
          type: "turn.failed",
          error: { message: "429 rate limit; retry-after 5s" },
        },
      ],
    })
    const client = createCodexLlmTextClient(undefined, { factory })
    await assert.rejects(
      () => client.generateText(request(codexSpec)),
      (err: unknown) =>
        err instanceof LlmError &&
        err.kind === "rate_limit" &&
        err.context.provider === "codex",
    )
  })

  it("classifies long-retry rate-limit failures as quota_exhausted", async () => {
    process.env[CODEX] = "k"
    const { factory } = createFakeCodex({
      events: [
        {
          type: "turn.failed",
          error: { message: "429 rate limit; retry-after 25200s" },
        },
      ],
    })
    const client = createCodexLlmTextClient(undefined, { factory })
    await assert.rejects(
      () => client.generateText(request(codexSpec)),
      (err: unknown) =>
        err instanceof LlmError && err.kind === "quota_exhausted",
    )
  })

  it("propagates an SDK throw into LlmError with codex/authMode context", async () => {
    process.env[CODEX] = "k"
    const { factory } = createFakeCodex({
      throwOnRun: new Error("ECONNRESET: connection reset"),
    })
    const client = createCodexLlmTextClient(undefined, { factory })
    await assert.rejects(
      () => client.generateText(request(codexSpec)),
      (err: unknown) =>
        err instanceof LlmError &&
        err.kind === "network" &&
        err.context.provider === "codex" &&
        err.context.authMode === "api",
    )
  })
})
