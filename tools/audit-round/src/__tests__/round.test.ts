import assert from "node:assert/strict"
import { join } from "node:path"
import { test } from "node:test"
import type { GlanceDecision, GlanceInput } from "../glance.js"
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
/** Both edit passes name Codex's base tier, whoever audited. */
const editPin: PinnedModel = {
  model: { value: "gpt-5.6-sol", source: "phase pin" },
  effort: { value: "medium", source: "phase pin" },
}

const repoRoot = "/workspace/repo-edu"
const transcript = `${repoRoot}/example-all-01-oth-round.md`
const brief = `${repoRoot}/example-all-01-oul-brief.md`
const ruling = `${repoRoot}/example-all-01-abx-ruling.md`
const watch = `${repoRoot}/example-all-01-abx-watch.md`
const cacheRoot = "/cache/audit-round"
/** What every round input carries beyond the plan and the auditor. */
const files = {
  ...testContext(repoRoot),
  transcript,
  watch: { file: watch, cacheRoot },
  nameStart: "example-all-01",
}
const phases = ["audit", "vet", "rebut", "fix", "brief"] as const
/** Every phase in order, including the two the fix's open item adds. */
const rulingPhases = [...phases, "rule", "rule-edit"] as const
/** Every phase in order when the round finishes and the glance calls a watch due. */
const watchPhases = [...phases, "watch", "watch-edit"] as const

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
  const glances: GlanceInput[] = []
  const handover: { operation: string; session: InteractiveSession }[] = []
  // Most rounds do not move the record far enough, so the watch is off by default.
  let glance: GlanceDecision = { due: false, text: "No rule holds." }
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
    fix: { status: "finished", sessionId: "fix-session" },
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
    "rule-edit": {
      status: "finished",
      sessionId: "rule-edit-session",
      file: ruling,
      context: null,
    },
    "watch-edit": {
      status: "finished",
      sessionId: "watch-edit-session",
      file: watch,
      context: null,
    },
    watch: {
      status: "finished",
      sessionId: "watch-session",
      file: watch,
      context: null,
    },
  }
  async function record(input: PhaseInput) {
    calls.push(input)
    await settle(input)
  }
  const evidence = {
    findings: [1],
    accepted: false,
    subjects: ["example/impl-audit-all oth clean: settled"],
  }
  const dependencies: RoundDependencies = {
    readReport: async () => evidence.findings,
    readVet: async () => evidence.accepted,
    readHead: async (root) => `before-${root}`,
    readSubjects: async (root) => (root === repoRoot ? evidence.subjects : []),
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
      async "rule-edit"(input) {
        await record(input)
        return results["rule-edit"]
      },
      async "watch-edit"(input) {
        await record(input)
        return results["watch-edit"]
      },
      async watch(input) {
        await record(input)
        return results.watch
      },
    },
    async glance(input) {
      glances.push(input)
      return glance
    },
    async prepareHandover(session) {
      handover.push({ operation: "prepare", session })
    },
    async openSession(session) {
      handover.push({ operation: "open", session })
    },
  }
  return {
    calls,
    glances,
    handover,
    results,
    dependencies,
    evidence,
    decide(decision: GlanceDecision) {
      glance = decision
    },
  }
}

const dueDecision: GlanceDecision = {
  due: true,
  text: "An area reached the amber limit of 2 (rule 3).",
}

type ControlledRound = ReturnType<typeof controlledRound>

/** Sends a controlled round down one of the two paths past its brief. */
function arrange(round: ControlledRound, ending: "ruling" | "watch"): void {
  if (ending === "ruling")
    round.results.fix = {
      status: "needs-ruling",
      sessionId: "fix-session",
    }
  else round.decide(dueDecision)
}

/** Which assistant a phase seats, as `roundSeating` decides it. */
function runner(
  phase: Phase,
  auditor: Assistant,
  vetAssistant: Assistant,
): Assistant {
  if (phase === "audit" || phase === "rebut") return auditor
  if (phase === "vet") return vetAssistant
  return phase === "rule" || phase === "watch" ? "claude" : "codex"
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
      ])
      // The glance reads the invoking repository's record, never the report's.
      assert.deepEqual(round.glances, [
        { cwd: repoRoot, repository: "repo-edu", cacheRoot },
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
        phase: "rule-edit",
        assistant: "codex",
        model: editPin,
        ...testContext(repoRoot),
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
          model:
            phase === "brief"
              ? briefPin
              : phase === "rule-edit" || phase === "watch-edit"
                ? editPin
                : unpinned,
          ...testContext(repoRoot),
        })
      })
    }
  }
}

