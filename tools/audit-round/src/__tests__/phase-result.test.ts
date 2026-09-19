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
  "revise",
  "glance",
  "watch",
] as const) {
  test(`${phase} accepts only the shared workflow's result shapes`, () => {
    // A fix reports its grade and a glance its decision; the rest report a file.
    const file =
      phase === "fix" || phase === "glance" ? null : "/written report.md"
    const due = phase === "glance" ? false : null
    const text = (value: unknown) =>
      `Full assistant response\nPHASE RESULT: ${JSON.stringify(value)}`
    for (const ending of ["", "\n", "\r\n", " \t\n\n"]) {
      assert.equal(
        phaseResult(
          phase,
          "session",
          text({ status: "finished", file, reason: null, tier: null, due }) +
            ending,
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
          tier: null,
          due: null,
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
        text({
          status: "needs-ruling",
          file: null,
          reason: null,
          tier: null,
          due: null,
        }),
        null,
      )
    if (phase === "fix") assert.equal(ruling().status, "needs-ruling")
    else assert.throws(ruling)
    // Only a finished fix grades the round, and its tier reaches the chain rule.
    const graded = () =>
      phaseResult(
        phase,
        "session",
        text({ status: "finished", file, reason: null, tier: "b", due }),
        null,
      )
    if (phase === "fix")
      assert.deepEqual(graded(), {
        status: "finished",
        sessionId: "session",
        tier: "b",
      })
    else assert.throws(graded)
    // Only a finished glance decides, and it must decide rather than omit one.
    const decided = () =>
      phaseResult(
        phase,
        "session",
        text({ status: "finished", file, reason: null, tier: null, due: true }),
        null,
      )
    if (phase === "glance")
      assert.deepEqual(decided(), {
        status: "finished",
        sessionId: "session",
        due: true,
      })
    else assert.throws(decided)
    assert.throws(() =>
      phaseResult(
        phase,
        "session",
        text({
          status: "finished",
          file,
          reason: null,
          tier: null,
          due: phase === "glance" ? null : false,
        }),
        null,
      ),
    )
    for (const value of [
      { status: "retry", file: null, reason: null, tier: null, due },
      { status: "finished", file, reason: null, tier: null, due, extra: true },
      { status: "finished", file, reason: null, due },
      { status: "finished", file, tier: null, due },
      { status: "finished", file, reason: null, tier: null },
      {
        status: "finished",
        file: "relative.md",
        reason: null,
        tier: null,
        due,
      },
      { status: "finished", file, reason: "unexpected", tier: null, due },
      { status: "failed", file: null, reason: " ", tier: null, due: null },
      {
        status: "failed",
        file: "/file.md",
        reason: "blocked",
        tier: null,
        due: null,
      },
      {
        status: "failed",
        file: null,
        reason: "blocked",
        tier: "a",
        due: null,
      },
      {
        status: "needs-ruling",
        file: null,
        reason: null,
        tier: "c",
        due: null,
      },
      { status: "finished", file, reason: null, tier: "A", due },
      { status: "finished", file, reason: null, tier: "e", due },
    ])
      assert.throws(() => phaseResult(phase, "session", text(value), null))
    for (const invalid of [
      "No result",
      "PHASE RESULT: {broken",
      `${text({ status: "finished", file, reason: null, tier: null, due })}\nExtra text`,
      `${text({ status: "finished", file, reason: null, tier: null, due })}\n\`\`\``,
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
