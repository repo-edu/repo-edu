import assert from "node:assert/strict"
import { join } from "node:path"
import { test } from "node:test"
import {
  type Assistant,
  type InteractiveSession,
  type Phase,
  type PhaseInput,
  type PhaseResult,
  type PinnedModel,
  type RoundDependencies,
  unpinned,
} from "../phase.js"
import {
  chainCap,
  chainDecision,
  rebuttalSessionId,
  runBrief,
  runRound,
} from "../round.js"
import { testContext } from "./helpers.js"

/** The brief names its own model, so its seat is the one a round never overrides. */
const briefPin: PinnedModel = {
  model: { value: "gpt-5.6-terra", source: "phase pin" },
  effort: { value: "low", source: "phase pin" },
}

const repoRoot = "/workspace/repo-edu"
const transcript = `${repoRoot}/example-all-01-oth-round.md`
const brief = `${repoRoot}/example-all-01-oul-brief.md`
const ruling = `${repoRoot}/example-all-01-abx-ruling.md`
const verdict = `${repoRoot}/example-all-01-abx-watch.md`
const cacheRoot = "/cache/audit-round"
const ruleWorkflow = join(
  repoRoot,
  ".agents/skills/rule/references/workflow.md",
)
const watchWorkflow = join(
  repoRoot,
  ".agents/skills/verdict/references/workflow.md",
)
/** What every round input carries beyond the plan and the auditor. */
const files = {
  ...testContext(repoRoot),
  transcript,
  verdict,
  cacheRoot,
  nameStart: "example-all-01",
}
const phases = ["audit", "vet", "rebut", "fix", "brief"] as const
/** Every phase in order, including the two the fix's open item adds. */
const rulingPhases = [...phases, "rule", "revise"] as const
/** Every phase in order when the round finishes and the glance calls a watch due. */
const watchPhases = [...phases, "glance", "verdict", "revise"] as const

/**
 * The two ways a round runs past its brief: the fix leaves an open item and the
 * ruling passes follow it, or the round finishes and the glance calls a watch
 * due. Each is walked by the failure, rejection and settling tests.
 */