test("a due glance sends the watch to a fresh writer and a fresh rewriter", async () => {
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
  assert.equal(round.glances.length, 1)
  assert.deepEqual(round.calls.slice(5), [
    {
      phase: "watch",
      assistant: "claude",
      model: unpinned,
      ...testContext(repoRoot),
      ownerRoot: repoRoot,
      arguments: [watch, cacheRoot],
      sessionId: null,
    },
    {
      phase: "watch-edit",
      assistant: "codex",
      model: editPin,
      ...testContext(repoRoot),
      ownerRoot: repoRoot,
      arguments: [watch],
      sessionId: null,
    },
  ])
  assert.deepEqual(round.handover, [])
})

test("a round that hands over runs no watch, because its work has not landed", async () => {
  const round = controlledRound()
  arrange(round, "ruling")
  round.decide(dueDecision)

  await runRound({ ...files, plan: "example.md" }, round.dependencies)

  assert.deepEqual(
    round.calls.map((call) => call.phase),
    rulingPhases,
  )
  assert.deepEqual(round.glances, [])
})

test("a planning round glances at the plan repository's record from its own root", async () => {
  const round = controlledRound("/workspace/plan/AUDIT-example.md")
  const planning = testContext(repoRoot, "planning")

  await runRound(
    { ...files, ...planning, plan: "example.md" },
    round.dependencies,
  )

  assert.deepEqual(round.glances, [
    { cwd: planning.planRoot, repository: "plan", cacheRoot },
  ])
})

test("a round asked for no watch consults no glance, whatever the record says", async () => {
  const round = controlledRound()
  round.decide(dueDecision)

  const result = await runRound(
    { ...files, watch: null, plan: "example.md" },
    round.dependencies,
  )

  assert.deepEqual(result, {
    status: "finished",
    report: `${repoRoot}/AUDIT-example.md`,
    tier: null,
  })
  assert.deepEqual(round.glances, [])
  assert.deepEqual(
    round.calls.map((call) => call.phase),
    phases,
  )
})

