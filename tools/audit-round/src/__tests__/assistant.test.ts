import assert from "node:assert/strict"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { split } from "shellwords"
import { runAssistantPhase } from "../assistant.js"
import { decodeClaude } from "../claude.js"
import type { PhaseOutput } from "../feedback.js"
import {
  interactiveArguments,
  phaseRequest,
  recoveryCommand,
} from "../requests.js"
import { type Assistant, type PhaseInput, pinned } from "./configured-runner.js"
import {
  finishedFix,
  fixture,
  phaseStream,
  recorded,
  testContext,
} from "./helpers.js"

const input = (
  assistant: Assistant,
  cwd: string,
): Extract<PhaseInput<"fix">, { sessionId: null }> => ({
  phase: "fix",
  rulingFile: "RULING.md",
  assistant,
  model: pinned(assistant),
  ...testContext(cwd),
  arguments: ["/peer plan/AUDIT.md"],
  sessionId: null,
})

const auditScope = {
  target: "example.md",
  planPhase: null,
  heads: [{ repository: "repo-edu", head: "abc123" }],
} as const
const auditResult = {
  status: "finished",
  reason: null,
  report: { opening: "Résumé complete", findings: [], settling: null },
}

test("a fix child receives its unresolved contest commit block", async (t) => {
  const f = await fixture(t)
  await f.configure({ stream: await phaseStream("codex", finishedFix) })
  await runAssistantPhase(
    {
      ...input("codex", f.root),
      arguments: [
        "/peer plan/AUDIT.md",
        {
          contests: [
            { finding: 1 },
            { finding: 2, winner: ["obx"], reason: "The verdict stands." },
            { finding: 3 },
          ],
        },
      ],
    },
    f.output,
    f.runtime,
  )
  assert.equal((await f.calls())[0]?.openContests, "1,3")

  await runAssistantPhase(input("codex", f.root), f.output, f.runtime)
  assert.equal((await f.calls())[1]?.openContests, "")
})

/** One launch of each phase on `assistant`, with what the runner supplies it. */
function cachePhases(assistant: Assistant, root: string): PhaseInput[] {
  const context = { assistant, model: pinned(assistant), ...testContext(root) }
  const report = join(root, "audit.md")
  return [
    {
      ...context,
      phase: "audit",
      reportScope: auditScope,
      arguments: [report, "example.md"],
      sessionId: null,
    },
    {
      ...context,
      phase: "vet",
      findings: [],
      arguments: [report, join(root, "vet.abh.md")],
      sessionId: null,
    },
    {
      ...context,
      phase: "rebut",
      findings: [],
      reviews: [],
      arguments: [report, join(root, "vet.abh.md"), join(root, "rebut.md")],
      sessionId: null,
    },
    {
      ...context,
      phase: "rule",
      arguments: [
        report,
        join(root, "vet.abh.md"),
        join(root, "rebut.md"),
        join(root, "ruler.md"),
        { findings: [{ finding: 1, tier: "C" }] },
      ],
      panel: ["abh"],
      sessionId: null,
    },
    {
      ...context,
      phase: "watch",
      arguments: [],
      evidence: "{}",
      sessionId: null,
    },
    { ...input(assistant, root) },
    {
      ...context,
      phase: "implement",
      rulingFile: join(root, "RULING.md"),
      arguments: ["/plan/example.md", 1, ["repo-edu"], "claude-test", "high"],
      sessionId: null,
    },
  ]
}

const fiveMinutePhases = ["audit", "vet", "rebut", "rule", "watch"]

test("a Claude child of the five reviewing phases keeps its cache for five minutes", async (t) => {
  const f = await fixture(t)
  await f.configure({
    stream: await phaseStream("claude", "No structured result"),
  })
  const runtime = {
    ...f.runtime,
    env: { CLAUDE_CODE_PROMPT_CACHE_TTL: "1h" },
  }
  for (const phase of cachePhases("claude", f.root)) {
    const before = (
      await readFile(join(f.root, "calls.jsonl"), "utf8").catch(() => "")
    ).length
    const result = await runAssistantPhase(phase, f.output, runtime)
    const calls = (await readFile(join(f.root, "calls.jsonl"), "utf8"))
      .slice(before)
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
    assert.equal(calls.length, 1, phase.phase)
    assert.equal(
      calls[0].cacheLifetime,
      fiveMinutePhases.includes(phase.phase) ? "5m" : "1h",
    )
    assert.deepEqual(result, {
      status: "failed",
      sessionId: "test-session",
      reason: "CLI ended without a structured phase result",
    })
  }
  assert.deepEqual(runtime.env, { CLAUDE_CODE_PROMPT_CACHE_TTL: "1h" })
})

