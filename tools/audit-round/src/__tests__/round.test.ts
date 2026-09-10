import assert from "node:assert/strict"
import { test } from "node:test"
import type {
  Assistant,
  InteractiveSession,
  Phase,
  PhaseInput,
  PhaseResult,
  RoundDependencies,
} from "../phase.js"
import { runRound } from "../round.js"

const repoRoot = "/workspace/repo-edu"
const phases = ["audit", "vet", "rebut", "fix"] as const

function controlledRound(
  report = `${repoRoot}/AUDIT-example.md`,
  settle: (input: PhaseInput) => Promise<void> = async () => {},
) {
  const calls: PhaseInput[] = []
  const handover: { operation: string; session: InteractiveSession }[] = []
  const results: { [P in Phase]: PhaseResult<P> } = {
    audit: { status: "finished", sessionId: "audit-session", file: report },
    vet: {
      status: "finished",
      sessionId: "vet-session",
      file: "/distinct-twins/VET-example.md",
    },
    rebut: {
      status: "finished",
      sessionId: "audit-session",
      file: "/distinct-twins/REBUT-example.md",
    },
    fix: { status: "finished", sessionId: "fix-session" },
  }
  async function record(input: PhaseInput) {
    calls.push(input)
    await settle(input)
  }
  const dependencies: RoundDependencies = {
    runPhase: {
      async audit(input) {
        await record(input)
        return results.audit
      },
      async vet(input) {
        await record(input)
        return results.vet
      },
      async rebut(input) {
        await record(input)
        return results.rebut
      },
      async fix(input) {
        await record(input)
        return results.fix
      },
    },
    async prepareHandover(session) {
      handover.push({ operation: "prepare", session })
    },
    async openSession(session) {
      handover.push({ operation: "open", session })
    },
  }
  return { calls, handover, results, dependencies }
}

for (const auditor of ["claude", "codex"] as const) {
  const vetter: Assistant = auditor === "claude" ? "codex" : "claude"

  for (const ownerRoot of [repoRoot, "/workspace/plan"]) {
    test(`${auditor} audits with later phases following the report in ${ownerRoot}`, async () => {
      const report = `${ownerRoot}/AUDIT-example.md`
      const round = controlledRound(report)

      const result = await runRound(
        { repoRoot, plan: "../plan/example.md", scope: "2-3", auditor },
        round.dependencies,
      )

      assert.deepEqual(result, { status: "finished", report })
      assert.deepEqual(round.calls, [
        {
          phase: "audit",
          assistant: auditor,
          cwd: repoRoot,
          ownerRoot: repoRoot,
          arguments: ["../plan/example.md", "2-3"],
          sessionId: null,
        },
        {
          phase: "vet",
          assistant: vetter,
          cwd: repoRoot,
          ownerRoot,
          arguments: [report],
          sessionId: null,
        },
        {
          phase: "rebut",
          assistant: auditor,
          cwd: repoRoot,
          ownerRoot,
          arguments: [report],
          sessionId: "audit-session",
        },
        {
          phase: "fix",
          assistant: vetter,
          cwd: repoRoot,
          ownerRoot,
          arguments: [report],
          sessionId: null,
        },
      ])
      assert.deepEqual(round.handover, [])
    })
  }

  test(`${vetter} opens the fresh fix session after a ruling request`, async () => {
    const round = controlledRound()
    round.results.fix = { status: "needs-ruling", sessionId: "fix-session" }

    const result = await runRound(
      { repoRoot, plan: "example.md", auditor },
      round.dependencies,
    )

    const session = {
      assistant: vetter,
      sessionId: "fix-session",
      cwd: repoRoot,
    }
    assert.deepEqual(
      round.calls.map((call) => call.phase),
      phases,
    )
    assert.equal(round.calls[3].sessionId, null)
    assert.deepEqual(round.handover, [
      { operation: "prepare", session },
      { operation: "open", session },
    ])
    assert.deepEqual(result, {
      status: "handed-over",
      report: `${repoRoot}/AUDIT-example.md`,
      session,
    })
  })

  for (const phase of phases) {
    test(`${auditor} round stops at a failed ${phase} with its recovery identity`, async () => {
      const round = controlledRound()
      const failure = {
        status: "failed",
        sessionId: phase === "rebut" ? "audit-session" : `${phase}-session`,
        reason: "Required work remains blocked by a permission refusal",
      } as const
      round.results[phase] = failure

      const result = await runRound(
        { repoRoot, plan: "example.md", auditor },
        round.dependencies,
      )

      assert.deepEqual(
        round.calls.map((call) => call.phase),
        phases.slice(0, phases.indexOf(phase) + 1),
      )
      assert.deepEqual(round.handover, [])
      assert.deepEqual(result, {
        ...failure,
        phase,
        assistant: phase === "audit" || phase === "rebut" ? auditor : vetter,
        cwd: repoRoot,
      })
    })
  }
}

