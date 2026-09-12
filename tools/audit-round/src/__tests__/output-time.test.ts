import assert from "node:assert/strict"
import { basename } from "node:path"
import { test } from "node:test"
import { RoundOutput, roundRun } from "../output.js"

for (const { zone, instant, timestamp, filename } of [
  {
    zone: "Europe/Amsterdam",
    instant: "2026-09-11T08:28:41.208Z",
    timestamp: "2026-09-11T10:28:41.208+02:00",
    filename: "2026-09-11T10-28-41",
  },
  {
    zone: "Europe/Amsterdam",
    instant: "2026-01-11T08:28:41.208Z",
    timestamp: "2026-01-11T09:28:41.208+01:00",
    filename: "2026-01-11T09-28-41",
  },
  {
    zone: "Europe/Amsterdam",
    instant: "2026-10-25T00:30:00.000Z",
    timestamp: "2026-10-25T02:30:00.000+02:00",
    filename: "2026-10-25T02-30-00",
  },
  {
    zone: "Europe/Amsterdam",
    instant: "2026-10-25T01:30:00.000Z",
    timestamp: "2026-10-25T02:30:00.000+01:00",
    filename: "2026-10-25T02-30-00",
  },
  {
    zone: "America/Los_Angeles",
    instant: "2026-01-01T00:15:00.009Z",
    timestamp: "2025-12-31T16:15:00.009-08:00",
    filename: "2025-12-31T16-15-00",
  },
  {
    zone: "Asia/Kathmandu",
    instant: "2026-09-11T23:30:00.000Z",
    timestamp: "2026-09-12T05:15:00.000+05:45",
    filename: "2026-09-12T05-15-00",
  },
]) {
  test(`run filenames and headers use the system zone ${zone} at ${instant}`, (t) => {
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
      roundRun({ repoRoot: "/repo", plan: "example.md" }, Date.parse(instant)),
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
    assert.equal(logName, `ROUND-TS-example-all-codex-${filename}.log`)
    assert.doesNotMatch(logName, /[:<>"|?*]/)
    assert.equal(
      output.paths.markdown,
      output.paths.log.replace(/\.log$/, ".md"),
    )
    for (const content of [log, markdown, visible]) {
      assert.ok(
        content
          .join("\n")
          .includes(`TypeScript runner; started ${timestamp}\n`),
      )
    }
  })
}