test("a Codex child and a concurrent Claude worker inherit the caller's cache lifetime", async (t) => {
  const f = await fixture(t)
  const vet = {
    status: "finished",
    reason: null,
    report: { headDrift: "None.", verdicts: {} },
  }
  await f.configure({
    phases: {
      vet: {
        assistants: {
          claude: { stream: await phaseStream("claude", vet) },
          codex: { stream: await phaseStream("codex", vet) },
        },
      },
      fix: { stream: await phaseStream("claude", finishedFix) },
    },
  })
  const runtime = {
    ...f.runtime,
    env: { CLAUDE_CODE_PROMPT_CACHE_TTL: "1h" },
  }
  const [claudeVet, claudeFix] = cachePhases("claude", f.root).filter(
    (phase) => phase.phase === "vet" || phase.phase === "fix",
  )
  const [codexVet] = cachePhases("codex", f.root).filter(
    (phase) => phase.phase === "vet",
  )
  await Promise.all(
    [claudeVet, claudeFix, codexVet].map((phase) =>
      runAssistantPhase(phase, f.output, runtime),
    ),
  )
  const calls = await f.calls()
  const lifetimes = (assistant: Assistant) =>
    calls
      .filter((call) => call.assistant === assistant)
      .map((call) => call.cacheLifetime)
      .sort()
  assert.deepEqual(lifetimes("claude"), ["1h", "5m"])
  assert.deepEqual(lifetimes("codex"), ["1h"])
})

test("a Codex child that prints a reconnect notice and then completes its turn finishes the phase", async (t) => {
  const f = await fixture(t)
  const notice =
    "Reconnecting... 2/5 (Selected model is at capacity. Please try a different model.)"
  const lines = (await phaseStream("codex", finishedFix)).trimEnd().split("\n")
  lines.splice(1, 0, JSON.stringify({ type: "error", message: notice }))
  await f.configure({
    stream: `${lines.join("\n")}\n`,
    usage: {
      path: join(f.root, "rollout-test-session.jsonl"),
      text: await recorded("codex-rollout.jsonl"),
    },
  })
  const result = await runAssistantPhase(
    input("codex", f.root),
    f.output,
    f.runtime,
  )
  assert.deepEqual(result, {
    status: "finished",
    settling: null,
    sessionId: "test-session",
  })
  assert.ok(
    f.feedback.some(
      (event) => event.type === "diagnostic" && event.text === notice,
    ),
  )
})

test("Claude compact boundaries become phase feedback", () => {
  assert.deepEqual(
    decodeClaude({ type: "system", subtype: "compact_boundary" }),
    [{ type: "compaction" }],
  )
})

test("Claude's empty closing result of no turns is not a turn", () => {
  assert.deepEqual(
    decodeClaude({
      type: "result",
      subtype: "success",
      is_error: false,
      num_turns: 0,
      result: "",
      modelUsage: {},
    }),
    [],
  )
})

test("a watch returns its document, grade and output-owned compaction count", async (t) => {
  const f = await fixture(t)
  const final = {
    status: "finished",
    reason: null,
    result: {
      document: "# Example: trajectory watch\n\nGrounded evidence.",
      grade: "amber",
    },
  }
  await f.configure({ stream: await phaseStream("claude", final) })
  const result = await runAssistantPhase(
    {
      phase: "watch",
      assistant: "claude",
      model: pinned("claude"),
      ...testContext(f.root),
      arguments: [],
      evidence: "{}",
      sessionId: null,
    },
    {
      start: async (input, prompt) => {
        const recorder = await f.output.start(input, prompt)
        return {
          ...recorder,
          finish: async (phaseResult) => {
            await recorder.finish(phaseResult)
            return { compactions: 2 }
          },
        }
      },
    },
    f.runtime,
  )
  assert.deepEqual(result, {
    status: "finished",
    sessionId: "test-session",
    document: "# Example: trajectory watch\n\nGrounded evidence.",
    grade: "amber",
    compactions: 2,
  })
})