test("defaults to Claude and preserves plan arguments as data without inventing a scope", async () => {
  const round = controlledRound()
  const plan = '../plan/a "quoted" plan; $(touch should-not-exist).md'
  await runRound({ repoRoot, plan }, round.dependencies)

  assert.equal(round.calls[0].assistant, "claude")
  assert.deepEqual(round.calls[0].arguments, [plan])
})

test("retains a failure before the assistant establishes a session", async () => {
  const round = controlledRound()
  round.results.audit = {
    status: "failed",
    sessionId: null,
    reason: "Unable to start the CLI",
  }
  const result = await runRound(
    { repoRoot, plan: "example.md" },
    round.dependencies,
  )
  assert.deepEqual(result, {
    ...round.results.audit,
    phase: "audit",
    assistant: "claude",
    cwd: repoRoot,
  })
  assert.equal(round.calls.length, 1)
})

for (const phase of phases) {
  test(`does not start another phase or retry when ${phase} rejects`, async () => {
    const failure = new Error("Required run-file write failed")
    const round = controlledRound(undefined, async (input) => {
      if (input.phase === phase) throw failure
    })

    await assert.rejects(
      runRound({ repoRoot, plan: "example.md" }, round.dependencies),
      (error) => error === failure,
    )
    assert.deepEqual(
      round.calls.map((call) => call.phase),
      phases.slice(0, phases.indexOf(phase) + 1),
    )
    assert.deepEqual(round.handover, [])
  })
}

test("each phase settles before the next starts", {
  timeout: 2000,
}, async () => {
  const entered = phases.map(() => Promise.withResolvers<void>())
  const release = phases.map(() => Promise.withResolvers<void>())
  const round = controlledRound(undefined, async (input) => {
    const index = phases.indexOf(input.phase)
    entered[index].resolve()
    await release[index].promise
  })
  const running = runRound({ repoRoot, plan: "example.md" }, round.dependencies)

  for (let index = 0; index < phases.length; index += 1) {
    await entered[index].promise
    assert.equal(round.calls.length, index + 1)
    assert.deepEqual(round.handover, [])
    release[index].resolve()
  }
  assert.equal((await running).status, "finished")
})

for (const operation of ["prepareHandover", "openSession"] as const) {
  test(`a failed ${operation} retains the fix session without retrying`, async () => {
    const round = controlledRound()
    round.results.fix = { status: "needs-ruling", sessionId: "fix-session" }
    let attempts = 0
    const result = await runRound(
      { repoRoot, plan: "example.md" },
      {
        ...round.dependencies,
        async [operation]() {
          attempts += 1
          throw new Error("Handover unavailable")
        },
      },
    )

    assert.equal(attempts, 1)
    assert.deepEqual(
      round.handover.map((call) => call.operation),
      operation === "prepareHandover" ? [] : ["prepare"],
    )
    assert.deepEqual(result, {
      status: "failed",
      phase: "handover",
      assistant: "codex",
      sessionId: "fix-session",
      cwd: repoRoot,
      reason: "Handover unavailable",
    })
  })
}
