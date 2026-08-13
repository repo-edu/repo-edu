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
  it("stores every fact while the terminal removes repeated detail", async () => {
    const repoEduRoot = await createRepoEdu()
    const invocationId = "00000000-0000-4000-8000-000000000009"
    const transcript = await createPlanImplementationTranscript(repoEduRoot, {
      now: () => new Date("2026-08-13T12:34:56.789Z"),
      createInvocationId: () => invocationId,
    })
    const terminal: string[] = []
    const events = createPlanImplementationEventStream({
      transcript,
      presentation: createTerminalView({
        write(text) {
          terminal.push(text)
        },
      }),
      now: () => new Date("2026-08-13T12:35:00.000Z"),
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
      kind: "coding-activity",
      step: 9,
      label: "Updated the event stream.",
    })
    events.emit({
      kind: "coding-activity",
      step: 9,
      label: "Updated the event stream.",
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
        "coding-activity",
        "coding-activity",
        "phase-changed",
        "command-started",
        "command-finished",
        "phase-changed",
        "step-committed",
        "run-finished",
      ],
    )
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

    const displayed = terminal.join("")
    assert.match(displayed, /Plan example: 11 steps, through step 9/)
    assert.match(displayed, /Step 9\/11: Add progress and transcript adapters/)
    assert.match(displayed, /Phase: checking/)
    assert.match(displayed, /Command started: Repository test \(pnpm test\)/)
    assert.match(displayed, /Command succeeded: Repository test/)
    assert.match(displayed, /Committed step 9: c{12}/)
    assert.match(displayed, /Result: bound-reached/)
    assert.match(
      displayed,
      new RegExp(transcript.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    )
    assert.equal(displayed.match(/Updated the event stream\./g)?.length, 1)
  })
})