test("Claude reports the last turn's text when a background wake-up adds turns", async (t) => {
  const f = await fixture(t)
  const report = join(f.root, "audit.md")
  const lines = (await phaseStream("claude", auditResult)).trim().split("\n")
  const last = lines.findLastIndex((line) => line.includes('"type":"result"'))
  const closing = JSON.parse(lines[last])
  const waiting = JSON.stringify({
    ...closing,
    num_turns: 1,
    structured_output: undefined,
    result: "Waiting for the probe sleep.",
  })
  const empty = JSON.stringify({ ...closing, num_turns: 0, result: "" })
  lines.splice(last, 1, waiting, lines[last], empty)
  await f.configure({ stream: `${lines.join("\n")}\n` })
  const result = await runAssistantPhase(
    {
      phase: "audit",
      reportScope: auditScope,
      assistant: "claude",
      model: pinned("claude"),
      ...testContext(f.root),
      arguments: [report, "example.md"],
      sessionId: null,
    },
    f.output,
    f.runtime,
  )
  assert.equal(result.status, "finished")
  assert.match(await readFile(report, "utf8"), /Résumé complete/)
})

async function recordedTokenUpdate(assistant: Assistant, recording: string) {
  if (assistant === "claude") {
    // Each turn's result carries the session total so far; the newest stands.
    const result = (await recorded(`${recording}.jsonl`))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
      .filter((event) => event.type === "result" && event.num_turns > 0)
      .at(-1)
    assert.ok(result?.modelUsage)
    return {
      kind: "models" as const,
      models: Object.entries(result.modelUsage).map(([model, value]) => {
        const usage = value as {
          inputTokens: number
          cacheReadInputTokens: number
          cacheCreationInputTokens: number
          outputTokens: number
        }
        return {
          model,
          input:
            usage.inputTokens +
            usage.cacheReadInputTokens +
            usage.cacheCreationInputTokens,
          cached: usage.cacheReadInputTokens,
          output: usage.outputTokens,
        }
      }),
    }
  }
  const rollout = recording.endsWith("-resume")
    ? "codex-rollout-resume.jsonl"
    : "codex-rollout.jsonl"
  const total = (await recorded(rollout))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line).payload?.info?.total_token_usage)
    .filter(Boolean)
    .at(-1)
  assert.ok(total)
  return {
    kind: "selected-model" as const,
    tokens: {
      input: total.input_tokens,
      cached: total.cached_input_tokens,
      output: total.output_tokens,
    },
  }
}

async function recordedCodexContexts(recording: string): Promise<number[]> {
  return (await recorded(recording))
    .trim()
    .split("\n")
    .map(
      (line) => JSON.parse(line).payload?.info?.last_token_usage?.input_tokens,
    )
    .filter((tokens): tokens is number => typeof tokens === "number")
}

async function recordedCodexModel(recording: string): Promise<string> {
  const selection = (await recorded(recording))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
    .find((event) => event.type === "turn_context")?.payload
  assert.equal(typeof selection?.model, "string")
  return selection.model
}

