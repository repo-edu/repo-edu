import assert from "node:assert/strict"
import { readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { split } from "shellwords"
import { decodeClaude } from "../claude.js"
import { decodeCodex } from "../codex.js"
import type { PhaseInput } from "../phase.js"
import { structuredPhaseResult } from "../phase-result-schema.js"
import { phasePrompt, recoveryCommand } from "../requests.js"
import { pinned } from "./configured-runner.js"
import { finishedFix, finishedPhase, fixture, testContext } from "./helpers.js"

test("only a finished fix carries settling advice", () => {
  const settling = {
    recommendation: "keep open",
    reason: "Evidence is missing.",
  }
  assert.deepEqual(
    structuredPhaseResult("fix", "session", { ...finishedFix, settling }),
    {
      result: {
        status: "finished",
        sessionId: "session",
        settling: "keep open. Evidence is missing.",
      },
      text: "Résumé complete\n\nSettling: keep open. Evidence is missing.",
    },
  )
  assert.throws(
    () =>
      structuredPhaseResult("fix", "session", {
        ...finishedFix,
        status: "needs-ruling",
        settling,
      }),
    /Only a finished fix returns settling advice/,
  )
  assert.throws(() =>
    structuredPhaseResult("fix", "session", {
      ...finishedFix,
      settling: { ...settling, reason: "First line\nSecond line" },
    }),
  )
})

test("a fresh prompt supplies routed workflows and shared files once under their source paths", async (t) => {
  const f = await fixture(t)
  const context = testContext(f.root, "planning")
  const route = join(
    context.planRoot,
    ".agents/skills/rebut/references/workflow.md",
  )
  const target = join(f.root, ".agents/skills/rebut/references/workflow.md")
  const shared = join(f.root, "shared rules.md")
  const routing =
    "---\nreads:\n  - '../../../../../repo-edu/.agents/skills/rebut/references/workflow.md' # route\n---\n\nRouting rules\n"
  const routed =
    "---\r\nreads: ['../../../../shared rules.md', '../../../../shared rules.md']\r\n---\r\n\r\nRouted rules\r\n"
  await writeFile(route, routing)
  await writeFile(target, routed)
  await writeFile(shared, "Whole shared rules\n\nLast paragraph\n")
  const input: PhaseInput<"rebut"> = {
    ...context,
    phase: "rebut",
    findings: [],
    reviews: [],
    assistant: "codex",
    model: pinned("codex"),
    sessionId: null,
    arguments: ["audit.md", "vet.md", "rebut.md"],
  }
  const { text: prompt, log } = phasePrompt(input)
  for (const [path, content] of [
    [route, routing],
    [target, routed],
    [shared, "Whole shared rules\n\nLast paragraph\n"],
  ]) {
    assert.ok(prompt.includes(`Source file: ${path}\n\n${content}`))
    assert.equal(prompt.split(`Source file: ${path}\n`).length, 2)
    assert.ok(log.includes(`Source file: ${path} (contents omitted from log)`))
    assert.equal(log.split(`Source file: ${path} `).length, 2)
    assert.ok(!log.includes(content))
  }
  assert.ok(prompt.includes("Follow the supplied workflow below."))
  assert.doesNotMatch(prompt, /Source file: .*\/home\//)
  assert.doesNotMatch(prompt, /Source file: .*CLAUDE\.md/)
  await writeFile(route, "---\nreads: wrong-shape\n---\n")
  assert.throws(() => phasePrompt(input), /Invalid workflow header/)
})

test("fresh prompts supply the owning workflow while resumed fixes supply no files again", async (t) => {
  const f = await fixture(t)
  for (const roundKind of ["implementation", "planning"] as const) {
    for (const assistant of ["claude", "codex"] as const) {
      const context = testContext(f.root, roundKind)
      const input: PhaseInput<"fix"> = {
        ...context,
        phase: "fix",
        assistant,
        model: pinned(assistant),
        sessionId: null,
        arguments: ["audit.md", "vet.md"],
        rulingFile: join(context.cwd, "ruling.md"),
      }
      const { text: prompt } = phasePrompt(input)
      const workflow = join(
        context.cwd,
        ".agents/skills/fix/references/workflow.md",
      )
      assert.ok(prompt.includes(`Source file: ${workflow}`))
      assert.doesNotMatch(prompt, /Source file: .*\/home\//)
      assert.ok(
        prompt.includes(
          `Ruling output path (JSON string): ${JSON.stringify(input.rulingFile)}`,
        ),
      )
      const resumed = {
        ...input,
        sessionId: "fix-session",
        rulingReply: "Apply the correction.",
      }
      const { text: reply, log } = phasePrompt(resumed)
      assert.equal(log, reply)
      assert.match(reply, /Run the fix phase .* resumed session/)
      assert.ok(
        reply.includes(
          "Continue the supplied workflow in this resumed session.",
        ),
      )
      assert.doesNotMatch(reply, /Source file:|supplied phase instructions/)
      assert.ok(reply.endsWith("User reply:\nApply the correction."))
      const workflowContent = await readFile(workflow, "utf8")
      await rm(workflow)
      assert.equal(phasePrompt(resumed).text, reply)
      await writeFile(workflow, workflowContent)
    }
  }
})

test("implementation workers may request a ruling but close may not", () => {
  const result = { ...finishedPhase, status: "needs-ruling" }
  assert.deepEqual(
    structuredPhaseResult("implement", "worker-session", result).result,
    {
      status: "needs-ruling",
      sessionId: "worker-session",
    },
  )
  assert.throws(() => structuredPhaseResult("close", "session", result))
})

test("structured phases validate status and reason", () => {
  for (const phase of ["implement", "close"] as const) {
    assert.deepEqual(
      structuredPhaseResult(phase, "session", {
        ...finishedPhase,
        status: "failed",
        reason: "Blocked",
      }).result,
      { status: "failed", sessionId: "session", reason: "Blocked" },
    )
    for (const result of [
      { ...finishedPhase, status: "failed", reason: " " },
      { ...finishedPhase, reason: "Unexpected" },
      { status: "finished", reason: null },
    ])
      assert.throws(() => structuredPhaseResult(phase, "session", result))
  }
})

test("watch receives Repo Edu's workflow and joined evidence", async (t) => {
  const f = await fixture(t)
  const common = {
    ...testContext(f.root, "planning"),
    assistant: "codex" as const,
    model: pinned("codex"),
    sessionId: null,
  }
  const { text: writer } = phasePrompt({
    ...common,
    phase: "watch",
    arguments: [],
    evidence: "Joined episode facts",
  })
  assert.ok(
    writer.includes(
      `Source file: ${join(f.root, ".agents/skills/watch/references/workflow.md")}`,
    ),
  )
  assert.ok(writer.endsWith("Joined watch evidence:\nJoined episode facts"))
})

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

test("a Codex error event is a notice that becomes a diagnostic", () => {
  const message =
    "Reconnecting... 2/5 (Selected model is at capacity. Please try a different model.)"
  assert.deepEqual(decodeCodex({ type: "error", message }), [
    { type: "diagnostic", text: message },
  ])
})

test("Codex completion does not depend on unused usage fields", () => {
  for (const record of [
    { type: "turn.completed" },
    { type: "turn.completed", usage: { input_tokens: "100" } },
  ])
    assert.deepEqual(decodeCodex(record), [{ type: "complete" }])
})

test("phase arguments and recovery identifiers stay data across spaces and shell syntax", async (t) => {
  const f = await fixture(t)
  const plan = '../plan/a "quoted" plan; $(touch forbidden).md'
  const { text: prompt } = phasePrompt({
    phase: "audit",
    reportScope: { target: "example.md 2-3", planPhase: null, heads: [] },
    assistant: "codex",
    model: pinned("codex"),
    ...testContext(f.root),

    sessionId: null,
    arguments: ["example-impl-audit-02..03-01", plan, "2-3"],
  })
  assert.ok(
    prompt.includes(
      `Phase arguments (JSON array): ${JSON.stringify(["example-impl-audit-02..03-01", plan, "2-3"])}`,
    ),
  )
  const sessionId = "session; $(touch forbidden) '"
  assert.deepEqual(
    split(
      recoveryCommand({
        assistant: "codex",
        model: pinned("codex"),
        sessionId,
        ...testContext("/repo"),
      }),
    ),
    [
      "cd",
      "/repo",
      "&&",
      "codex",
      "-m",
      "gpt-5.6-sol",
      "-c",
      "model_reasoning_effort=high",
      "resume",
      "--approve-for-me",
      sessionId,
    ],
  )
  // A selection that named its model resumes on it, so the user continues the round's own run.
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
          effort: { value: "high", source: "--effort" },
        },
        sessionId: "audit-session",
        ...testContext("/repo"),
      }),
    ).slice(3, 10),
    [
      "claude",
      "--resume",
      "audit-session",
      "--model",
      "fable",
      "--effort",
      "high",
    ],
  )
})
