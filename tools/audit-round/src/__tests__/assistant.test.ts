import assert from "node:assert/strict"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { runAssistantPhase } from "../assistant.js"
import { openAssistantSession } from "../cli-process.js"
import type { Assistant, PhaseInput } from "../phase.js"
import { recoveryCommand } from "../requests.js"
import { finishedText, fixture, phaseStream, recorded } from "./helpers.js"

const input = (assistant: Assistant, cwd: string): PhaseInput<"fix"> => ({
  phase: "fix",
  assistant,
  cwd,
  ownerRoot: "/peer plan",
  arguments: ["/peer plan/AUDIT.md"],
  sessionId: null,
})

for (const assistant of ["claude", "codex"] as const) {
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
    assert.deepEqual(result, { status: "finished", sessionId: "test-session" })
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
    const [call] = await f.calls()
    if (assistant === "codex")
      assert.deepEqual(call.args.slice(0, 3), [
        "exec",
        "--approve-for-me",
        "--json",
      ])
    else {
      assert.equal(
        call.args[call.args.indexOf("--permission-mode") + 1],
        "auto",
      )
      assert.equal(call.args.includes("--resume"), false)
    }
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
        phase: "rebut",
        sessionId: "prior-session",
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

  test(`${assistant} accounts for an interactive exit and quotes the same recovery invocation`, async (t) => {
    const f = await fixture(t)
    const session = { assistant, sessionId: "fix-session", cwd: f.root }
    await openAssistantSession(session, f.runtime)
    const [call] = await f.calls()
    if (assistant === "codex") {
      assert.deepEqual(call.args, ["resume", "--approve-for-me", "fix-session"])
      assert.equal(
        recoveryCommand(session),
        "codex resume --approve-for-me fix-session",
      )
    } else {
      assert.deepEqual(call.args.slice(0, 2), ["--resume", "fix-session"])
      assert.equal(
        call.args[call.args.indexOf("--permission-mode") + 1],
        "auto",
      )
      assert.ok(recoveryCommand(session).includes("--permission-mode auto"))
    }
    await f.configure({ exitCode: 7 })
    await assert.rejects(openAssistantSession(session, f.runtime))
  })
}

test("Codex rebuttal excludes all pre-invocation usage and retains the new selection", async (t) => {
  const f = await fixture(t)
  const path = join(f.root, "rollout-test-session.jsonl")
  await writeFile(
    path,
    '{"type":"turn_context","payload":{"model":"old","effort":"low"}}\n',
  )
  await f.configure({
    stream: await phaseStream(
      "codex",
      'PHASE RESULT: {"status":"finished","file":"/REBUT.md","reason":null}',
    ),
    usage: { path, text: await recorded("codex-rollout.jsonl") },
  })
  const result = await runAssistantPhase(
    { ...input("codex", f.root), phase: "rebut", sessionId: "test-session" },
    f.output,
    f.runtime,
  )
  assert.deepEqual(result, {
    status: "finished",
    sessionId: "test-session",
    file: "/REBUT.md",
  })
  assert.equal(f.feedback.filter((event) => event.type === "model").length, 1)
  assert.ok(
    f.feedback.some(
      (event) =>
        event.type === "model" && event.selection.model === "gpt-6-astra",
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
  assert.equal(await readFile(join(f.root, "stopped"), "utf8"), "SIGTERM")
})