for (const assistant of ["claude", "codex"] as const) {
  test(`${assistant} saves only completed final report text and retains write failures`, async (t) => {
    const f = await fixture(t)
    const report = join(f.root, "audit.md")
    await writeFile(
      join(f.root, "rollout-test-session.jsonl"),
      await recorded("codex-rollout.jsonl"),
    )
    const phase: PhaseInput<"audit"> = {
      phase: "audit",
      reportScope: auditScope,
      assistant,
      model: pinned(assistant),
      ...testContext(f.root),
      arguments: [report, "example.md"],
      sessionId: null,
    }
    await writeFile(report, "Old report")
    await f.configure({ stream: await phaseStream(assistant, auditResult) })
    const saved = await runAssistantPhase(phase, f.output, f.runtime)
    assert.equal(saved.status, "finished")
    assert.match(await readFile(report, "utf8"), /Résumé complete/)

    await f.configure({
      stream: await phaseStream(assistant, {
        status: "failed",
        reason: "Missing input",
        report: null,
      }),
    })
    const failed = await runAssistantPhase(phase, f.output, f.runtime)
    assert.equal(failed.status, "failed")
    assert.match(await readFile(report, "utf8"), /Résumé complete/)

    await f.configure({ stream: await phaseStream(assistant, auditResult) })
    const unwritable = await runAssistantPhase(
      { ...phase, arguments: [f.root, "example.md"] },
      f.output,
      f.runtime,
    )
    assert.equal(unwritable.status, "failed")
    assert.equal(unwritable.sessionId, "test-session")
    assert.equal(f.finishes.length, 2)
    assert.equal(f.releases(), 3)
  })

  test(`${assistant} rejects a missing structured result without retrying`, async (t) => {
    const f = await fixture(t, {
      stream: await phaseStream(assistant, "First report"),
    })
    const report = join(f.root, "audit.md")
    await writeFile(report, "Old report")
    const result = await runAssistantPhase(
      {
        phase: "audit",
        reportScope: auditScope,
        assistant,
        model: pinned(assistant),
        ...testContext(f.root),
        arguments: [report, "example.md"],
        sessionId: null,
      },
      f.output,
      f.runtime,
    )
    assert.equal(result.status, "failed")
    assert.equal((await f.calls()).length, 1)
    assert.equal(await readFile(report, "utf8"), "Old report")
  })

  test(`${assistant} accounts for recorded tool failures, split UTF-8 and final completion`, async (t) => {
    const f = await fixture(t)
    const usagePath = join(f.root, "rollout-test-session.jsonl")
    await f.configure({
      stream: await phaseStream(assistant, finishedFix),
      chunkSize: 73,
      stderr: "CLI diagnostic\n",
      usage: { path: usagePath, text: await recorded("codex-rollout.jsonl") },
    })
    const result = await runAssistantPhase(
      input(assistant, f.root),
      f.output,
      f.runtime,
    )
    assert.deepEqual(result, {
      status: "finished",
      settling: null,
      sessionId: "test-session",
    })
    assert.equal(f.releases(), 1)
    assert.deepEqual(f.finishes, [result])
    assert.ok(
      f.feedback.some(
        (event) =>
          event.type === "text" && event.text === finishedFix.closingNote,
      ),
    )
    assert.ok(
      f.feedback.some(
        (event) =>
          event.type === "tool" &&
          event.stage === "completed" &&
          JSON.stringify(event.detail).includes("audit-round-probe-error"),
      ),
    )
    assert.ok(f.feedback.some((event) => event.type === "model"))
    assert.deepEqual(
      f.feedback.filter((event) => event.type === "tokens").at(-1),
      {
        type: "tokens",
        update: await recordedTokenUpdate(assistant, assistant),
      },
    )
    assert.ok(
      f.feedback.some((event) => event.type === "context" && event.tokens > 0),
    )
    assert.ok(
      f.feedback.some(
        (event) =>
          event.type === "diagnostic" && event.text === "CLI diagnostic",
      ),
    )
    assert.ok(f.starts[0].prompt.includes("/peer plan/"))
    const logged = f.starts[0].prompt
    const supplied = (await f.prompts())[0].prompt
    const workflow = join(f.root, ".agents/skills/fix/references/workflow.md")
    assert.ok(supplied.includes(`Source file: ${workflow}\n\n`))
    assert.ok(supplied.includes("fix workflow\n"))
    assert.ok(
      logged.includes(`Source file: ${workflow} (contents omitted from log)`),
    )
    assert.doesNotMatch(logged, /fix workflow\n/)
    const [call] = await f.calls()
    if (assistant === "codex") {
      assert.deepEqual(
        f.feedback
          .filter(
            (event) =>
              event.type === "text" ||
              (event.type === "tool" && event.stage === "started"),
          )
          .map((event) => (event.type === "text" ? event.text : event.type)),
        [
          "I’m running the two probe commands in the requested order. The second failure will be left as the intended result.",
          "tool",
          "tool",
          finishedFix.closingNote,
        ],
      )
      assert.deepEqual(call.args, [
        "exec",
        "--approve-for-me",
        "-m",
        "gpt-5.6-sol",
        "-c",
        "model_reasoning_effort=high",
        "--json",
        "--output-schema",
        call.args.at(-1),
      ])
    } else {
      assert.equal(
        call.args[call.args.indexOf("--permission-mode") + 1],
        "auto",
      )
      assert.equal(call.args.includes("--resume"), false)
    }
  })

  test(`${assistant} reads fresh and resumed session totals from the contract recordings`, async (t) => {
    const f = await fixture(t)
    const usagePath = join(f.root, "rollout-test-session.jsonl")
    await f.configure({
      stream: await phaseStream(assistant, finishedFix),
      ...(assistant === "codex"
        ? {
            usage: {
              path: usagePath,
              text: await recorded("codex-rollout.jsonl"),
            },
          }
        : {}),
    })
    const fresh = await runAssistantPhase(
      input(assistant, f.root),
      f.output,
      f.runtime,
    )
    assert.deepEqual(fresh, {
      status: "finished",
      sessionId: "test-session",
      settling: null,
    })
    const freshFeedbackEnd = f.feedback.length

    await f.configure({
      stream: await phaseStream(
        assistant,
        finishedFix,
        "test-session",
        `${assistant}-resume`,
      ),
      ...(assistant === "codex"
        ? {
            usage: {
              path: usagePath,
              text: await recorded("codex-rollout-resume.jsonl"),
            },
          }
        : {}),
    })
    const resumed = await runAssistantPhase(
      {
        ...input(assistant, f.root),
        sessionId: "test-session",
        rulingReply: "Resume the contract probe.",
      },
      f.output,
      f.runtime,
    )
    assert.deepEqual(resumed, {
      status: "finished",
      settling: null,
      sessionId: "test-session",
    })
    const freshTokens = f.feedback
      .slice(0, freshFeedbackEnd)
      .filter((event) => event.type === "tokens")
      .at(-1)
    const resumedTokens = f.feedback
      .slice(freshFeedbackEnd)
      .filter((event) => event.type === "tokens")
      .at(-1)
    assert.deepEqual(freshTokens, {
      type: "tokens",
      update: await recordedTokenUpdate(assistant, assistant),
    })
    assert.deepEqual(resumedTokens, {
      type: "tokens",
      update: await recordedTokenUpdate(assistant, `${assistant}-resume`),
    })
  })

  for (const problem of [
    "process",
    "malformed",
    "incomplete",
    "write",
    "assistant",
    "session",
  ] as const) {
    test(`${assistant} stops on ${problem} failure and releases its process and output`, async (t) => {
      const f = await fixture(t)
      let stream = await phaseStream(assistant, finishedFix)
      if (problem === "malformed") stream += "invalid JSON\n"
      if (problem === "incomplete")
        stream = stream
          .split("\n")
          .filter(
            (line) =>
              !line.includes('"type":"result"') &&
              !line.includes('"type":"turn.completed"'),
          )
          .join("\n")
      if (problem === "assistant")
        stream = stream
          .trimEnd()
          .split("\n")
          .map((line) => {
            const record = JSON.parse(line)
            if (record.type === "result") record.is_error = true
            if (record.type === "turn.completed") {
              record.type = "turn.failed"
              record.error = { message: "Assistant failed" }
            }
            return JSON.stringify(record)
          })
          .join("\n")
      if (problem === "session")
        stream = stream.replaceAll('"test-session"', '""')
      await f.configure({
        stream,
        exitCode: problem === "process" ? 7 : 0,
        wait: problem === "malformed" || problem === "write",
      })
      const output: PhaseOutput =
        problem === "write"
          ? {
              start: async (input, prompt) => ({
                ...(await f.output.start(input, prompt)),
                observe: async () => {
                  throw new Error("Required log write failed")
                },
              }),
            }
          : f.output
      const result = await runAssistantPhase(
        input(assistant, f.root),
        output,
        f.runtime,
      )
      assert.equal(result.status, "failed")
      assert.equal(f.releases(), 1)
      const [call] = await f.calls()
      assert.throws(() => process.kill(call.pid, 0), { code: "ESRCH" })
      assert.equal(f.finishes.length, 0)
    })
  }

  test(`${assistant} preserves a resumed identity when the CLI fails before reporting it`, async (t) => {
    const f = await fixture(t, { exitCode: 7 })
    await writeFile(join(f.root, "rollout-prior-session.jsonl"), "old data\n")
    const result = await runAssistantPhase(
      {
        ...input(assistant, f.root),
        sessionId: "prior-session",
        rulingReply: "Apply the corrections.",
      },
      f.output,
      f.runtime,
    )
    assert.equal(result.status, "failed")
    assert.equal(result.sessionId, "prior-session")
    const [call] = await f.calls()
    if (assistant === "codex")
      assert.deepEqual(call.args.slice(0, 9), [
        "exec",
        "--approve-for-me",
        "-m",
        "gpt-5.6-sol",
        "-c",
        "model_reasoning_effort=high",
        "resume",
        "--json",
        "--output-schema",
      ])
    else {
      assert.deepEqual(call.args.slice(0, 3), [
        "-p",
        "--resume",
        "prior-session",
      ])
      assert.equal(
        call.args[call.args.indexOf("--permission-mode") + 1],
        "auto",
      )
    }
    if (assistant === "codex")
      assert.deepEqual(call.args.slice(-2), ["prior-session", "-"])
  })

  test(`${assistant} quotes the manual recovery invocation`, async (t) => {
    const f = await fixture(t)
    const session = {
      assistant,
      model: pinned(assistant),
      sessionId: "fix-session",
      ...testContext(f.root),
    }
    const args = interactiveArguments(session)
    assert.deepEqual(split(recoveryCommand(session)), [
      "cd",
      f.root,
      "&&",
      assistant,
      ...args,
    ])
    if (assistant === "codex") {
      assert.deepEqual(args, [
        "-m",
        "gpt-5.6-sol",
        "-c",
        "model_reasoning_effort=high",
        "resume",
        "--approve-for-me",
        "fix-session",
      ])
    } else {
      assert.deepEqual(args.slice(0, 2), ["--resume", "fix-session"])
      assert.equal(args[args.indexOf("--permission-mode") + 1], "auto")
    }
  })
}

