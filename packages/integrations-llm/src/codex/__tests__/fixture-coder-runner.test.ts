import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { LlmError } from "@repo-edu/integrations-llm-contract"
import {
  DEFAULT_CODEX_FIXTURE_CODER_LIMITS,
  runCodexFixtureCoder,
} from "../runner"
import {
  CODEX,
  codexSpec,
  createFakeCodex,
  installCodexEnvHooks,
} from "./codex-runner-test-helpers"

installCodexEnvHooks()

describe("runCodexFixtureCoder — writable fixture repo guard rails", () => {
  it("starts a workspace-write thread in the provided repo without network or web search", async () => {
    process.env[CODEX] = "k"
    const { factory, calls } = createFakeCodex({
      events: [
        {
          type: "item.completed",
          item: { id: "1", type: "agent_message", text: "done\nCOMMIT: x" },
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
    const result = await runCodexFixtureCoder(
      {
        spec: codexSpec,
        prompt: "edit files",
        cwd: "/tmp/fixture-repo",
        appendInstructions: "Persona instructions",
        factory,
      },
      undefined,
    )

    assert.equal(result.reply, "done\nCOMMIT: x")
    assert.equal(result.usage.inputTokens, 2)
    assert.equal(result.usage.cachedInputTokens, 1)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].threadOptions.model, "gpt-5.4")
    assert.equal(calls[0].threadOptions.workingDirectory, "/tmp/fixture-repo")
    assert.equal(calls[0].threadOptions.sandboxMode, "workspace-write")
    assert.equal(calls[0].threadOptions.networkAccessEnabled, false)
    assert.equal(calls[0].threadOptions.approvalPolicy, "never")
    assert.equal(calls[0].threadOptions.webSearchMode, "disabled")
    assert.equal(calls[0].threadOptions.additionalDirectories, undefined)
    assert.notEqual(calls[0].threadOptions.skipGitRepoCheck, true)
    assert.match(calls[0].promptInput, /fixture repository coding/)
    assert.match(calls[0].promptInput, /one-shot Codex patch engine/)
    assert.match(calls[0].promptInput, /current project\s+file list/)
    assert.match(calls[0].promptInput, /target file content/)
    assert.match(calls[0].promptInput, /do not call MCP discovery/)
    assert.match(calls[0].promptInput, /Persona instructions/)
    assert.match(calls[0].promptInput, /edit files/)
  })

  it("records command, file change, assistant, error, and usage trace events", async () => {
    process.env[CODEX] = "k"
    const trace: string[] = []
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
          item: { id: "err", type: "error", message: "non-fatal" },
        },
        {
          type: "item.completed",
          item: { id: "msg", type: "agent_message", text: "ok\nCOMMIT: x" },
        },
        {
          type: "turn.completed",
          usage: {
            input_tokens: 1,
            cached_input_tokens: 0,
            output_tokens: 1,
            reasoning_output_tokens: 0,
          },
        },
      ],
    })

    await runCodexFixtureCoder(
      {
        spec: codexSpec,
        prompt: "edit files",
        cwd: "/tmp/fixture-repo",
        trace: (text) => trace.push(text),
        factory,
      },
      undefined,
    )

    const joined = trace.join("\n")
    assert.match(joined, /Command Started/)
    assert.match(joined, /File Change Completed/)
    assert.match(joined, /Assistant/)
    assert.match(joined, /Error/)
    assert.match(joined, /Usage/)
  })

  it("allows quoted regex metacharacters in read-only rg inspection", async () => {
    process.env[CODEX] = "k"
    const { factory } = createFakeCodex({
      events: [
        {
          type: "item.started",
          item: {
            id: "cmd",
            type: "command_execution",
            command:
              "/bin/zsh -lc 'rg -n \"count_byte_frequencies|frequency|frequencies\" .'",
            aggregated_output: "",
            status: "in_progress",
          },
        },
        {
          type: "item.completed",
          item: { id: "msg", type: "agent_message", text: "ok\nCOMMIT: -" },
        },
        {
          type: "turn.completed",
          usage: {
            input_tokens: 1,
            cached_input_tokens: 0,
            output_tokens: 1,
            reasoning_output_tokens: 0,
          },
        },
      ],
    })

    const result = await runCodexFixtureCoder(
      {
        spec: codexSpec,
        prompt: "inspect files",
        cwd: "/tmp/fixture-repo",
        factory,
      },
      undefined,
    )

    assert.equal(result.reply, "ok\nCOMMIT: -")
  })

  it("counts started and completed events for the same reasoning item once", async () => {
    process.env[CODEX] = "k"
    const { factory } = createFakeCodex({
      events: [
        {
          type: "item.started",
          item: { id: "reasoning", type: "reasoning", text: "" },
        },
        {
          type: "item.completed",
          item: { id: "reasoning", type: "reasoning", text: "done" },
        },
        {
          type: "item.completed",
          item: { id: "msg", type: "agent_message", text: "ok\nCOMMIT: -" },
        },
        {
          type: "turn.completed",
          usage: {
            input_tokens: 1,
            cached_input_tokens: 0,
            output_tokens: 1,
            reasoning_output_tokens: 0,
          },
        },
      ],
    })

    const result = await runCodexFixtureCoder(
      {
        spec: codexSpec,
        prompt: "inspect files",
        cwd: "/tmp/fixture-repo",
        factory,
        limits: {
          maxReasoningItems: 1,
        },
      },
      undefined,
    )

    assert.equal(result.reply, "ok\nCOMMIT: -")
  })

  it("does not fail fixture rounds on assistant progress messages", async () => {
    process.env[CODEX] = "k"
    const { factory } = createFakeCodex({
      events: [
        ...Array.from({ length: 8 }, (_, index) => ({
          type: "item.completed" as const,
          item: {
            id: `msg-${index}`,
            type: "agent_message" as const,
            text: `progress ${index}`,
          },
        })),
        {
          type: "item.completed",
          item: { id: "final", type: "agent_message", text: "ok\nCOMMIT: -" },
        },
        {
          type: "turn.completed",
          usage: {
            input_tokens: 1,
            cached_input_tokens: 0,
            output_tokens: 1,
            reasoning_output_tokens: 0,
          },
        },
      ],
    })

    const result = await runCodexFixtureCoder(
      {
        spec: codexSpec,
        prompt: "inspect files",
        cwd: "/tmp/fixture-repo",
        factory,
      },
      undefined,
    )

    assert.equal(result.reply, "ok\nCOMMIT: -")
  })

  it("rejects MCP discovery instead of letting Codex spend a round on tool probing", async () => {
    process.env[CODEX] = "k"
    const { factory } = createFakeCodex({
      events: [
        {
          type: "item.started",
          item: {
            id: "mcp",
            type: "mcp_tool_call",
            server: "codex",
            tool: "list_mcp_resources",
            arguments: {},
            status: "in_progress",
          },
        },
      ],
    })

    await assert.rejects(
      () =>
        runCodexFixtureCoder(
          {
            spec: codexSpec,
            prompt: "edit files",
            cwd: "/tmp/fixture-repo",
            factory,
          },
          undefined,
        ),
      (err: unknown) =>
        err instanceof LlmError &&
        err.kind === "guardrail" &&
        err.context.provider === "codex" &&
        /MCP tool calls exceeded 0/.test(err.message),
    )
  })

  it("rejects unsafe shell commands in fixture coder turns", async () => {
    process.env[CODEX] = "k"
    const { factory } = createFakeCodex({
      events: [
        {
          type: "item.started",
          item: {
            id: "cmd",
            type: "command_execution",
            command: "python -m pytest",
            aggregated_output: "",
            status: "in_progress",
          },
        },
      ],
    })

    await assert.rejects(
      () =>
        runCodexFixtureCoder(
          {
            spec: codexSpec,
            prompt: "edit files",
            cwd: "/tmp/fixture-repo",
            factory,
          },
          undefined,
        ),
      (err: unknown) =>
        err instanceof LlmError &&
        err.kind === "guardrail" &&
        /read-only inspection commands/.test(err.message),
    )
  })

  it("rejects real shell operators outside quoted read-only command arguments", async () => {
    process.env[CODEX] = "k"
    const { factory } = createFakeCodex({
      events: [
        {
          type: "item.started",
          item: {
            id: "cmd",
            type: "command_execution",
            command: "rg -n safe . | head",
            aggregated_output: "",
            status: "in_progress",
          },
        },
      ],
    })

    await assert.rejects(
      () =>
        runCodexFixtureCoder(
          {
            spec: codexSpec,
            prompt: "edit files",
            cwd: "/tmp/fixture-repo",
            factory,
          },
          undefined,
        ),
      (err: unknown) =>
        err instanceof LlmError &&
        err.kind === "guardrail" &&
        /read-only inspection commands/.test(err.message),
    )
  })

  it("caps repeated read-only command inspection", async () => {
    process.env[CODEX] = "k"
    const { factory } = createFakeCodex({
      events: Array.from(
        { length: DEFAULT_CODEX_FIXTURE_CODER_LIMITS.maxReadOnlyCommands + 1 },
        (_, index) => ({
          type: "item.started" as const,
          item: {
            id: `cmd-${index}`,
            type: "command_execution" as const,
            command: "rg --files .",
            aggregated_output: "",
            status: "in_progress" as const,
          },
        }),
      ),
    })

    const exceededMessage = new RegExp(
      `read-only commands exceeded ${DEFAULT_CODEX_FIXTURE_CODER_LIMITS.maxReadOnlyCommands}`,
    )

    await assert.rejects(
      () =>
        runCodexFixtureCoder(
          {
            spec: codexSpec,
            prompt: "edit files",
            cwd: "/tmp/fixture-repo",
            factory,
          },
          undefined,
        ),
      (err: unknown) =>
        err instanceof LlmError &&
        err.kind === "guardrail" &&
        exceededMessage.test(err.message),
    )
  })

  it("keeps custom read-only command limits strict", async () => {
    process.env[CODEX] = "k"
    const { factory } = createFakeCodex({
      events: Array.from({ length: 7 }, (_, index) => ({
        type: "item.started" as const,
        item: {
          id: `cmd-${index}`,
          type: "command_execution" as const,
          command: "rg --files .",
          aggregated_output: "",
          status: "in_progress" as const,
        },
      })),
    })

    await assert.rejects(
      () =>
        runCodexFixtureCoder(
          {
            spec: codexSpec,
            prompt: "edit files",
            cwd: "/tmp/fixture-repo",
            factory,
            limits: {
              maxReadOnlyCommands: 6,
            },
          },
          undefined,
        ),
      (err: unknown) =>
        err instanceof LlmError &&
        err.kind === "guardrail" &&
        /read-only commands exceeded 6/.test(err.message),
    )
  })

  it("caps repeated file-change batches", async () => {
    process.env[CODEX] = "k"
    const { factory } = createFakeCodex({
      events: Array.from({ length: 5 }, (_, index) => ({
        type: "item.completed" as const,
        item: {
          id: `patch-${index}`,
          type: "file_change" as const,
          status: "completed" as const,
          changes: [{ path: `file-${index}.py`, kind: "update" as const }],
        },
      })),
    })

    await assert.rejects(
      () =>
        runCodexFixtureCoder(
          {
            spec: codexSpec,
            prompt: "edit files",
            cwd: "/tmp/fixture-repo",
            factory,
          },
          undefined,
        ),
      (err: unknown) =>
        err instanceof LlmError &&
        err.kind === "guardrail" &&
        /file-change batches exceeded 4/.test(err.message),
    )
  })

  it("reports fixture-coder elapsed timeout as a guardrail", async () => {
    process.env[CODEX] = "k"
    const { factory } = createFakeCodex({
      delayBeforeEventsMs: 20,
      events: [
        {
          type: "item.completed",
          item: { id: "msg", type: "agent_message", text: "ok\nCOMMIT: -" },
        },
      ],
    })

    await assert.rejects(
      () =>
        runCodexFixtureCoder(
          {
            spec: codexSpec,
            prompt: "edit files",
            cwd: "/tmp/fixture-repo",
            factory,
            limits: {
              maxElapsedMs: 1,
            },
          },
          undefined,
        ),
      (err: unknown) =>
        err instanceof LlmError &&
        err.kind === "guardrail" &&
        err.context.provider === "codex" &&
        err.context.authMode === "api" &&
        /elapsed time exceeded 1ms/.test(err.message),
    )
  })
})
