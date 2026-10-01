import assert from "node:assert/strict"
import { readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { split } from "shellwords"
import { decodeClaude } from "../claude.js"
import { decodeCodex } from "../codex.js"
import type { PhaseInput } from "../phase.js"
import { phaseResult } from "../phase-result.js"
import { phasePrompt, recoveryCommand } from "../requests.js"
import { unpinned } from "./configured-runner.js"
import { fixture, testContext } from "./helpers.js"

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
    assistant: "codex",
    model: unpinned,
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
  assert.ok(prompt.includes("Codex rebut launcher"))
  assert.doesNotMatch(log, /Codex rebut launcher/)
  assert.doesNotMatch(prompt, /Source file: .*CLAUDE\.md/)
  await writeFile(route, "---\nreads: wrong-shape\n---\n")
  assert.throws(() => phasePrompt(input), /Invalid workflow header/)
})

test("fresh prompts use the owning launcher while resumed fixes supply no files again", async (t) => {
  const f = await fixture(t)
  for (const roundKind of ["implementation", "planning"] as const) {
    for (const assistant of ["claude", "codex"] as const) {
      const context = testContext(f.root, roundKind)
      const input: PhaseInput<"fix"> = {
        ...context,
        phase: "fix",
        assistant,
        model: unpinned,
        sessionId: null,
        arguments: ["audit.md", "vet.md"],
        rulingFile: join(context.cwd, "ruling.md"),
      }
      const { text: prompt } = phasePrompt(input)
      const launcher = join(
        context.planRoot,
        assistant === "claude"
          ? "home/claude/commands/fix.md"
          : "home/agents/skills/fix/SKILL.md",
      )
      assert.ok(prompt.includes(`Source file: ${launcher}`))
      assert.ok(
        prompt.includes(
          `Source file: ${context.cwd}/.agents/skills/fix/references/workflow.md`,
        ),
      )
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
      assert.ok(reply.includes(`Read and follow this launcher: ${launcher}`))
      assert.doesNotMatch(reply, /Source file:|supplied phase instructions/)
      assert.ok(reply.endsWith("User reply:\nApply the correction."))
      const launcherContent = await readFile(launcher, "utf8")
      await rm(launcher)
      assert.equal(phasePrompt(resumed).text, reply)
      await writeFile(launcher, launcherContent)
    }
  }
})

test("watch and watch edit share Repo Edu's workflow while only the writer receives evidence", async (t) => {
  const f = await fixture(t)
  const common = {
    ...testContext(f.root, "planning"),
    assistant: "codex" as const,
    model: unpinned,
    sessionId: null,
  }
  const { text: writer } = phasePrompt({
    ...common,
    phase: "watch",
    arguments: ["watch.md", "cache"],
    evidence: "Joined episode facts",
  })
  const { text: editor } = phasePrompt({
    ...common,
    phase: "watch-edit",
    arguments: ["watch.md"],
  })
  for (const prompt of [writer, editor]) {
    assert.doesNotMatch(prompt, /launcher|SKILL\.md/)
    assert.ok(
      prompt.includes(
        `Source file: ${f.root}/.agents/skills/watch/references/workflow.md`,
      ),
    )
    assert.doesNotMatch(
      prompt,
      /Source file: .*watch-edit\/references\/workflow\.md/,
    )
  }
  assert.ok(writer.endsWith("Git episode evidence:\nJoined episode facts"))
  assert.doesNotMatch(editor, /Git episode evidence|Joined episode facts/)
})

for (const phase of [
  "audit",
  "vet",
  "rebut",
  "fix",
  "brief",
  "watch",
  "watch-edit",
] as const) {
  test(`${phase} accepts only the shared workflow's result shapes`, () => {
    const finished = { status: "finished", reason: null }
    const text = (value: unknown) =>
      `Full assistant response\nPHASE RESULT: ${JSON.stringify(value)}`
    for (const ending of ["", "\n", "\r\n", " \t\n\n"])
      assert.deepEqual(phaseResult(phase, "session", text(finished) + ending), {
        status: "finished",
        sessionId: "session",
      })
    assert.deepEqual(
      phaseResult(
        phase,
        "session",
        text({ status: "failed", reason: "Blocked" }),
      ),
      { status: "failed", sessionId: "session", reason: "Blocked" },
    )
    const ruling = () =>
      phaseResult(
        phase,
        "session",
        text({ status: "needs-ruling", reason: null }),
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
      { status: "finished" },

      { ...finished, file: phase === "fix" ? "/file.md" : null },
      { ...finished, file: "relative.md" },
      { ...finished, reason: "unexpected" },
      { status: "failed", reason: " " },
      { status: "failed", file: "/file.md", reason: "blocked" },
    ])
      assert.throws(() => phaseResult(phase, "session", text(value)))
    for (const invalid of [
      "No result",
      "PHASE RESULT: {broken",
      `${text(finished)}\nExtra text`,
      `${text(finished)}\n\`\`\``,
    ])
      assert.throws(() => phaseResult(phase, "session", invalid))
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

test("phase arguments and recovery identifiers stay data across spaces and shell syntax", async (t) => {
  const f = await fixture(t)
  const plan = '../plan/a "quoted" plan; $(touch forbidden).md'
  const { text: prompt } = phasePrompt({
    phase: "audit",
    assistant: "codex",
    model: unpinned,
    ...testContext(f.root),

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