test("fresh and resumed Codex fix requests carry the schema by path and large prompts on stdin", () => {
  const prompt = "Evidence: é\n".repeat(30_000)
  const pin = ["-m", "gpt-5.6-sol", "-c", "model_reasoning_effort=high"]
  for (const sessionId of [null, "fix-session"]) {
    const request = phaseRequest(
      {
        ...input("codex", "/workspace/repo-edu"),
        ...(sessionId === null
          ? { sessionId }
          : { sessionId, rulingReply: "Apply the corrections." }),
      },
      sessionId,
      prompt,
      "/tmp/result schema.json",
    )
    assert.equal(request.input, prompt)
    assert.deepEqual(
      request.args,
      sessionId === null
        ? [
            "exec",
            "--approve-for-me",
            ...pin,
            "--json",
            "--output-schema",
            "/tmp/result schema.json",
          ]
        : [
            "exec",
            "--approve-for-me",
            ...pin,
            "resume",
            "--json",
            "--output-schema",
            "/tmp/result schema.json",
            sessionId,
            "-",
          ],
    )
  }
})

test("Claude completes a phase when its settings response fails", async (t) => {
  const stream = (await phaseStream("claude", finishedFix))
    .trimEnd()
    .split("\n")
    .map((line) => {
      const record = JSON.parse(line)
      if (record.type === "control_response") {
        record.response = {
          request_id: "audit-round-settings",
          subtype: "error",
          error: "Settings unavailable",
        }
      }
      return JSON.stringify(record)
    })
    .join("\n")
  const f = await fixture(t, { stream })
  const result = await runAssistantPhase(
    input("claude", f.root),
    f.output,
    f.runtime,
  )
  assert.deepEqual(result, {
    status: "finished",
    settling: null,
    sessionId: "test-session",
  })
  assert.equal(
    f.feedback.some((event) => event.type === "model"),
    false,
  )
})

