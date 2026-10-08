import assert from "node:assert/strict"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { split } from "shellwords"
import { runAssistantPhase } from "../assistant.js"
import {
  interactiveArguments,
  phaseRequest,
  recoveryCommand,
} from "../requests.js"
import {
  type Assistant,
  type PhaseInput,
  unpinned,
} from "./configured-runner.js"
import {
  finishedText,
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
  model: unpinned,
  ...testContext(cwd),
  arguments: ["/peer plan/AUDIT.md"],
  sessionId: null,
})

async function recordedTokenUpdate(assistant: Assistant, recording: string) {
  if (assistant === "claude") {
    const result = (await recorded(`${recording}.jsonl`))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
      .find((event) => event.type === "result")
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
      assistant,
      model: unpinned,
      ...testContext(f.root),
      arguments: [report, "example.md"],
      sessionId: null,
    }
    await writeFile(report, "Old report")
    await f.configure({ stream: await phaseStream(assistant) })
    const saved = await runAssistantPhase(phase, f.output, f.runtime)
    assert.equal(saved.status, "finished")
    assert.equal(await readFile(report, "utf8"), "Résumé complete\n")

    await f.configure({
      stream: await phaseStream(
        assistant,
        'Incomplete report\nPHASE RESULT: {"status":"failed","reason":"Missing input"}',
      ),
    })
    const failed = await runAssistantPhase(phase, f.output, f.runtime)
    assert.equal(failed.status, "failed")
    assert.equal(await readFile(report, "utf8"), "Résumé complete\n")

    await f.configure({ stream: await phaseStream(assistant) })
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

  test(`${assistant} accounts for recorded tool failures, split UTF-8 and final completion`, async (t) => {
    const f = await fixture(t)
    const usagePath = join(f.root, "rollout-test-session.jsonl")
    await f.configure({
      stream: await phaseStream(assistant),
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
      sessionId: "test-session",
    })
    assert.equal(f.releases(), 1)
    assert.deepEqual(f.finishes, [result])
    assert.ok(
      f.feedback.some(
        (event) => event.type === "text" && event.text === finishedText,
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
    assert.doesNotMatch(logged, /fix workflow\n|fix launcher\n/)
    const [call] = await f.calls()
    if (assistant === "codex") {
      assert.deepEqual(call.args, ["exec", "--approve-for-me", "--json"])
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
      stream: await phaseStream(assistant),
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
    assert.deepEqual(fresh, { status: "finished", sessionId: "test-session" })
    const freshFeedbackEnd = f.feedback.length

    await f.configure({
      stream: await phaseStream(
        assistant,
        finishedText,
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
      let stream = await phaseStream(assistant)
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
      const output =
        problem === "write"
          ? {
              ...f.output,
              observe: async () => {
                throw new Error("Required log write failed")
              },
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
      assert.deepEqual(call.args.slice(0, 5), [
        "exec",
        "--approve-for-me",
        "resume",
        "--json",
        "prior-session",
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
  })

  test(`${assistant} quotes the manual recovery invocation`, async (t) => {
    const f = await fixture(t)
    const session = {
      assistant,
      model: unpinned,
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
      assert.deepEqual(args, ["resume", "--approve-for-me", "fix-session"])
    } else {
      assert.deepEqual(args.slice(0, 2), ["--resume", "fix-session"])
      assert.equal(args[args.indexOf("--permission-mode") + 1], "auto")
    }
  })
}

test("fresh and resumed Codex fix requests carry large prompts only on stdin", () => {
  const prompt = "Evidence: é\n".repeat(30_000)
  for (const sessionId of [null, "fix-session"]) {
    const request = phaseRequest(
      {
        ...input("codex", "/workspace/repo-edu"),
        ...(sessionId === null
          ? { sessionId }
          : { sessionId, rulingReply: "Apply the corrections." }),
      },
      prompt,
    )
    assert.equal(request.input, prompt)
    assert.deepEqual(
      request.args,
      sessionId === null
        ? ["exec", "--approve-for-me", "--json"]
        : ["exec", "--approve-for-me", "resume", "--json", sessionId, "-"],
    )
  }
})

test("Claude completes a phase when its settings reply fails", async (t) => {
  const stream = (await phaseStream("claude"))
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
    stream: await phaseStream(
      "codex",
      'PHASE RESULT: {"status":"finished","reason":null}',
    ),
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

test("a rejected required final write fails after the child has ended", async (t) => {
  const f = await fixture(t, { stream: await phaseStream("claude") })
  const result = await runAssistantPhase(
    input("claude", f.root),
    {
      ...f.output,
      finish: async () => {
        throw new Error("Markdown write failed")
      },
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
  const output = {
    ...f.output,
    observe: async () => {
      abort.abort()
    },
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

test("the brief carries its pinned model and effort into the Codex invocation", async (t) => {
  const f = await fixture(t)
  await f.configure({
    stream: await phaseStream(
      "codex",
      'Brief written\nPHASE RESULT: {"status":"finished","reason":null}',
    ),
    usage: {
      path: join(f.root, "rollout-test-session.jsonl"),
      text: await recorded("codex-rollout.jsonl"),
    },
  })
  const result = await runAssistantPhase(
    {
      phase: "brief",
      assistant: "codex",
      model: {
        model: { value: "gpt-5.6-terra", source: "phase pin" },
        effort: { value: "low", source: "phase pin" },
      },
      ...testContext(f.root),
      arguments: [join(f.root, "ROUND-example.md"), "/brief.md"],
      sessionId: null,
    },
    f.output,
    f.runtime,
  )
  assert.equal(result.status, "finished")
  const [call] = await f.calls()
  assert.deepEqual(call.args.slice(0, 7), [
    "exec",
    "--approve-for-me",
    "-m",
    "gpt-5.6-terra",
    "-c",
    "model_reasoning_effort=low",
    "--json",
  ])
})

test("an unpinned Codex phase names no model", async (t) => {
  const f = await fixture(t)
  await f.configure({
    stream: await phaseStream("codex"),
    usage: {
      path: join(f.root, "rollout-test-session.jsonl"),
      text: await recorded("codex-rollout.jsonl"),
    },
  })
  await runAssistantPhase(input("codex", f.root), f.output, f.runtime)
  const [call] = await f.calls()
  assert.equal(call.args.includes("-m"), false)
  assert.equal(call.args.includes("-c"), false)
})
