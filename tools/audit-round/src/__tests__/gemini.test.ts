import assert from "node:assert/strict"
import { test } from "node:test"
import { assistantExecutables, cliCommand } from "../cli-process.js"
import { decodeGemini } from "../gemini.js"
import { toolInputText } from "../output-format.js"
import { unopenedSources } from "../ruler-report.js"

function step(step_type: string, update: Record<string, unknown>) {
  return decodeGemini({
    event: "step_update",
    step_update: { step_type, ...update },
  })
}

function result(payload: Record<string, unknown>) {
  return decodeGemini({ event: "result", result: payload })
}

test("the executable table names agy and the runtime can override a command", () => {
  assert.equal(assistantExecutables.gemini, "agy")
  assert.deepEqual(cliCommand({ cwd: "." }, "codex", ["--version"]), {
    file: "codex",
    args: ["--version"],
  })
  const runtime = {
    cwd: ".",
    executables: { codex: { file: "fixture", args: ["codex"] } },
  }
  assert.deepEqual(cliCommand(runtime, "codex", ["--version"]), {
    file: "fixture",
    args: ["codex", "--version"],
  })
})

test("Gemini reports the conversation and separates only a trailing effort", () => {
  const model = "gemini-4-neon"
  for (const effort of [null, "low", "medium", "high", "xhigh", "max"]) {
    const pinned = effort === null ? model : `${model}-${effort}`
    assert.deepEqual(
      decodeGemini({
        event: "init",
        conversation_id: "session",
        init: { model: pinned },
      }),
      [
        { type: "session", sessionId: "session" },
        { type: "model", selection: { model, effort } },
      ],
    )
  }
})

test("Gemini shows prose and keeps context readings for hidden schema attempts", () => {
  const usage = { input_tokens: 120, cache_read_tokens: 80, output_tokens: 7 }
  const context = { type: "context", tokens: 200, window: null }
  for (const text_delta of ['  {"status":"retry"}\n', "{}", ""]) {
    assert.deepEqual(step("agent_response", { text_delta, usage }), [context])
  }
  for (const text of ["Reading the plan.", "{in prose}", '["item"]', "null"]) {
    assert.deepEqual(step("agent_response", { text_delta: text }), [
      { type: "text", text },
    ])
  }
  assert.deepEqual(step("agent_response", { usage, text_delta: "Ready." }), [
    context,
    { type: "text", text: "Ready." },
  ])
})

test("Gemini logs a tool invocation once and keeps its result details", () => {
  const parameters = { CommandLine: "/bin/zsh -lc 'git show abc123'" }
  const tool = { tool_name: "run_command", tool_info: { parameters } }
  const started = step("tool", { state: "ACTIVE", ...tool })
  assert.deepEqual(started, [
    {
      type: "tool",
      stage: "started",
      invocation: "run_command git show abc123",
      detail: parameters,
    },
  ])
  for (const state of ["DONE", "ERROR"]) {
    const tool_info = { parameters, output: "/repo/output-only.md" }
    assert.deepEqual(step("tool", { ...tool, state, tool_info }), [
      {
        type: "tool",
        stage: "completed",
        invocation: null,
        detail: tool_info,
      },
    ])
  }
})

test("Gemini tool fields give readable commands, paths and search terms", () => {
  assert.equal(
    toolInputText({ CommandLine: "zsh -c 'git status'" }),
    "git status",
  )
  for (const key of [
    "AbsolutePath",
    "TargetFile",
    "Path",
    "DirectoryPath",
    "SearchPath",
    "SearchDirectory",
    "Query",
    "Pattern",
  ]) {
    assert.equal(toolInputText({ [key]: "value" }), "value")
  }
})

test("the reading check sees Gemini tool inputs and ignores schema delivery", () => {
  const path = "/repo/plan.md"
  const unopened = "/repo/other.md"
  const events = [
    ...step("tool", {
      state: "ACTIVE",
      tool_name: "view_file",
      tool_info: { parameters: { AbsolutePath: path } },
    }),
    ...step("tool", {
      state: "ACTIVE",
      tool_name: "run_command",
      tool_info: { parameters: { CommandLine: "git show abc123" } },
    }),
    ...step("tool", { state: "DONE", tool_info: { output: unopened } }),
    ...step("finish", {
      state: "ERROR",
      tool_info: { parameters: { Path: unopened } },
    }),
  ]
  const lines = events.flatMap((event) =>
    event.type === "tool" && event.invocation !== null
      ? [event.invocation]
      : [],
  )
  assert.deepEqual(unopenedSources([path, "abc123", unopened], lines, []), [
    unopened,
  ])
})

test("Gemini reports cumulative usage and delivers the final structured result", () => {
  const usage = {
    input_tokens: 60440,
    cache_read_tokens: 145236,
    output_tokens: 1309,
  }
  const tokens = {
    type: "tokens",
    update: {
      kind: "selected-model",
      tokens: { input: 205676, cached: 145236, output: 1309 },
    },
  }
  const structured_output = { status: "finished" }
  const response = '{"retry":true}{"status":"finished"}'
  for (const ending of [
    { response, structured_output },
    { structured_output },
    { response },
  ]) {
    assert.deepEqual(result({ status: "SUCCESS", usage, ...ending }), [
      tokens,
      {
        type: "final",
        text: ending.response,
        structuredOutput: ending.structured_output,
      },
      { type: "complete" },
    ])
  }
})

test("Gemini surfaces failures and refuses incomplete success records", () => {
  assert.throws(
    () => result({ status: "ERROR", error: "Model stopped" }),
    /Model stopped/,
  )
  assert.throws(() => result({ status: "CANCELLED" }), /CANCELLED/)
  assert.throws(() => result({ status: "SUCCESS", response: "done" }))
  assert.throws(
    () =>
      result({
        status: "SUCCESS",
        usage: { input_tokens: 0, cache_read_tokens: 0, output_tokens: 0 },
      }),
    /without a response/,
  )
})

test("Gemini ignores finish steps and unrecognised events and step types", () => {
  assert.deepEqual(step("finish", { state: "DONE" }), [])
  assert.deepEqual(step("checkpoint", {}), [])
  assert.deepEqual(decodeGemini({ event: "other" }), [])
})
