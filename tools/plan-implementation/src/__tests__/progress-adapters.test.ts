import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { basename } from "node:path"
import { afterEach, describe, it } from "node:test"
import type {
  PlanImplementationEvent,
  PlanImplementationFinalResult,
  PlanSourceIdentity,
} from "../contracts.js"
import { createPlanImplementationEventStream } from "../progress-events.js"
import { createTerminalView } from "../terminal-view.js"
import { createPlanImplementationTranscript } from "../transcript.js"
import {
  cleanupTestRepositories,
  createRepoEdu,
} from "./plan-runner-test-harness.js"

afterEach(cleanupTestRepositories)

const source: PlanSourceIdentity = {
  planName: "example",
  planPath: "/plan/plan-example.md",
  commitOid: "a".repeat(40),
  blobOid: "b".repeat(40),
}

describe("progress adapters", () => {
  it("stores every fact while the terminal renders narrative with elapsed time", async () => {
    const repoEduRoot = await createRepoEdu()
    const invocationId = "00000000-0000-4000-8000-000000000009"
    const transcript = await createPlanImplementationTranscript(repoEduRoot, {
      now: () => new Date("2026-08-13T12:34:56.789Z"),
      createInvocationId: () => invocationId,
    })
    const runStart = Date.parse("2026-08-13T12:35:00.000Z")
    const clock = [
      0, // run-started
      0, // phase admission
      5_000, // step-started
      5_000, // phase implementing
      65_000, // narrative
      66_000, // codex command started
      70_000, // codex command succeeded
      71_000, // codex command failed
      72_000, // file change
      73_000, // SDK token usage
      725_000, // phase checking
      726_000, // runner command started
      745_000, // runner command finished
      746_000, // phase committing
      750_000, // step-committed
      780_000, // run-finished
    ]
    let tick = 0
    const overview: string[] = []
    const progress: string[] = []
    const detail: string[] = []
    const detailRenderers: Array<() => string> = []
    let liveElapsedMs = 0
    let displayClosed = false
    const events = createPlanImplementationEventStream({
      transcript,
      presentation: createTerminalView(
        {
          overview(line) {
            overview.push(`${line}\n`)
          },
          progress(render) {
            progress.push(render())
          },
          detail(render) {
            detailRenderers.push(render)
            detail.push(render())
          },
          close() {
            displayClosed = true
          },
        },
        () => liveElapsedMs,
      ),
      now: () =>
        new Date(runStart + (clock[Math.min(tick++, clock.length - 1)] ?? 0)),
    })
    const result: PlanImplementationFinalResult = {
      mode: "through-step",
      throughStep: 9,
      resolvedCeiling: 9,
      transcriptPath: transcript.path,
      outcome: "bound-reached",
    }

    events.emit({
      kind: "run-started",
      invocationId,
      source,
      request: { mode: "through-step", throughStep: 9 },
      resolvedCeiling: 9,
      totalSteps: 11,
    })
    events.emit({ kind: "phase-changed", phase: "admission" })
    events.emit({
      kind: "step-started",
      step: 9,
      title: "Add progress and transcript adapters",
    })
    events.emit({ kind: "phase-changed", phase: "implementing" })
    events.emit({
      kind: "coding",
      step: 9,
      event: {
        kind: "narrative",
        text: "I'll update the event stream and its adapters first.",
      },
    })
    events.emit({
      kind: "coding",
      step: 9,
      event: {
        kind: "command",
        command: "rg -n createPlanImplementationEventStream",
        status: "started",
        exitCode: null,
        output: "",
      },
    })
    events.emit({
      kind: "coding",
      step: 9,
      event: {
        kind: "command",
        command: "rg -n createPlanImplementationEventStream",
        status: "succeeded",
        exitCode: 0,
        output: "",
      },
    })
    events.emit({
      kind: "coding",
      step: 9,
      event: {
        kind: "command",
        command:
          "/bin/zsh -lc 'pnpm --filter @repo-edu/plan-implementation typecheck'",
        status: "failed",
        exitCode: 2,
        output: "error TS2304: Cannot find name 'missing'.",
      },
    })
    events.emit({
      kind: "coding",
      step: 9,
      event: {
        kind: "file-change",
        status: "completed",
        changes: [
          {
            path: "tools/plan-implementation/src/run-progress.ts",
            kind: "update",
          },
          {
            path: "tools/plan-implementation/src/terminal-view.ts",
            kind: "add",
          },
        ],
      },
    })
    events.emit({
      kind: "coding",
      step: 9,
      event: {
        kind: "usage",
        usage: {
          cumulative: {
            inputTokens: 12_345,
            cachedInputTokens: 10_000,
            cacheWriteInputTokens: 2_000,
            outputTokens: 678,
            reasoningOutputTokens: 456,
            totalTokens: 13_023,
          },
          lastContext: {
            inputTokens: 4_500,
            cachedInputTokens: 4_000,
            cacheWriteInputTokens: 0,
            outputTokens: 500,
            reasoningOutputTokens: 300,
            totalTokens: 5_000,
          },
          modelContextWindowTokens: 200_000,
        },
      },
    })
    events.emit({ kind: "phase-changed", phase: "checking" })
    events.emit({
      kind: "command-started",
      commandId: "repository-test",
      label: "Repository test",
      program: "pnpm",
      arguments: ["test"],
    })
    events.emit({
      kind: "command-finished",
      commandId: "repository-test",
      status: "succeeded",
    })
    events.emit({ kind: "phase-changed", phase: "committing" })
    events.emit({
      kind: "step-committed",
      step: 9,
      commitOid: "c".repeat(40),
      subject: "A1 redesign(plan-implementation): add progress evidence",
    })
    events.emit({ kind: "run-finished", result })
    events.close()

    assert.match(
      basename(transcript.path),
      /^20260813T123456789Z-00000000-0000-4000-8000-000000000009\.jsonl$/,
    )
    const stored = (await readFile(transcript.path, "utf8"))
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line) as PlanImplementationEvent)
    assert.equal(stored[0]?.kind, "run-started")
    assert.deepEqual(
      stored.map((event) => event.kind),
      [
        "run-started",
        "phase-changed",
        "step-started",
        "phase-changed",
        "coding",
        "coding",
        "coding",
        "coding",
        "coding",
        "coding",
        "phase-changed",
        "command-started",
        "command-finished",
        "phase-changed",
        "step-committed",
        "run-finished",
      ],
    )
    const storedSucceeded = stored.find(
      (event) =>
        event.kind === "coding" &&
        event.event.kind === "command" &&
        event.event.status === "succeeded",
    )
    assert.notEqual(storedSucceeded, undefined)
    assert.deepEqual(
      stored[0]?.kind === "run-started"
        ? {
            source: stored[0].source,
            request: stored[0].request,
            resolvedCeiling: stored[0].resolvedCeiling,
            invocationId: stored[0].invocationId,
          }
        : null,
      {
        source,
        request: { mode: "through-step", throughStep: 9 },
        resolvedCeiling: 9,
        invocationId,
      },
    )

    const displayed = overview.join("")
    assert.match(
      displayed,
      /\[0:00\] Plan example: 11 steps, through step 9, ceiling 9\./,
    )
    assert.match(
      displayed,
      /\[0:05\] Step 9\/11: Add progress and transcript adapters/,
    )
    assert.match(
      displayed,
      /\[1:05\] I'll update the event stream and its adapters first\./,
    )
    assert.equal(
      /rg -n createPlanImplementationEventStream/.test(displayed),
      false,
    )
    assert.match(
      displayed,
      /^\[1:11\] Failed: Check TypeScript \(exit 2\) — error TS2304: Cannot find name 'missing'\.$/m,
    )
    assert.match(displayed, /^\[1:10\] Finished: Search files$/m)
    assert.match(
      displayed,
      /^\[1:13\] Context: 12345 input tokens \(10000 cached, 2000 cache write\); 678 output tokens \(456 reasoning\)\.$/m,
    )
    assert.match(displayed, /\[12:05\] Phase: checking/)
    assert.match(displayed, /^\[12:25\] Finished: Repository test$/m)
    assert.match(displayed, /\[12:30\] Committed step 9 after 12m 25s: c{12}/)
    assert.match(displayed, /\[13:00\] Result: bound-reached\. Total 13m 0s\./)
    assert.match(
      displayed,
      new RegExp(transcript.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    )
    assert.equal(/Command succeeded: rg -n/.test(displayed), false)
    assert.deepEqual(detail, [
      "[0:00]",
      "[0:00]",
      "[0:05]",
      "[0:05]",
      "[1:05]",
      "[1:06] Search files",
      "[1:10]",
      "[1:11]",
      "[1:12] Edited: updated tools/plan-implementation/src/run-progress.ts, created tools/plan-implementation/src/terminal-view.ts",
      "[1:13]",
      "[12:05]",
      "[12:25]",
      "[12:26]",
      "[12:30]",
    ])
    assert.deepEqual(progress, ["[12:06] Run: Repository test"])
    liveElapsedMs = 2_000
    assert.equal(detailRenderers.at(-1)?.(), "[12:32]")
    assert.equal(displayClosed, true)
  })

  it("names each runner command result by its status", () => {
    const overview: string[] = []
    const view = createTerminalView({
      overview(line) {
        overview.push(line)
      },
      progress() {},
      detail() {},
      close() {},
    })
    const statuses = ["succeeded", "failed", "stopped"] as const

    for (const status of statuses) {
      view.event({
        kind: "command-started",
        timestamp: "2026-08-13T12:35:00.000Z",
        commandId: status,
        label: "Repository test",
        program: "pnpm",
        arguments: ["test"],
      })
      view.event({
        kind: "command-finished",
        timestamp: "2026-08-13T12:35:01.000Z",
        commandId: status,
        status,
      })
    }

    assert.deepEqual(overview, [
      "[0:00] Finished: Repository test",
      "[0:00] Failed: Repository test",
      "[0:00] Stopped: Repository test",
    ])
  })
})