test("Codex fix excludes all pre-invocation usage and retains the new selection", async (t) => {
  const f = await fixture(t)
  const path = join(f.root, "rollout-test-session.jsonl")
  await writeFile(
    path,
    '{"type":"turn_context","payload":{"model":"old","effort":"low"}}\n' +
      '{"type":"event_msg","payload":{"type":"token_count","info":{"last_token_usage":{"input_tokens":999999},"model_context_window":1000000}}}\n',
  )
  await f.configure({
    stream: await phaseStream("codex", finishedFix),
    usage: { path, text: await recorded("codex-rollout.jsonl") },
  })
  const result = await runAssistantPhase(
    {
      ...input("codex", f.root),
      sessionId: "test-session",
      rulingReply: "Apply the corrections.",
    },
    f.output,
    f.runtime,
  )
  assert.deepEqual(result, {
    status: "finished",
    settling: null,
    sessionId: "test-session",
  })
  assert.deepEqual(
    f.feedback.filter((event) => event.type === "context"),
    (await recordedCodexContexts("codex-rollout.jsonl")).map((tokens) => ({
      type: "context",
      tokens,
      window: 258400,
    })),
  )
  assert.equal(f.feedback.filter((event) => event.type === "model").length, 1)
  const recordedModel = await recordedCodexModel("codex-rollout.jsonl")
  assert.ok(
    f.feedback.some(
      (event) =>
        event.type === "model" && event.selection.model === recordedModel,
    ),
  )
})

