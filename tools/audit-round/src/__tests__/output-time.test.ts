import assert from "node:assert/strict"
import { basename } from "node:path"
import { test } from "node:test"
import {
  noOverride,
  RoundOutput,
  roundPhases,
  roundRun,
  unpinned,
} from "./configured-runner.js"
import { fixture, selections, testContext } from "./helpers.js"

for (const { zone, instant, timestamp } of [
  {
    zone: "Europe/Amsterdam",
    instant: "2026-09-11T08:28:41.208Z",
    timestamp: "2026-09-11T10:28:41.208+02:00",
  },
  {
    zone: "Europe/Amsterdam",
    instant: "2026-01-11T08:28:41.208Z",
    timestamp: "2026-01-11T09:28:41.208+01:00",
  },
  {
    zone: "Europe/Amsterdam",
    instant: "2026-10-25T00:30:00.000Z",
    timestamp: "2026-10-25T02:30:00.000+02:00",
  },
  {
    zone: "Europe/Amsterdam",
    instant: "2026-10-25T01:30:00.000Z",
    timestamp: "2026-10-25T02:30:00.000+01:00",
  },
  {
    zone: "America/Los_Angeles",
    instant: "2026-01-01T00:15:00.009Z",
    timestamp: "2025-12-31T16:15:00.009-08:00",
  },
  {
    zone: "Asia/Kathmandu",
    instant: "2026-09-11T23:30:00.000Z",
    timestamp: "2026-09-12T05:15:00.000+05:45",
  },
]) {
  test(`run headers retain the system zone ${zone} at ${instant}`, async (t) => {
    const f = await fixture(t)
    const previousZone = process.env.TZ
    process.env.TZ = zone
    t.after(() => {
      if (previousZone === undefined) delete process.env.TZ
      else process.env.TZ = previousZone
    })
    const log: string[] = []
    const markdown: string[] = []
    const visible: string[] = []
    const output = new RoundOutput(
      await roundRun(
        { ...testContext(f.root), plan: "example.md", scope: "all" },
        Date.parse(instant),
        selections,
      ),
      {
        now: () => Date.parse(instant),
        terminal: {
          write: (text) => {
            visible.push(text)
          },
          status: () => {},
          clear: () => {},
        },
        openFiles: () => ({
          log: (text) => {
            log.push(text)
          },
          markdown: (text) => {
            markdown.push(text)
          },
          close: () => {},
        }),
      },
    )
    t.after(() => output.close())

    const logName = basename(output.paths.log)
    assert.equal(logName, "example-impl-all-01-1-round.oth.log")
    assert.doesNotMatch(logName, /[:<>"|?*]/)
    assert.equal(
      output.paths.markdown,
      output.paths.log.replace(/\.log$/, ".md"),
    )
    for (const content of [log, markdown, visible]) {
      assert.ok(content.join("\n").includes(`Started ${timestamp}\n`))
    }
  })
}

test("elapsed readings count assistant work and never the user's own time", async (t) => {
  const f = await fixture(t)
  t.mock.timers.enable({ apis: ["Date", "setInterval"], now: 10_000 })
  const log: string[] = []
  const output = new RoundOutput(
    await roundRun(
      { ...testContext(f.root), plan: "example.md", scope: "all" },
      Date.now(),
      selections,
    ),
    {
      terminal: { write: () => {}, status: () => {}, clear: () => {} },
      openFiles: () => ({
        log: (text) => {
          log.push(text)
        },
        markdown: () => {},
        close: () => {},
      }),
    },
  )
  t.after(() => output.close())
  const stamp = () => log.filter((text) => text.startsWith("\n[fix]")).at(-1)

  t.mock.timers.tick(5_000)
  await output.phase.start(
    {
      phase: "fix",
      rulingFile: "RULING.md",
      assistant: "codex",
      model: unpinned,
      ...testContext("/repo"),
      arguments: ["REPORT.md"],
      sessionId: null,
    },
    "Full prompt",
  )
  t.mock.timers.tick(60_000)
  await output.phase.observe({ type: "text", text: "A ruling is needed." })
  assert.equal(stamp(), "\n[fix] 01:00  total 01:05")

  const session = {
    assistant: "codex" as const,
    model: unpinned,
    sessionId: "session",
    ...testContext("/repo"),
  }
  output.beginRuling("RULING.md", "Choose a design.")
  // The user is away with the ruling; the round is doing nothing meanwhile.
  t.mock.timers.tick(30 * 60_000)
  output.endRuling("Take the redesign.")
  await output.phase.start(
    {
      ...session,
      phase: "fix",
      rulingFile: "RULING.md",
      arguments: ["REPORT.md"],
      rulingReply: "Take the redesign.",
    },
    "Continue the fix",
  )
  await output.phase.observe({ type: "text", text: "Applying your ruling." })
  assert.equal(stamp(), "\n[fix] 00:00  total 01:05")

  t.mock.timers.tick(120_000)
  await output.phase.observe({ type: "text", text: "Applied." })
  assert.equal(stamp(), "\n[fix] 02:00  total 03:05")

  output.beginRuling("RULING.md", "Another choice.")
  t.mock.timers.tick(10 * 60_000)
  output.endRuling(null)
  output.finish({ status: "awaiting-ruling", report: "REPORT.md", session })
  assert.equal(stamp(), "\n[fix] 02:00  total 03:05")
})

test("commit stamps time the finished audit, vet and rebuttal and never the fix", async (t) => {
  const f = await fixture(t)
  t.mock.timers.enable({ apis: ["Date", "setInterval"], now: 10_000 })
  const setup = { ...testContext(f.root), plan: "example.md", scope: "all" }
  const phases = roundPhases("codex", noOverride)
  const output = new RoundOutput(
    await roundRun(setup, Date.now(), selections),
    {
      terminal: { write: () => {}, status: () => {}, clear: () => {} },
      openFiles: () => ({ log: () => {}, markdown: () => {}, close: () => {} }),
    },
  )
  t.after(() => output.close())
  const time = () => output.commitStamps()?.phases.split("\n").at(-1)
  const start = (phase: "audit" | "vet" | "rebut" | "fix") =>
    output.phase.start(
      {
        ...setup,
        ...phases[phase],
        ...(phase === "audit"
          ? { phase, arguments: ["example-impl-all-01", "example.md"] as const }
          : phase === "rebut"
            ? {
                phase,
                arguments: ["/report.md", "/vet.md", "/rebut.md"] as const,
              }
            : phase === "fix"
              ? {
                  phase,
                  arguments: ["/report.md"] as const,
                  rulingFile: "/ruling.md",
                }
              : { phase, arguments: ["/report.md", "/vet.md"] as const }),
        sessionId: null,
      },
      "prompt",
    )
  const finish = () =>
    output.phase.finish({ status: "finished", sessionId: "session" })

  await start("audit")
  t.mock.timers.tick(4 * 60_000)
  // A running audit has taken no time a commit could state yet.
  assert.equal(time(), "audit: gpt-6-astra high")
  await finish()
  assert.equal(time(), "Audit took 4 min.")
  await start("vet")
  t.mock.timers.tick(2 * 60_000 + 50_000)
  await finish()
  assert.equal(time(), "Audit and vet took 7 min.")
  await start("rebut")
  t.mock.timers.tick(60_000)
  await finish()
  await start("fix")
  t.mock.timers.tick(10 * 60_000)
  await finish()
  // The fix commits while it runs, so the line never counts it.
  assert.equal(time(), "Audit, vet and rebuttal took 8 min.")
})

test("tool lines report step and total assistant time, excluding user waits", async (t) => {
  const f = await fixture(t)
  t.mock.timers.enable({ apis: ["Date", "setInterval"], now: 10_000 })
  const log: string[] = []
  const output = new RoundOutput(
    await roundRun(
      { ...testContext(f.root), plan: "example.md", scope: "all" },
      Date.now(),
      selections,
    ),
    {
      terminal: { write: () => {}, status: () => {}, clear: () => {} },
      openFiles: () => ({
        log: (text) => {
          log.push(text)
        },
        markdown: () => {},
        close: () => {},
      }),
    },
  )
  t.after(() => output.close())
  const tool = (invocation: string) =>
    output.phase.observe({
      type: "tool",
      invocation,
      detail: null,
      stage: "started",
    })
  const line = () => log.at(-1)

  await output.phase.start(
    {
      phase: "fix",
      rulingFile: "RULING.md",
      assistant: "codex",
      model: unpinned,
      ...testContext("/repo"),
      arguments: ["REPORT.md"],
      sessionId: null,
    },
    "Full prompt",
  )
  t.mock.timers.tick(7_000)
  await tool("first")
  assert.match(line() as string, /^ {2}00:07 {2}00:07\s+--\s+--\s+--\s+first$/)
  // A written stamp in between does not reset the step: it counts tool line to tool line.
  t.mock.timers.tick(60_000)
  await output.phase.observe({ type: "text", text: "Half way." })
  t.mock.timers.tick(11 * 60_000)
  await tool("second")
  assert.match(line() as string, /^ {2}12:00 {2}12:07\s+--\s+--\s+--\s+second$/)

  const session = {
    assistant: "codex" as const,
    model: unpinned,
    sessionId: "session",
    ...testContext("/repo"),
  }
  output.beginRuling("RULING.md", "Choose a design.")
  t.mock.timers.tick(30 * 60_000)
  output.endRuling("Take the redesign.")
  await output.phase.start(
    {
      ...session,
      phase: "fix",
      rulingFile: "RULING.md",
      arguments: ["REPORT.md"],
      rulingReply: "Take the redesign.",
    },
    "Continue the fix",
  )
  await output.phase.observe({ type: "text", text: "Applying your ruling." })
  t.mock.timers.tick(4_000)
  await output.phase.observe({
    type: "tool",
    invocation: "third",
    detail: null,
    stage: "started",
  })
  // The resumed fix restarted the step and the user's half hour was theirs.
  assert.match(line() as string, /^ {2}00:04 {2}12:11\s+--\s+--\s+--\s+third$/)
})
