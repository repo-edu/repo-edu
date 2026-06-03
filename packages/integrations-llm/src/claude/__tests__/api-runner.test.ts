import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { ClientOptions } from "@anthropic-ai/sdk"
import type {
  MessageCreateParams,
  MessageStreamEvent,
} from "@anthropic-ai/sdk/resources/messages"
import { LlmError } from "@repo-edu/integrations-llm-contract"
import { runClaudeStream } from "../runner"

const claudeSpec = {
  provider: "claude" as const,
  family: "sonnet",
  modelId: "claude-sonnet-4-6",
  effort: "xhigh" as const,
}

function apiFactory(events: unknown[]) {
  const calls: {
    options: ClientOptions
    body: MessageCreateParams
    requestOptions: { signal?: AbortSignal | null }
    aborted: boolean
  }[] = []
  return {
    calls,
    factory(options: ClientOptions) {
      return {
        messages: {
          stream(
            body: MessageCreateParams,
            requestOptions: { signal?: AbortSignal | null },
          ) {
            const call = { options, body, requestOptions, aborted: false }
            calls.push(call)
            return {
              abort() {
                call.aborted = true
              },
              async *[Symbol.asyncIterator](): AsyncGenerator<MessageStreamEvent> {
                for (const event of events) {
                  yield event as MessageStreamEvent
                }
              },
            }
          },
        },
      }
    },
  }
}

describe("runClaudeApiStream", () => {
  it("maps text and raw usage without emitting thinking text", async () => {
    const { factory, calls } = apiFactory([
      {
        type: "message_start",
        message: {
          usage: {
            input_tokens: 10,
            cache_creation_input_tokens: 2,
            cache_read_input_tokens: 3,
            output_tokens: 0,
            output_tokens_details: null,
          },
        },
      },
      {
        type: "content_block_start",
        content_block: { type: "thinking", thinking: "" },
      },
      {
        type: "content_block_delta",
        delta: { type: "thinking_delta", thinking: "hidden reasoning" },
      },
      {
        type: "content_block_delta",
        delta: { type: "text_delta", text: "ok" },
      },
      {
        type: "message_delta",
        usage: {
          input_tokens: 10,
          cache_creation_input_tokens: 2,
          cache_read_input_tokens: 3,
          output_tokens: 5,
          output_tokens_details: { thinking_tokens: 4 },
        },
      },
      { type: "message_stop" },
    ])

    const events = []
    for await (const event of runClaudeStream(
      {
        spec: claudeSpec,
        prompt: "ping",
        apiFactory: factory,
      },
      {
        authMode: "api",
        apiKey: "sk-test",
        maxTokens: 8192,
      },
    )) {
      events.push(event)
    }

    assert.equal(calls[0]?.options.apiKey, "sk-test")
    assert.equal(calls[0]?.body.max_tokens, 8192)
    assert.deepStrictEqual(calls[0]?.body.output_config, { effort: "xhigh" })
    assert.deepStrictEqual(calls[0]?.body.thinking, { type: "adaptive" })
    assert.deepStrictEqual(
      events.filter((event) => event.kind === "text-delta"),
      [{ kind: "text-delta", text: "ok" }],
    )
    const done = events.find((event) => event.kind === "done")
    assert.deepStrictEqual(done?.usage, {
      inputTokens: 12,
      cachedInputTokens: 3,
      outputTokens: 5,
      reasoningOutputTokens: 4,
      wallMs: done?.usage.wallMs,
      authMode: "api",
    })
  })

  it("passes the abort signal to messages.stream", async () => {
    const { factory, calls } = apiFactory([{ type: "message_stop" }])
    const controller = new AbortController()

    for await (const _event of runClaudeStream(
      {
        spec: claudeSpec,
        prompt: "ping",
        signal: controller.signal,
        apiFactory: factory,
      },
      { authMode: "api", apiKey: "sk-test", maxTokens: 8192 },
    )) {
      // Drain stream.
    }

    assert.equal(calls[0]?.requestOptions.signal, controller.signal)
  })

  it("rejects unsupported Claude effort values", async () => {
    const { factory } = apiFactory([])
    await assert.rejects(
      async () => {
        for await (const _event of runClaudeStream(
          {
            spec: { ...claudeSpec, effort: "minimal" },
            prompt: "ping",
            apiFactory: factory,
          },
          { authMode: "api", apiKey: "sk-test", maxTokens: 8192 },
        )) {
          // Drain stream.
        }
      },
      (error: unknown) =>
        error instanceof LlmError &&
        error.kind === "other" &&
        error.context.provider === "claude" &&
        error.context.authMode === "api",
    )
  })
})