test("a ruler is sent back once to open what it named, and a second miss fails the phase", async (t) => {
  const f = await fixture(t)
  const ruler = join(f.root, "ruler.md")
  // The runner supplies the workflow whole, so naming it needs no tool call.
  const workflow = join(f.root, ".agents/skills/rule/references/workflow.md")
  const phase: PhaseInput<"rule"> = {
    phase: "rule",
    assistant: "claude",
    model: pinned("claude"),
    ...testContext(f.root),
    arguments: [
      join(f.root, "audit.md"),
      join(f.root, "vet.abh.md"),
      join(f.root, "rebut.md"),
      ruler,
      { findings: [{ finding: 1, tier: "C" }] },
    ],
    panel: ["abh"],
    sessionId: null,
  }
  const report = (source: string) =>
    phaseStream("claude", {
      status: "finished",
      reason: null,
      report: {
        headDrift: "",
        findings: {
          1: {
            points: [
              {
                question: "Does it hold?",
                sources: [{ source, place: null }],
                record: "The file settles it.",
              },
            ],
            winner: ["abh"],
            reason: "The drop held.",
            openChoice: null,
          },
        },
      },
    })
  await f.configure({
    phases: {
      rule: { streams: [await report("fedcba"), await report(workflow)] },
    },
  })
  const ruled = await runAssistantPhase(phase, f.output, f.runtime)
  assert.deepEqual(ruled, {
    status: "finished",
    sessionId: "test-session",
    reading: {
      winners: [
        {
          number: 1,
          tier: "C",
          winner: ["abh"],
          reason: "The drop held.",
          choice: null,
        },
      ],
      sources: [workflow],
    },
  })
  assert.match(await readFile(ruler, "utf8"), /Winner: abh\./)
  const prompts = await f.prompts()
  assert.equal(prompts.length, 2)
  assert.match(
    prompts[1].prompt,
    /names sources this session did not open: `fedcba`/,
  )

  await writeFile(join(f.root, "rule-count"), "0")
  await f.configure({
    phases: { rule: { streams: [await report("fedcba")] } },
  })
  assert.deepEqual(await runAssistantPhase(phase, f.output, f.runtime), {
    status: "failed",
    sessionId: "test-session",
    reason: "The ruler report names sources its session did not open: fedcba",
  })
})

test("a rejected required final write fails after the child has ended", async (t) => {
  const f = await fixture(t, {
    stream: await phaseStream("claude", finishedFix),
  })
  const result = await runAssistantPhase(
    input("claude", f.root),
    {
      start: async (input, prompt) => ({
        ...(await f.output.start(input, prompt)),
        finish: async () => {
          throw new Error("Markdown write failed")
        },
      }),
    },
    f.runtime,
  )
  assert.deepEqual(result, {
    status: "failed",
    sessionId: "test-session",
    reason: "Markdown write failed",
  })
  assert.equal(f.releases(), 1)
})

test("cancellation stops and awaits an active CLI", async (t) => {
  const f = await fixture(t, {
    stream: '{"type":"thread.started","thread_id":"test-session"}\n',
    wait: true,
  })
  const abort = new AbortController()
  const output: PhaseOutput = {
    start: async (input, prompt) => ({
      ...(await f.output.start(input, prompt)),
      observe: async () => {
        abort.abort()
      },
    }),
  }
  const result = await runAssistantPhase(input("codex", f.root), output, {
    ...f.runtime,
    signal: abort.signal,
  })
  assert.equal(result.status, "failed")
  assert.equal(f.releases(), 1)
  const [call] = await f.calls()
  assert.throws(() => process.kill(call.pid, 0), { code: "ESRCH" })
  // Windows terminates the process without running its signal handler.
  if (process.platform !== "win32")
    assert.equal(await readFile(join(f.root, "stopped"), "utf8"), "SIGTERM")
})
