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
import {
  chainCap,
  chainDecision,
  rebuttalSessionId,
  runBrief,
  runRound,
} from "../round.js"

const repoRoot = "/workspace/repo-edu"
const transcript = `${repoRoot}/ROUND-TS-example-all-codex-2026-09-12T22-17-38.md`
const brief = `${repoRoot}/ROUND-TS-example-all-codex-2026-09-12T22-17-38-brief.md`
const ruling = `${repoRoot}/ROUND-TS-example-all-codex-2026-09-12T22-17-38-ruling.md`
const phases = ["audit", "vet", "rebut", "fix", "brief"] as const
/** Every phase in order, including the two the fix's open item adds. */
const rulingPhases = [...phases, "rule", "revise"] as const

/** Room enough that the rebuttal resumes unless a test says otherwise. */
const spaciousContext = { tokens: 100_000, window: 258_000 }

function controlledRound(
  report = `${repoRoot}/AUDIT-example.md`,
  settle: (input: PhaseInput) => Promise<void> = async () => {},
) {
  const calls: PhaseInput[] = []
  const handover: { operation: string; session: InteractiveSession }[] = []
  const results: { [P in Phase]: PhaseResult<P> } = {
    audit: {
      status: "finished",
      sessionId: "audit-session",
      file: report,
      context: spaciousContext,
    },
    vet: {
      status: "finished",
      sessionId: "vet-session",
      file: "/distinct-twins/VET-example.md",
      context: null,
    },
    rebut: {
      status: "finished",
      sessionId: "audit-session",
      file: "/distinct-twins/REBUT-example.md",
      context: null,
    },
    fix: { status: "finished", sessionId: "fix-session", tier: null },
    brief: {
      status: "finished",
      sessionId: "brief-session",
      file: brief,
      context: null,
    },
    rule: {
      status: "finished",
      sessionId: "rule-session",
      file: ruling,
      context: null,
    },
    revise: {
      status: "finished",
      sessionId: "revise-session",
      file: ruling,
      context: null,
    },
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
      async brief(input) {
        await record(input)
        return results.brief
      },
      async rule(input) {
        await record(input)
        return results.rule
      },
      async revise(input) {
        await record(input)
        return results.revise
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
        {
          repoRoot,
          plan: "../plan/example.md",
          scope: "2-3",
          auditor,
          transcript,
        },
        round.dependencies,
      )

      assert.deepEqual(result, { status: "finished", report, tier: null })
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
          assistant: "codex",
          cwd: repoRoot,
          ownerRoot,
          arguments: [report],
          sessionId: null,
        },
        {
          phase: "brief",
          assistant: "claude",
          cwd: repoRoot,
          ownerRoot: repoRoot,
          arguments: [transcript],
          sessionId: null,
        },
      ])
      assert.deepEqual(round.handover, [])
    })
  }

  test(`Codex opens the fresh fix session after the ruling is written with ${auditor} auditing`, async () => {
    const report = `${repoRoot}/AUDIT-example.md`
    const round = controlledRound()
    round.results.fix = {
      status: "needs-ruling",
      sessionId: "fix-session",
      tier: null,
    }

    const result = await runRound(
      { repoRoot, plan: "example.md", auditor, transcript },
      round.dependencies,
    )

    const session = {
      assistant: "codex",
      sessionId: "fix-session",
      cwd: repoRoot,
    }
    assert.deepEqual(
      round.calls.map((call) => call.phase),
      rulingPhases,
    )
    assert.equal(round.calls[3].sessionId, null)
    // Claude drafts the ruling and a fresh Claude session rewrites that draft.
    assert.deepEqual(round.calls.slice(5), [
      {
        phase: "rule",
        assistant: "claude",
        cwd: repoRoot,
        ownerRoot: repoRoot,
        arguments: [transcript, report],
        sessionId: null,
      },
      {
        phase: "revise",
        assistant: "claude",
        cwd: repoRoot,
        ownerRoot: repoRoot,
        arguments: [ruling, transcript, report],
        sessionId: null,
      },
    ])
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

  for (const phase of rulingPhases) {
    test(`${auditor} round stops at a failed ${phase} with its recovery identity`, async () => {
      const round = controlledRound()
      if (phase === "rule" || phase === "revise")
        round.results.fix = {
          status: "needs-ruling",
          sessionId: "fix-session",
          tier: null,
        }
      const failure = {
        status: "failed",
        sessionId: phase === "rebut" ? "audit-session" : `${phase}-session`,
        reason: "Required work remains blocked by a permission refusal",
      } as const
      round.results[phase] = failure

      const result = await runRound(
        { repoRoot, plan: "example.md", auditor, transcript },
        round.dependencies,
      )

      assert.deepEqual(
        round.calls.map((call) => call.phase),
        rulingPhases.slice(0, rulingPhases.indexOf(phase) + 1),
      )
      assert.deepEqual(round.handover, [])
      assert.deepEqual(result, {
        ...failure,
        phase,
        assistant:
          phase === "fix"
            ? "codex"
            : ["brief", "rule", "revise"].includes(phase)
              ? "claude"
              : phase === "vet"
                ? vetter
                : auditor,
        cwd: repoRoot,
      })
    })
  }
}

test("defaults to Codex and preserves plan arguments as data without inventing a scope", async () => {
  const round = controlledRound()
  const plan = '../plan/a "quoted" plan; $(touch should-not-exist).md'
  await runRound({ repoRoot, plan, transcript }, round.dependencies)

  assert.equal(round.calls[0].assistant, "codex")
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
    { repoRoot, plan: "example.md", transcript },
    round.dependencies,
  )
  assert.deepEqual(result, {
    ...round.results.audit,
    phase: "audit",
    assistant: "codex",
    cwd: repoRoot,
  })
  assert.equal(round.calls.length, 1)
})