test("a glance that cannot read the record stops the round before any watch pass", async () => {
  const round = controlledRound()
  const failure = new Error("git log failed")

  await assert.rejects(
    runRound(
      { ...files, plan: "example.md" },
      {
        ...round.dependencies,
        async glance() {
          throw failure
        },
      },
    ),
    (error) => error === failure,
  )
  assert.deepEqual(
    round.calls.map((call) => call.phase),
    phases,
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
    round.decide(dueDecision)
    const commits = ["HEAD-2", "HEAD-1", "HEAD"] as const
    const result = await runRound({ ...files, commits }, round.dependencies)
    assert.equal(result.status, ruling ? "handed-over" : "finished")
    assert.deepEqual(round.glances, [])
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

for (const auditor of ["claude", "codex"] as const) {
  test(`a clean ${auditor} audit goes straight to the fix, which lands the clean record`, async () => {
    const report = "/workspace/plan/AUDIT-example.md"
    const round = controlledRound(report)
    round.results.audit = {
      status: "finished",
      sessionId: "audit-session",
      file: report,
      context: spaciousContext,
    }

    round.evidence.findings = []
    const result = await runRound(
      { ...files, plan: "../plan/example.md", auditor },
      round.dependencies,
    )

    assert.deepEqual(result, { status: "finished", report, tier: null })
    // Nothing to grade and nothing to answer, so neither exchange phase runs.
    assert.deepEqual(
      round.calls.map((call) => call.phase),
      ["audit", "fix", "brief"],
    )
    assert.deepEqual(round.calls[1], {
      phase: "fix",
      assistant: "codex",
      model: unpinned,
      ...testContext(repoRoot),
      ownerRoot: "/workspace/plan",
      arguments: [report],
      sessionId: null,
    })
    assert.deepEqual(round.handover, [])
  })
}

for (const auditor of ["claude", "codex"] as const) {
  test(`a vet that accepts every ${auditor} finding skips the rebuttal on the way to the fix`, async () => {
    const report = "/workspace/plan/AUDIT-example.md"
    const round = controlledRound(report)
    round.results.vet = {
      status: "finished",
      sessionId: "vet-session",
      file: "/workspace/plan/VET-example.md",
      context: null,
    }
    round.results.fix = {
      status: "finished",
      sessionId: "fix-session",
    }

    round.evidence.accepted = true
    round.evidence.subjects = [
      "example/impl-audit-all oth c1 fix(audit-round): correct",
    ]
    const result = await runRound(
      { ...files, plan: "../plan/example.md", auditor },
      round.dependencies,
    )

    assert.deepEqual(result, { status: "finished", report, tier: "c" })
    // Every verdict is an unconditional accept, so the auditor has nothing to answer.
    assert.deepEqual(
      round.calls.map((call) => call.phase),
      ["audit", "vet", "fix", "brief"],
    )
    assert.deepEqual(round.calls[2], {
      phase: "fix",
      assistant: "codex",
      model: unpinned,
      ...testContext(repoRoot),
      ownerRoot: "/workspace/plan",
      arguments: [report],
      sessionId: null,
    })
    assert.deepEqual(round.handover, [])
  })
}

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

test("the round reads each returned file and records both heads immediately before the fix", async () => {
  const round = controlledRound()
  const reads: unknown[] = []
  const result = await runRound(
    { ...files, plan: "example.md" },
    {
      ...round.dependencies,
      async readReport(file, kind) {
        reads.push([file, kind])
        return [1, 2]
      },
      async readVet(file, findings) {
        reads.push([file, findings])
        return false
      },
      async readHead(root) {
        assert.deepEqual(
          round.calls.map((call) => call.phase),
          ["audit", "vet", "rebut"],
        )
        return `head-${root}`
      },
      async readSubjects(root, before) {
        assert.equal(round.calls.at(-1)?.phase, "fix")
        assert.equal(before, `head-${root}`)
        return root === files.repoEduRoot
          ? [
              "example/impl-audit-all oth !C1a1 fix(audit-round): repair",
              "example/impl-2 oth feat(audit-round): deliver",
            ]
          : [
              "example/audit ath B1: correct the plan",
              "example/ready ath: ready",
            ]
      },
    },
  )
  assert.deepEqual(reads, [
    [`${repoRoot}/AUDIT-example.md`, "implementation"],
    ["/distinct-twins/VET-example.md", [1, 2]],
  ])
  assert.deepEqual(result, {
    status: "finished",
    report: `${repoRoot}/AUDIT-example.md`,
    tier: "a",
  })
})

test("a directed plan correction participates in the chain grade", async () => {
  const round = controlledRound()
  const result = await runRound(
    { ...files, plan: "example.md" },
    {
      ...round.dependencies,
      readSubjects: async (root) =>
        root === repoRoot
          ? ["example/impl-audit-all oth d1 fix(audit-round): polish"]
          : ["example/audit ath A1C2: correct the plan"],
    },
  )
  assert.equal(result.status === "finished" && result.tier, "a")
})

for (const [reader, phase, sessionId, called] of [
  ["readReport", "audit", "audit-session", ["audit"]],
  ["readVet", "vet", "vet-session", ["audit", "vet"]],
  ["readHead", "fix", null, ["audit", "vet", "rebut"]],
  ["readSubjects", "fix", "fix-session", ["audit", "vet", "rebut", "fix"]],
] as const) {
  test(`${reader} failure stops the round with the owning phase and recovery session`, async () => {
    const round = controlledRound()
    const result = await runRound(
      { ...files, plan: "example.md" },
      {
        ...round.dependencies,
        [reader]: async () => {
          throw new Error("Unreadable evidence")
        },
      },
    )
    assert.equal(result.status, "failed")
    if (result.status !== "failed") return
    assert.equal(result.phase, phase)
    assert.equal(result.sessionId, sessionId)
    assert.equal(result.reason, "Unreadable evidence")
    assert.deepEqual(
      round.calls.map((call) => call.phase),
      called,
    )
    assert.deepEqual(round.glances, [])
  })
}

test("every plan target requires a landed commit, while commit targets may land nothing", async () => {
  for (const target of [
    { plan: "example.md" },
    { commits: ["HEAD"] as const },
  ]) {
    for (const findings of [[], [1]]) {
      const round = controlledRound()
      round.evidence.findings = findings
      round.evidence.subjects = []
      const result = await runRound({ ...files, ...target }, round.dependencies)
      assert.equal(result.status, "plan" in target ? "failed" : "finished")
      if (result.status === "failed") {
        assert.equal(
          result.reason,
          "The finished fix landed no commit for a plan target",
        )
        assert.equal(result.phase, "fix")
        assert.equal(result.sessionId, "fix-session")
        assert.equal(round.calls.at(-1)?.phase, "fix")
        assert.deepEqual(round.glances, [])
      }
    }
  }
})

test("every landed subject must parse under its repository's grammar", async () => {
  const round = controlledRound()
  const result = await runRound(
    { ...files, plan: "example.md" },
    {
      ...round.dependencies,
      readSubjects: async (root) =>
        root === repoRoot
          ? ["example/impl-audit-all oth clean: done"]
          : ["example/audit ath b1: invalid lowercase plan sequence"],
    },
  )
  assert.equal(result.status, "failed")
  if (result.status === "failed") {
    assert.equal(result.phase, "fix")
    assert.match(result.reason, /bare/)
  }
  assert.equal(round.calls.at(-1)?.phase, "fix")
})

test("a fix needing a ruling is not graded or required to have landed work", async () => {
  const round = controlledRound()
  arrange(round, "ruling")
  const result = await runRound(
    { ...files, plan: "example.md" },
    {
      ...round.dependencies,
      readSubjects: async () => {
        throw new Error("No grade before the ruling")
      },
    },
  )
  assert.equal(result.status, "handed-over")
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
