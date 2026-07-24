import assert from "node:assert/strict"
import { promises as fs } from "node:fs"
import { describe, it } from "node:test"
import {
  LlmError,
  type LlmModelSpec,
} from "@repo-edu/integrations-llm-contract"
import { createCodexLlmTextClient } from "../index"
import {
  CODEX,
  claudeSpec,
  codexMaxSpec,
  codexSpec,
  createFakeCodex,
  installCodexEnvHooks,
  request,
} from "./codex-runner-test-helpers"

installCodexEnvHooks()

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
  it("streams only appended agent-message suffixes from updated and completed snapshots", async () => {
    const { factory } = createFakeCodex({
      events: [
        {
          type: "item.updated",
          item: { id: "msg", type: "agent_message", text: "hel" },
        },
        {
          type: "item.updated",
          item: { id: "msg", type: "agent_message", text: "hello" },
        },
        {
          type: "item.completed",
          item: { id: "msg", type: "agent_message", text: "hello!" },
        },
        {
          type: "turn.completed",
          usage: {
            input_tokens: 3,
            cached_input_tokens: 1,
            output_tokens: 2,
            reasoning_output_tokens: 0,
          },
        },
      ],
    })
    const client = createCodexLlmTextClient(undefined, { factory })
    const events = []

    for await (const event of client.streamText(request(codexSpec))) {
      events.push(event)
    }

    assert.deepEqual(
      events.map((event) =>
        event.kind === "text-delta"
          ? event.text
          : event.kind === "activity"
            ? event.label
            : event.kind,
      ),
      ["Contacting Codex.", "hel", "lo", "!", "done"],
    )
  })

  it("streams reasoning activity before agent-message text is available", async () => {
    const { factory } = createFakeCodex({
      events: [
        {
          type: "item.started",
          item: { id: "reasoning", type: "reasoning", text: "" },
        },
        {
          type: "item.updated",
          item: { id: "reasoning", type: "reasoning", text: "thinking" },
        },
        {
          type: "item.completed",
          item: { id: "msg", type: "agent_message", text: "ok" },
        },
        {
          type: "turn.completed",
          usage: {
            input_tokens: 3,
            cached_input_tokens: 1,
            output_tokens: 2,
            reasoning_output_tokens: 0,
          },
        },
      ],
    })
    const client = createCodexLlmTextClient(undefined, { factory })
    const events = []

    for await (const event of client.streamText(request(codexSpec))) {
      events.push(event)
    }

    assert.deepEqual(
      events.map((event) =>
        event.kind === "activity" ? event.label : event.kind,
      ),
      [
        "Contacting Codex.",
        "Codex is reasoning.",
        "Codex is reasoning.",
        "text-delta",
        "done",
      ],
    )
  })

  it("streams tool and command activity before response text is available", async () => {
    const { factory } = createFakeCodex({
      events: [
        {
          type: "item.started",
          item: {
            id: "cmd",
            type: "command_execution",
            command: "/bin/zsh -lc 'rg --files .'",
            aggregated_output: "",
            status: "in_progress",
          },
        },
        {
          type: "item.updated",
          item: {
            id: "cmd",
            type: "command_execution",
            command: "/bin/zsh -lc 'rg --files .'",
            aggregated_output: "README.md\n",
            exit_code: 0,
            status: "completed",
          },
        },
        {
          type: "item.started",
          item: {
            id: "tool",
            type: "mcp_tool_call",
            server: "filesystem",
            tool: "read_file",
            arguments: { path: "README.md" },
            status: "in_progress",
          },
        },
        {
          type: "item.updated",
          item: {
            id: "tool",
            type: "mcp_tool_call",
            server: "filesystem",
            tool: "read_file",
            arguments: { path: "README.md" },
            result: { content: [], structured_content: {} },
            status: "completed",
          },
        },
        {
          type: "item.completed",
          item: {
            id: "patch",
            type: "file_change",
            status: "completed",
            changes: [{ path: "main.py", kind: "update" }],
          },
        },
        {
          type: "item.completed",
          item: { id: "msg", type: "agent_message", text: "ok" },
        },
        {
          type: "turn.completed",
          usage: {
            input_tokens: 3,
            cached_input_tokens: 1,
            output_tokens: 2,
            reasoning_output_tokens: 0,
          },
        },
      ],
    })
    const client = createCodexLlmTextClient(undefined, { factory })
    const events = []

    for await (const event of client.streamText(request(codexSpec))) {
      events.push(event)
    }

    assert.deepEqual(
      events.map((event) =>
        event.kind === "activity" ? event.label : event.kind,
      ),
      [
        "Contacting Codex.",
        "Codex is inspecting files: rg --files .",
        "Codex finished: rg --files .",
        "Codex is using tool: filesystem.read_file",
        "Codex finished tool: filesystem.read_file",
        "Codex applied file changes.",
        "text-delta",
        "done",
      ],
    )
  })

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
    assert.equal(call.threadOptions.networkAccessEnabled, false)
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

  it("reports uncached and cached input tokens separately", async () => {
    process.env[CODEX] = "k"
    const { factory } = createFakeCodex({
      events: [
        {
          type: "item.completed",
          item: { id: "1", type: "agent_message", text: "ok" },
        },
        {
          type: "turn.completed",
          usage: {
            input_tokens: 100,
            cached_input_tokens: 40,
            output_tokens: 5,
            reasoning_output_tokens: 1,
          },
        },
      ],
    })
    const client = createCodexLlmTextClient(undefined, { factory })
    const result = await client.generateText(request(codexSpec))
    assert.equal(result.usage.inputTokens, 60)
    assert.equal(result.usage.cachedInputTokens, 40)
    assert.equal(result.usage.outputTokens, 5)
    assert.equal(result.usage.reasoningOutputTokens, 1)
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

  it("explicit subscription omits CODEX_API_KEY from the child environment", async () => {
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
    assert.equal(calls[0].constructorOptions.env?.[CODEX], undefined)
    assert.equal(calls[0].constructorOptions.apiKey, undefined)
    assert.equal(calls[0].observedProcessEnvKey, "shell-key")
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

  it("surfaces cancellation as AbortError and removes the temporary directory", async () => {
    process.env[CODEX] = "k"
    const controller = new AbortController()
    const { factory, calls } = createFakeCodex({
      onRun: () => controller.abort(),
      events: [
        {
          type: "item.completed",
          item: { id: "1", type: "agent_message", text: "ignored" },
        },
      ],
    })
    const client = createCodexLlmTextClient(undefined, { factory })

    await assert.rejects(
      () =>
        client.generateText({
          ...request(codexSpec),
          signal: controller.signal,
        }),
      (error: unknown) =>
        error instanceof DOMException && error.name === "AbortError",
    )

    const workingDirectory = calls[0]?.threadOptions.workingDirectory
    assert.ok(workingDirectory)
    await assert.rejects(() => fs.access(workingDirectory))
  })
})
