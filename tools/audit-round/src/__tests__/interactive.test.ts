import assert from "node:assert/strict"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { assistantDependencies } from "../assistant.js"
import { decodeCodexSessionFeedback } from "../codex-session-feedback.js"
import { recordInteractiveSession } from "../interactive.js"
import { RoundOutput, roundRun } from "../output.js"
import { fixture } from "./helpers.js"

const jsonl = (...records: unknown[]) =>
  `${records.map((record) => JSON.stringify(record)).join("\n")}\n`
const message = (role: "AgentMessage" | "UserMessage", text: string) => ({
  type: "event_msg",
  payload: {
    type: "item_completed",
    item: {
      type: role,
      content: [{ type: role === "AgentMessage" ? "Text" : "text", text }],
    },
  },
})
const context = (tokens: number) => ({
  type: "event_msg",
  payload: {
    type: "token_count",
    info: {
      last_token_usage: { input_tokens: tokens },
      model_context_window: 100_000,
    },
  },
})

test("interactive recording stays live, excludes prior records and drains the final append without touching the terminal", {
  timeout: 10_000,
}, async (t) => {
  const f = await fixture(t)
  const path = join(f.root, "rollout-fix-session.jsonl")
  const acknowledged = join(f.root, "recorded")
  await writeFile(path, "old records must never be parsed or replayed\n")
  const tool = {
    type: "response_item",
    payload: {
      type: "function_call",
      name: "functions.exec_command",
      arguments: JSON.stringify({ cmd: "/bin/zsh -lc 'printf resumed'" }),
    },
  }
  await f.configure({
    interactive: {
      usage: {
        path,
        text: jsonl(
          {
            type: "turn_context",
            payload: { model: "resumed-model", effort: "high" },
          },
          context(12_000),
          message("UserMessage", "Apply the résumé ruling."),
          tool,
          {
            type: "response_item",
            payload: {
              type: "function_call_output",
              output: "omitted tool result",
            },
          },
          {
            type: "event_msg",
            payload: {
              type: "item_completed",
              item: {
                type: "CommandExecution",
                command: ["printf", "resumed"],
              },
            },
          },
          context(14_000),
          message("AgentMessage", "The resumed work is being recorded."),
        ),
      },
      chunkSize: 19,
      waitForFile: acknowledged,
      finalText: jsonl(
        context(15_000),
        message("AgentMessage", "The final append is recorded."),
      ),
    },
  })
  const terminal: string[] = []
  let now = 0
  const output = new RoundOutput(
    roundRun({ repoRoot: f.root, plan: "example.md" }, now),
    {
      now: () => now,
      verbose: true,
      terminal: {
        write: (text) => {
          terminal.push(text)
        },
        status: (text) => {
          terminal.push(text)
        },
        clear: () => {
          terminal.push("clear")
        },
      },
    },
  )
  t.after(() => output.close())
  // The brief may have run after the fix. The continuation still belongs to the fix.
  await output.phase.start(
    {
      phase: "brief",
      assistant: "claude",
      cwd: f.root,
      ownerRoot: f.root,
      arguments: ["/transcript.md"],
      sessionId: null,
    },
    "brief prompt",
  )
  now = 10_000
  const session = {
    assistant: "codex",
    sessionId: "fix-session",
    cwd: f.root,
  } as const
  const dependencies = assistantDependencies(
    f.runtime,
    output.phase,
    output.prepareHandover,
    async (event) => {
      now += 1000
      await output.interactive(event)
      if (
        event.type === "text" &&
        event.text === "The resumed work is being recorded."
      ) {
        const markdown = await readFile(output.paths.markdown as string, "utf8")
        assert.match(markdown, /Apply the résumé ruling/)
        assert.match(markdown, /The resumed work is being recorded/)
        await writeFile(
          acknowledged,
          "The files were written before the child exited",
        )
      }
    },
  )
  await dependencies.prepareHandover(session)
  const terminalBefore = terminal.slice()
  await dependencies.openSession(session)
  assert.deepEqual(terminal, terminalBefore)
  const log = await readFile(output.paths.log, "utf8")
  const markdown = await readFile(output.paths.markdown as string, "utf8")
  assert.match(markdown, /## fix \(codex, interactive\)/)
  assert.match(markdown, /### User\n\nApply the résumé ruling/)
  assert.match(markdown, /### Assistant\n\nThe final append is recorded/)
  assert.match(log, /\[fix\].*total.*context.*15k.*15%/)
  assert.equal(log.split("printf resumed").length - 1, 1)
  assert.doesNotMatch(log + markdown, /omitted tool result|old records/)
  assert.doesNotMatch(log, /The final append/)
  output.finish({ status: "handed-over", report: "/AUDIT.md", session })
  assert.match(terminal.at(-1) as string, /workflow completion is not inferred/)
})

for (const failure of [
  "writer",
  "malformed",
  "incomplete",
  "cancelled",
  "process",
] as const) {
  test(`interactive ${failure} failure retains no running child`, {
    timeout: 10_000,
  }, async (t) => {
    const f = await fixture(t)
    const path = join(f.root, "rollout-fix-session.jsonl")
    await writeFile(path, "prior invocation\n")
    await f.configure({
      interactive: {
        usage: {
          path,
          text:
            failure === "malformed"
              ? "invalid JSON\n"
              : failure === "incomplete"
                ? '{"type":'
                : jsonl(message("AgentMessage", "resumed")),
        },
        wait: ["writer", "malformed", "cancelled"].includes(failure),
        exitCode: failure === "process" ? 7 : 0,
      },
    })
    const cancelled = new AbortController()
    await assert.rejects(
      recordInteractiveSession(
        { assistant: "codex", sessionId: "fix-session", cwd: f.root },
        { ...f.runtime, signal: cancelled.signal },
        async () => {
          if (failure === "writer")
            throw new Error("Required record write failed")
          if (failure === "cancelled") cancelled.abort()
        },
      ),
      {
        writer: /Required record write failed/,
        malformed: /JSON/,
        incomplete: /Incomplete Codex session record/,
        cancelled: /abort|cancel/i,
        process: /exit code 7/,
      }[failure],
    )
    const [call] = await f.calls()
    assert.throws(() => process.kill(call.pid, 0), { code: "ESRCH" })
  })
}

test("a missing session file prevents an unrecorded interactive launch", async (t) => {
  const f = await fixture(t)
  await assert.rejects(
    recordInteractiveSession(
      { assistant: "codex", sessionId: "missing", cwd: f.root },
      f.runtime,
      async () => {},
    ),
    /Cannot locate resumed Codex session/,
  )
  await assert.rejects(f.calls(), { code: "ENOENT" })
})

test("session decoding records arbitrary tool invocations once without responses or private reasoning", () => {
  for (const type of [
    "function_call_output",
    "custom_tool_call_output",
    "reasoning",
    "message",
  ])
    assert.deepEqual(
      decodeCodexSessionFeedback({ type: "response_item", payload: { type } }),
      [],
    )
  assert.deepEqual(
    decodeCodexSessionFeedback({
      type: "event_msg",
      payload: { type: "task_complete" },
    }),
    [],
  )
  assert.deepEqual(
    decodeCodexSessionFeedback({
      type: "response_item",
      payload: {
        type: "function_call",
        name: "mcp.search",
        arguments: '{"query":"ruling"}',
      },
    }),
    [
      {
        type: "tool",
        invocation: 'mcp.search {"query":"ruling"}',
        detail: null,
        stage: "started",
      },
    ],
  )
  assert.deepEqual(
    decodeCodexSessionFeedback({
      type: "response_item",
      payload: {
        type: "custom_tool_call",
        name: "functions.apply_patch",
        input: "patch text",
      },
    }),
    [
      {
        type: "tool",
        invocation: "functions.apply_patch patch text",
        detail: null,
        stage: "started",
      },
    ],
  )
  for (const item of [
    { type: "function_call", name: "tool", arguments: "invalid JSON" },
    { type: "custom_tool_call", name: "tool", input: null },
  ])
    assert.throws(() =>
      decodeCodexSessionFeedback({ type: "response_item", payload: item }),
    )
})

test("built-in tool records retain their invocation without generated results", () => {
  for (const [payload, invocation] of [
    [
      {
        type: "local_shell_call",
        action: { command: ["/bin/zsh", "-lc", "printf builtin"] },
      },
      "printf builtin",
    ],
    [
      { type: "web_search_call", action: { type: "search", query: "ruling" } },
      'web {"type":"search","query":"ruling"}',
    ],
    [{ type: "web_search_call", action: null }, "web"],
    [
      { type: "tool_search_call", arguments: { query: "search tools" } },
      'tool search {"query":"search tools"}',
    ],
    [
      {
        type: "image_generation_call",
        revised_prompt: "A diagram",
        result: "omitted image bytes",
      },
      "image generation A diagram",
    ],
    [
      {
        type: "function_call",
        name: "search",
        namespace: "mcp",
        arguments: "{}",
      },
      "mcp.search {}",
    ],
  ] as const) {
    assert.deepEqual(
      decodeCodexSessionFeedback({ type: "response_item", payload }),
      [{ type: "tool", invocation, detail: null, stage: "started" }],
    )
  }
})
