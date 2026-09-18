import assert from "node:assert/strict"
import { basename } from "node:path"
import { test } from "node:test"
import { RoundOutput, roundRun } from "../output.js"
import { unpinned } from "../phase.js"
import { fixture, selections } from "./helpers.js"

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
        { repoRoot: f.root, plan: "example.md" },
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
    assert.equal(logName, "example-all-01-oth-round.log")
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
      { repoRoot: f.root, plan: "example.md" },
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
      assistant: "codex",
      model: unpinned,
      cwd: "/repo",
      ownerRoot: "/repo",
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
    cwd: "/repo",
  }
  await output.prepareHandover(session)
  // The user is away with the ruling; the round is doing nothing meanwhile.
  t.mock.timers.tick(30 * 60_000)
  await output.phase.observe({ type: "user-text", text: "Take the redesign." })
  assert.equal(stamp(), "\n[fix] 00:00  total 01:05")

  t.mock.timers.tick(120_000)
  await output.phase.observe({ type: "text", text: "Applied." })
  assert.equal(stamp(), "\n[fix] 02:00  total 03:05")

  // Reading the reply and leaving the interactive CLI is the user's time too.
  t.mock.timers.tick(10 * 60_000)
  output.finish({ status: "handed-over", report: "REPORT.md", session })
  assert.equal(stamp(), "\n[fix] 02:00  total 03:05")
})