for (const phase of rulingPhases) {
  test(`does not start another phase or retry when ${phase} rejects`, async () => {
    const failure = new Error("Required run-file write failed")
    const round = controlledRound(undefined, async (input) => {
      if (input.phase === phase) throw failure
    })
    if (phase === "rule" || phase === "revise")
      round.results.fix = {
        status: "needs-ruling",
        sessionId: "fix-session",
        tier: null,
      }

    await assert.rejects(
      runRound(
        { repoRoot, plan: "example.md", transcript },
        round.dependencies,
      ),
      (error) => error === failure,
    )
    assert.deepEqual(
      round.calls.map((call) => call.phase),
      rulingPhases.slice(0, rulingPhases.indexOf(phase) + 1),
    )
    assert.deepEqual(round.handover, [])
  })
}

test("each phase settles before the next starts", {
  timeout: 2000,
}, async () => {
  const entered = rulingPhases.map(() => Promise.withResolvers<void>())
  const release = rulingPhases.map(() => Promise.withResolvers<void>())
  const round = controlledRound(undefined, async (input) => {
    const index = rulingPhases.indexOf(input.phase)
    entered[index].resolve()
    await release[index].promise
  })
  round.results.fix = {
    status: "needs-ruling",
    sessionId: "fix-session",
    tier: null,
  }
  const running = runRound(
    { repoRoot, plan: "example.md", transcript },
    round.dependencies,
  )

  for (let index = 0; index < rulingPhases.length; index += 1) {
    await entered[index].promise
    assert.equal(round.calls.length, index + 1)
    assert.deepEqual(round.handover, [])
    release[index].resolve()
  }
  assert.equal((await running).status, "handed-over")
})

