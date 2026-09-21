import assert from "node:assert/strict"
import { test } from "node:test"
import { split } from "shellwords"
import { decodeClaude } from "../claude.js"
import { decodeCodex } from "../codex.js"
import { unpinned } from "../phase.js"
import { phaseResult } from "../phase-result.js"
import { phasePrompt, recoveryCommand } from "../requests.js"
import { testContext } from "./helpers.js"

for (const phase of [
  "audit",
  "vet",
  "rebut",
  "fix",
  "brief",
  "rule",
  "rule-edit",
  "watch",
  "watch-edit",
] as const) {
  test(`${phase} accepts only the shared workflow's result shapes`, () => {
    const file = phase === "fix" ? null : "/written report.md"
    const finished = { status: "finished", file, reason: null }
    const text = (value: unknown) =>
      `Full assistant response\nPHASE RESULT: ${JSON.stringify(value)}`
    for (const ending of ["", "\n", "\r\n", " \t\n\n"])
      assert.deepEqual(
        phaseResult(phase, "session", text(finished) + ending, {
          tokens: 10,
          window: 100,
        }),
        phase === "fix"
          ? { status: "finished", sessionId: "session" }
          : {
              status: "finished",
              sessionId: "session",
              file,
              context: { tokens: 10, window: 100 },
            },
      )
    assert.deepEqual(
      phaseResult(
        phase,
        "session",
        text({ status: "failed", file: null, reason: "Blocked" }),
        null,
      ),
      { status: "failed", sessionId: "session", reason: "Blocked" },
    )
    const ruling = () =>
      phaseResult(
        phase,
        "session",
        text({ status: "needs-ruling", file: null, reason: null }),
        null,
      )
    if (phase === "fix")
      assert.deepEqual(ruling(), {
        status: "needs-ruling",
        sessionId: "session",
      })
    else assert.throws(ruling)
    for (const value of [
      { ...finished, status: "retry" },
      { ...finished, tier: null },
      { ...finished, clean: false },
      { ...finished, accepted: true },
      { ...finished, extra: true },
      { status: "finished", file },
      { status: "finished", reason: null },
      { ...finished, file: phase === "fix" ? "/file.md" : null },
      { ...finished, file: "relative.md" },
      { ...finished, reason: "unexpected" },
      { status: "failed", file: null, reason: " " },
      { status: "failed", file: "/file.md", reason: "blocked" },
    ])
      assert.throws(() => phaseResult(phase, "session", text(value), null))
    for (const invalid of [
      "No result",
      "PHASE RESULT: {broken",
      `${text(finished)}\nExtra text`,
      `${text(finished)}\n\`\`\``,
    ])
      assert.throws(() => phaseResult(phase, "session", invalid, null))
  })
}

test("unrelated events are ignored while malformed consumed fields fail", () => {
  for (const decode of [decodeClaude, decodeCodex])
    assert.deepEqual(decode({ type: "unrelated-event", data: null }), [])
  assert.throws(() =>
    decodeClaude({
      type: "assistant",
      message: { content: [], usage: { input_tokens: -1 } },
    }),
  )
  assert.throws(() =>
    decodeClaude({ type: "result", is_error: false, subtype: "success" }),
  )
  assert.throws(() =>
    decodeCodex({
      type: "item.started",
      item: { type: "command_execution", command: 42 },
    }),
  )
  assert.deepEqual(
    decodeClaude({
      type: "result",
      parent_tool_use_id: "child",
      is_error: false,
    }),
    [],
  )
})

test("Codex completion does not depend on unused usage fields", () => {
  for (const record of [
    { type: "turn.completed" },
    { type: "turn.completed", usage: { input_tokens: "100" } },
  ])
    assert.deepEqual(decodeCodex(record), [{ type: "complete" }])
})

test("phase arguments and recovery identifiers stay data across spaces and shell syntax", () => {
  const plan = '../plan/a "quoted" plan; $(touch forbidden).md'
  const prompt = phasePrompt({
    phase: "audit",
    assistant: "codex",
    model: unpinned,
    ...testContext("/repo"),
    ownerRoot: "/repo",
    sessionId: null,
    arguments: ["example-steps-2-3-01", plan, "2-3"],
  })
  assert.ok(
    prompt.includes(
      `Phase arguments (JSON array): ${JSON.stringify(["example-steps-2-3-01", plan, "2-3"])}`,
    ),
  )
  const sessionId = "session; $(touch forbidden) '"
  assert.deepEqual(
    split(
      recoveryCommand({
        assistant: "codex",
        model: unpinned,
        sessionId,
        ...testContext("/repo"),
      }),
    ),
    ["cd", "/repo", "&&", "codex", "resume", "--approve-for-me", sessionId],
  )
  // A seat that named its model resumes on it, so the user continues the round's own run.
  assert.deepEqual(
    split(
      recoveryCommand({
        assistant: "codex",
        model: {
          model: { value: "gpt-6-astra", source: "--strength" },
          effort: { value: "xhigh", source: "--effort" },
        },
        sessionId: "audit-session",
        ...testContext("/repo"),
      }),
    ),
    [
      "cd",
      "/repo",
      "&&",
      "codex",
      "-m",
      "gpt-6-astra",
      "-c",
      "model_reasoning_effort=xhigh",
      "resume",
      "--approve-for-me",
      "audit-session",
    ],
  )
  assert.deepEqual(
    split(
      recoveryCommand({
        assistant: "claude",
        model: {
          model: { value: "fable", source: "--strength" },
          effort: null,
        },
        sessionId: "audit-session",
        ...testContext("/repo"),
      }),
    ).slice(3, 8),
    ["claude", "--resume", "audit-session", "--model", "fable"],
  )
})