const endings: readonly (readonly [
  ending: "ruling" | "watch",
  phases: readonly Phase[],
])[] = [
  ["ruling", rulingPhases],
  ["watch", watchPhases],
]

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
    // Most rounds do not move the record far enough, so the watch is off by default.
    glance: { status: "finished", sessionId: "glance-session", due: false },
    verdict: {
      status: "finished",
      sessionId: "verdict-session",
      file: verdict,
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
      async glance(input) {
        await record(input)
        return results.glance
      },
      async verdict(input) {
        await record(input)
        return results.verdict
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

type ControlledRound = ReturnType<typeof controlledRound>

/** Sends a controlled round down one of the two paths past its brief. */
function arrange(round: ControlledRound, ending: "ruling" | "watch"): void {
  if (ending === "ruling")
    round.results.fix = {
      status: "needs-ruling",
      sessionId: "fix-session",
      tier: null,
    }
  else
    round.results.glance = {
      status: "finished",
      sessionId: "glance-session",
      due: true,
    }
}

/** Which assistant a phase seats, as `roundSeating` decides it. */
function runner(
  phase: Phase,
  auditor: Assistant,
  vetAssistant: Assistant,
): Assistant {
  if (phase === "audit" || phase === "rebut") return auditor
  if (phase === "vet") return vetAssistant
  return phase === "fix" || phase === "brief" ? "codex" : "claude"
}

for (const auditor of ["claude", "codex"] as const) {
  const vetAssistant: Assistant = auditor === "claude" ? "codex" : "claude"

  for (const ownerRoot of [repoRoot, "/workspace/plan"]) {
    test(`${auditor} audits with later phases following the report in ${ownerRoot}`, async () => {
      const report = `${ownerRoot}/AUDIT-example.md`
      const round = controlledRound(report)

      const result = await runRound(
        {
          ...files,
          plan: "../plan/example.md",
          scope: "2-3",
          auditor,
        },
        round.dependencies,
      )

      assert.deepEqual(result, { status: "finished", report, tier: null })
      assert.deepEqual(round.calls, [
        {
          phase: "audit",
          assistant: auditor,
          model: unpinned,
          ...testContext(repoRoot),
          ownerRoot: repoRoot,
          arguments: [files.nameStart, "../plan/example.md", "2-3"],
          sessionId: null,
        },
        {
          phase: "vet",
          assistant: vetAssistant,
          model: unpinned,
          ...testContext(repoRoot),
          ownerRoot,
          arguments: [report],
          sessionId: null,
        },
        {
          phase: "rebut",
          assistant: auditor,
          model: unpinned,
          ...testContext(repoRoot),
          ownerRoot,
          arguments: [report],
          sessionId: "audit-session",
        },
        {
          phase: "fix",
          assistant: "codex",
          model: unpinned,
          ...testContext(repoRoot),
          ownerRoot,
          arguments: [report],
          sessionId: null,
        },
        {
          phase: "brief",
          assistant: "codex",
          model: briefPin,
          ...testContext(repoRoot),
          ownerRoot: repoRoot,
          arguments: [transcript],
          sessionId: null,
        },
        {
          phase: "glance",
          assistant: "claude",
          model: unpinned,
          ...testContext(repoRoot),
          ownerRoot: repoRoot,
          arguments: [cacheRoot],
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
      { ...files, plan: "example.md", auditor },
      round.dependencies,
    )

    const session = {
      assistant: "codex",
      model: unpinned,
      sessionId: "fix-session",
      ...testContext(repoRoot),
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
        model: unpinned,
        ...testContext(repoRoot),
        ownerRoot: repoRoot,
        arguments: [transcript, report],
        sessionId: null,
      },
      {
        phase: "revise",
        assistant: "claude",
        model: unpinned,
        ...testContext(repoRoot),
        ownerRoot: repoRoot,
        arguments: [ruleWorkflow, ruling, transcript, report],
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

  for (const [ending, sequence] of endings) {
    for (const phase of sequence) {
      test(`${auditor} round stops at a failed ${phase} on the way to a ${ending} with its recovery identity`, async () => {
        const round = controlledRound()
        arrange(round, ending)
        const failure = {
          status: "failed",
          sessionId: phase === "rebut" ? "audit-session" : `${phase}-session`,
          reason: "Required work remains blocked by a permission refusal",
        } as const
        round.results[phase] = failure

        const result = await runRound(
          { ...files, plan: "example.md", auditor },
          round.dependencies,
        )

        assert.deepEqual(
          round.calls.map((call) => call.phase),
          sequence.slice(0, sequence.indexOf(phase) + 1),
        )
        assert.deepEqual(round.handover, [])
        assert.deepEqual(result, {
          ...failure,
          phase,
          assistant: runner(phase, auditor, vetAssistant),
          model: phase === "brief" ? briefPin : unpinned,
          ...testContext(repoRoot),
        })
      })
    }
  }
}

test("a due glance sends the verdict to a fresh writer and a fresh rewriter", async () => {
  const round = controlledRound()
  arrange(round, "watch")

  const result = await runRound(
    { ...files, plan: "example.md" },
    round.dependencies,
  )

  assert.deepEqual(result, {
    status: "finished",
    report: `${repoRoot}/AUDIT-example.md`,
    tier: null,
  })
  // The watch reads the commit record, so neither pass is given the round's files.
  assert.deepEqual(round.calls.slice(5), [
    {
      phase: "glance",
      assistant: "claude",
      model: unpinned,
      ...testContext(repoRoot),
      ownerRoot: repoRoot,
      arguments: [cacheRoot],
      sessionId: null,
    },
    {
      phase: "verdict",
      assistant: "claude",
      model: unpinned,
      ...testContext(repoRoot),
      ownerRoot: repoRoot,
      arguments: [verdict, cacheRoot],
      sessionId: null,
    },
    {
      phase: "revise",
      assistant: "claude",
      model: unpinned,
      ...testContext(repoRoot),
      ownerRoot: repoRoot,
      arguments: [watchWorkflow, verdict],
      sessionId: null,
    },
  ])
  assert.deepEqual(round.handover, [])
})

test("a round that hands over runs no watch, because its work has not landed", async () => {
  const round = controlledRound()
  arrange(round, "ruling")
  round.results.glance = {
    status: "finished",
    sessionId: "glance-session",
    due: true,
  }

  await runRound({ ...files, plan: "example.md" }, round.dependencies)

  assert.deepEqual(
    round.calls.map((call) => call.phase),
    rulingPhases,
  )
})

test("defaults to Codex and preserves plan arguments as data without inventing a scope", async () => {
  const round = controlledRound()
  const plan = '../plan/a "quoted" plan; $(touch should-not-exist).md'
  await runRound({ ...files, plan }, round.dependencies)

  assert.equal(round.calls[0].assistant, "codex")
  assert.deepEqual(round.calls[0].arguments, [files.nameStart, plan])
})

for (const ruling of [false, true]) {
  test(`commit audit ${ruling ? "hands over after its ruling" : "finishes after its brief"} without a watch`, async () => {
    const round = controlledRound()
    if (ruling) arrange(round, "ruling")
    round.results.glance = {
      status: "finished",
      sessionId: "glance-session",
      due: true,
    }
    const commits = ["HEAD-2", "HEAD-1", "HEAD"] as const
    const result = await runRound({ ...files, commits }, round.dependencies)
    assert.equal(result.status, ruling ? "handed-over" : "finished")
    assert.deepEqual(round.calls[0].arguments, [files.nameStart, ...commits])
    assert.deepEqual(
      round.calls.map((call) => call.phase),
      ruling ? rulingPhases : phases,
    )
  })
}

test("retains a failure before the assistant establishes a session", async () => {
  const round = controlledRound()
  round.results.audit = {
    status: "failed",
    sessionId: null,
    reason: "Unable to start the CLI",
  }
  const result = await runRound(
    { ...files, plan: "example.md" },
    round.dependencies,
  )
  assert.deepEqual(result, {
    ...round.results.audit,
    phase: "audit",
    assistant: "codex",
    model: unpinned,
    ...testContext(repoRoot),
  })
  assert.equal(round.calls.length, 1)
})

for (const [ending, sequence] of endings) {
  for (const phase of sequence) {
    test(`does not start another phase or retry when ${phase} rejects before a ${ending}`, async () => {
      const failure = new Error("Required run-file write failed")
      const round = controlledRound(undefined, async (input) => {
        if (input.phase === phase) throw failure
      })
      arrange(round, ending)

      await assert.rejects(
        runRound({ ...files, plan: "example.md" }, round.dependencies),
        (error) => error === failure,
      )
      assert.deepEqual(
        round.calls.map((call) => call.phase),
        sequence.slice(0, sequence.indexOf(phase) + 1),
      )
      assert.deepEqual(round.handover, [])
    })
  }
}

for (const [ending, sequence] of endings) {
  test(`each phase settles before the next starts on the way to a ${ending}`, {
    timeout: 2000,
  }, async () => {
    const entered = sequence.map(() => Promise.withResolvers<void>())
    const release = sequence.map(() => Promise.withResolvers<void>())
    const round = controlledRound(undefined, async (input) => {
      const index = sequence.indexOf(input.phase)
      entered[index].resolve()
      await release[index].promise
    })
    arrange(round, ending)
    const running = runRound(
      { ...files, plan: "example.md" },
      round.dependencies,
    )

    for (let index = 0; index < sequence.length; index += 1) {
      await entered[index].promise
      assert.equal(round.calls.length, index + 1)
      assert.deepEqual(round.handover, [])
      release[index].resolve()
    }
    assert.equal(
      (await running).status,
      ending === "ruling" ? "handed-over" : "finished",
    )
  })
}

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
      { ...files, plan: "example.md" },
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
      model: unpinned,
      sessionId: "fix-session",
      ...testContext(repoRoot),
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
    { ...files, plan: "example.md" },
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
    { ...files, plan: "example.md" },
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
    assistant: "codex",
    model: briefPin,
    sessionId: "brief-session",
    ...testContext(repoRoot),
    reason: "The transcript could not be read",
  })
})

test("a brief on its own runs only the brief phase over the named transcript", async () => {
  const round = controlledRound()

  const result = await runBrief(
    { ...testContext(repoRoot), transcript },
    round.dependencies,
  )

  assert.deepEqual(result, { status: "finished", brief })
  assert.deepEqual(round.calls, [
    {
      phase: "brief",
      assistant: "codex",
      model: briefPin,
      ...testContext(repoRoot),
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
        session: {
          assistant: "codex",
          model: unpinned,
          sessionId: "fix",
          ...testContext(repoRoot),
        },
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
        model: unpinned,
        ...testContext(repoRoot),
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