for (const operation of ["prepareHandover", "openSession"] as const) {
  test(`a failed ${operation} retains the fix session without retrying`, async () => {
    const round = controlledRound()
    round.results.fix = {
      status: "needs-ruling",
      sessionId: "fix-session",
      tier: null,
    }
    let attempts = 0
    const result = await runRound(
      { repoRoot, plan: "example.md", transcript },
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

test("the rebuttal answers fresh when the audit leaves no room before compaction", async () => {
  const round = controlledRound()
  round.results.audit = {
    status: "finished",
    sessionId: "audit-session",
    file: `${repoRoot}/AUDIT-example.md`,
    context: { tokens: 228_000, window: 258_000 },
  }

  const result = await runRound(
    { repoRoot, plan: "example.md", transcript },
    round.dependencies,
  )

  assert.equal(result.status, "finished")
  assert.equal(round.calls[2].phase, "rebut")
  assert.equal(round.calls[2].sessionId, null)
  assert.equal(round.calls[2].assistant, "codex")
})

test("an unreported window keeps the resume, and a measured shortfall does not", () => {
  assert.equal(
    rebuttalSessionId("audit", { tokens: 900_000, window: null }),
    "audit",
  )
  assert.equal(rebuttalSessionId("audit", null), "audit")
  // 60k is the rebuttal's reserve and 90% of the window is where Codex summarises.
  assert.equal(
    rebuttalSessionId("audit", { tokens: 120_000, window: 200_000 }),
    "audit",
  )
  assert.equal(
    rebuttalSessionId("audit", { tokens: 120_001, window: 200_000 }),
    null,
  )
})

test("a failed brief stops the round before the ruling is written", async () => {
  const round = controlledRound()
  round.results.fix = {
    status: "needs-ruling",
    sessionId: "fix-session",
    tier: null,
  }
  round.results.brief = {
    status: "failed",
    sessionId: "brief-session",
    reason: "The transcript could not be read",
  }

  const result = await runRound(
    { repoRoot, plan: "example.md", transcript },
    round.dependencies,
  )

  assert.deepEqual(
    round.calls.map((call) => call.phase),
    phases,
  )
  assert.deepEqual(round.handover, [])
  assert.deepEqual(result, {
    status: "failed",
    phase: "brief",
    assistant: "claude",
    sessionId: "brief-session",
    cwd: repoRoot,
    reason: "The transcript could not be read",
  })
})

test("a brief on its own runs only the brief phase over the named transcript", async () => {
  const round = controlledRound()

  const result = await runBrief({ repoRoot, transcript }, round.dependencies)

  assert.deepEqual(result, { status: "finished", brief })
  assert.deepEqual(round.calls, [
    {
      phase: "brief",
      assistant: "claude",
      cwd: repoRoot,
      ownerRoot: repoRoot,
      arguments: [transcript],
      sessionId: null,
    },
  ])
  assert.deepEqual(round.handover, [])
})

const chained = (tier: "a" | "b" | "c" | "d" | null) =>
  ({
    status: "finished",
    report: `${repoRoot}/AUDIT-example.md`,
    tier,
  }) as const

test("a chain keeps the auditor while it lands an A or B finding", () => {
  for (const tier of ["a", "b"] as const)
    for (const auditor of ["claude", "codex"] as const)
      assert.deepEqual(chainDecision(chained(tier), auditor, auditor, 1), {
        next: auditor,
      })
})

test("a chain crosses to the other assistant once findings fall to C, D or clean", () => {
  for (const tier of ["c", "d", null] as const) {
    assert.deepEqual(chainDecision(chained(tier), "codex", "codex", 1), {
      next: "claude",
    })
    assert.deepEqual(chainDecision(chained(tier), "claude", "claude", 1), {
      next: "codex",
    })
  }
})

test("the crossover round is the chain's last, whatever it finds", () => {
  for (const tier of ["a", "b", "c", "d", null] as const)
    assert.deepEqual(chainDecision(chained(tier), "claude", "codex", 2), {
      next: null,
      stop: "crossed",
    })
})

test("a chain still finding A or B ends at the cap without crossing over", () => {
  assert.deepEqual(chainDecision(chained("a"), "codex", "codex", chainCap), {
    next: null,
    stop: "cap",
  })
  assert.deepEqual(
    chainDecision(chained("a"), "codex", "codex", chainCap - 1),
    {
      next: "codex",
    },
  )
})

test("a handover or a failure ends the chain where it stands", () => {
  assert.deepEqual(
    chainDecision(
      {
        status: "handed-over",
        report: `${repoRoot}/AUDIT-example.md`,
        session: { assistant: "codex", sessionId: "fix", cwd: repoRoot },
      },
      "codex",
      "codex",
      1,
    ),
    { next: null, stop: "open" },
  )
  assert.deepEqual(
    chainDecision(
      {
        status: "failed",
        phase: "audit",
        assistant: "codex",
        cwd: repoRoot,
        sessionId: null,
        reason: "Unable to start the CLI",
      },
      "codex",
      "codex",
      1,
    ),
    { next: null, stop: "failed" },
  )
})
