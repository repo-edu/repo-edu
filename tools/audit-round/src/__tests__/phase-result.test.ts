import assert from "node:assert/strict"
import { test } from "node:test"
import { split } from "shellwords"
import { decodeClaude } from "../claude.js"
import { decodeCodex } from "../codex.js"
import { phaseResult } from "../phase-result.js"
import { phasePrompt, recoveryCommand } from "../requests.js"

for (const phase of ["audit", "vet", "rebut", "fix", "brief"] as const) {
  test(`${phase} accepts only the shared workflow's result shapes`, () => {
    const file = phase === "fix" ? null : "/written report.md"
    const text = (value: unknown) =>
      `Full assistant response\nPHASE RESULT: ${JSON.stringify(value)}`
    for (const ending of ["", "\n", "\r\n", " \t\n\n"]) {
      assert.equal(
        phaseResult(
          phase,
          "session",
          text({ status: "finished", file, reason: null }) + ending,
          null,
        ).status,
        "finished",
      )
    }
    assert.deepEqual(
      phaseResult(
        phase,
        "session",
        text({
          status: "failed",
          file: null,
          reason: "Required work remains blocked",
        }),
        { tokens: 10, window: 100 },
      ),
      {
        status: "failed",
        sessionId: "session",
        reason: "Required work remains blocked",
      },
    )
    const ruling = () =>
      phaseResult(
        phase,
        "session",
        text({ status: "needs-ruling", file: null, reason: null }),
        null,
      )
    if (phase === "fix") assert.equal(ruling().status, "needs-ruling")
    else assert.throws(ruling)
    for (const value of [
      { status: "retry", file: null, reason: null },
      { status: "finished", file, reason: null, extra: true },
      { status: "finished", file },
      { status: "finished", file: "relative.md", reason: null },
      { status: "finished", file, reason: "unexpected" },
      { status: "failed", file: null, reason: " " },
      { status: "failed", file: "/file.md", reason: "blocked" },
    ])
      assert.throws(() => phaseResult(phase, "session", text(value), null))
    for (const invalid of [
      "No result",
      "PHASE RESULT: {broken",
      `${text({ status: "finished", file, reason: null })}\nExtra text`,
      `${text({ status: "finished", file, reason: null })}\n\`\`\``,
    ]) {
      assert.throws(() => phaseResult(phase, "session", invalid, null))
    }
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
    cwd: "/repo",
    ownerRoot: "/repo",
    sessionId: null,
    arguments: [plan, "2-3"],
  })
  assert.ok(
    prompt.includes(
      `Phase arguments (JSON array): ${JSON.stringify([plan, "2-3"])}`,
    ),
  )
  const sessionId = "session; $(touch forbidden) '"
  assert.deepEqual(
    split(recoveryCommand({ assistant: "codex", sessionId, cwd: "/repo" })),
    ["codex", "resume", "--approve-for-me", sessionId],
  )
})
