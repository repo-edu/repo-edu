import assert from "node:assert/strict"
import { join } from "node:path"
import { test } from "node:test"
import type { CleanInput } from "../clean.js"
import {
  formatWatchEvidence,
  joinedEpisode,
  type WatchEvidenceInput,
} from "../episode.js"
import {
  type GlanceDecision,
  type GlanceInput,
  glanceDecision,
  type WatchGrade,
} from "../glance.js"
import { phaseWorkflow } from "../phase.js"
import {
  type Assistant,
  type Phase,
  type PhaseInput,
  type PhaseResult,
  type PinnedModel,
  type RoundDependencies,
  runBrief,
  runClose,
  runRound,
  unpinned,
} from "./configured-runner.js"
import {
  areas,
  bullet,
  commit,
  correction,
  episode,
  history,
} from "./episode-fixture.js"
import { testContext } from "./helpers.js"

/** The brief names its own model, so its seat is the one a round never overrides. */
const briefPin: PinnedModel = {
  model: { value: "gpt-5.6-terra", source: "audit-round settings" },
  effort: { value: "low", source: "audit-round settings" },
}

const repoRoot = "/workspace/repo-edu"
const transcript = `${repoRoot}/example-impl-all-01-1-round.oth.md`
const brief = `${repoRoot}/example-impl-all-01-6-brief.oul.md`
const ruling = `${repoRoot}/example-impl-all-01-7-ruling.abx.md`
const watch = `${repoRoot}/example-impl-all-01-9-watch.abx.md`
const cacheRoot = "/cache/audit-round"
const recommendation = {
  decision: "continue",
  assistant: "codex",
  reason: "Another round is worth its cost.",
} as const
const landedRecords = (
  repository: "repo-edu" | "plan",
  subjects: readonly string[],
) =>
  subjects.map((subject, index) => ({
    repository,
    sha: String(index + 1).padStart(40, "0"),
    subject,
    message: subject,
  }))
/** What every round input carries beyond the plan and the auditor. */
const files = {
  ...testContext(repoRoot),
  transcript,
  watch: { file: watch, cacheRoot },
  documents: {
    report: `${repoRoot}/AUDIT-example.md`,
    vet: "/distinct-twins/VET-example.md",
    rebut: "/distinct-twins/REBUT-example.md",
    brief,
    ruling,
  },
}
const phases = ["audit", "vet", "rebut", "fix", "brief"] as const
/** An open decision returns directly from the fix to the user. */
const rulingPhases = ["audit", "vet", "rebut", "fix"] as const
/** Every phase in order when the round finishes and the glance calls a watch due. */
const watchPhases = [...phases, "watch"] as const

/**
 * The fix either leaves an open item for the user or finishes through the brief
 * and a due watch. Each route is walked by the failure, rejection and settling tests.
 */
const endings: readonly (readonly [
  ending: "ruling" | "watch",
  phases: readonly Phase[],
])[] = [
  ["ruling", rulingPhases],
  ["watch", watchPhases],
]

function controlledRound(
  settle: (input: PhaseInput) => Promise<void> = async () => {},
) {
  const calls: PhaseInput[] = []
  const deletedReports: { cwd: string; nameStart: string }[] = []
  const completions: CleanInput[] = []
  const glances: GlanceInput[] = []
  const watchEvidence: WatchEvidenceInput[] = []
  const rulings: string[] = []
  const briefs: string[] = []
  const watchGrades: { cacheRoot: string; stem: string }[] = []
  // Most rounds do not move the record far enough, so the watch is off by default.
  let glance: GlanceDecision = { due: false, text: "No rule holds." }
  let grade: WatchGrade = "green"
  // A close that finished moved its plan unless a test leaves it in place.
  let planRemains = false
  const results: { [P in Phase]: PhaseResult<P> } = {
    audit: {
      status: "finished",
      sessionId: "audit-session",
    },
    vet: {
      status: "finished",
      sessionId: "vet-session",
    },
    rebut: {
      status: "finished",
      sessionId: "rebut-session",
    },
    fix: { status: "finished", sessionId: "fix-session" },
    brief: {
      status: "finished",
      sessionId: "brief-session",
    },
    watch: {
      status: "finished",
      sessionId: "watch-session",
    },
    close: {
      status: "finished",
      sessionId: "close-session",
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
    watchEvidence: async (input) => {
      assert.equal(calls.at(-1)?.phase, "brief")
      watchEvidence.push(input)
      return "Joined evidence including the finished fix"
    },
    watchGrade: async (cacheRoot, stem) => {
      assert.equal(calls.at(-1)?.phase, "watch")
      watchGrades.push({ cacheRoot, stem })
      return grade
    },
    deleteRoundReports: async (cwd, nameStart) => {
      assert.equal(calls.at(-1)?.phase, "fix")
      deletedReports.push({ cwd, nameStart })
      return []
    },
    checkFile: async () => {},
    showBrief: async (document) => {
      briefs.push(document)
    },
    completeClean: async (input) => {
      completions.push(input)
      return { message: "Clean audit recorded", commits: [] }
    },
    readReport: async (_file, kind) => ({
      findings: evidence.findings,
      judgedRepos: ["repo-edu"],
      recommendation: kind === "widening" ? null : recommendation,
    }),
    readVet: async () => evidence.accepted,
    readDocument: async (file) => `Contents of ${file}`,
    readHead: async (root) => `before-${root}`,
    fileExists: async () => planRemains,
    readRecords: async (root, _before, repository) =>
      root === repoRoot ? landedRecords(repository, evidence.subjects) : [],
    finalRecommendation: async (input) => ({
      status: "finished",
      sessionId: input.sessionId,
      recommendation,
    }),
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
      async watch(input) {
        await record(input)
        return results.watch
      },
      async close(input) {
        await record(input)
        return results.close
      },
    },
    async glance(input) {
      glances.push(input)
      return glance
    },
    async requestRuling(document) {
      rulings.push(document)
      return null
    },
  }
  return {
    calls,
    deletedReports,
    completions,
    glances,
    watchEvidence,
    watchGrades,
    rulings,
    briefs,
    results,
    dependencies,
    evidence,
    decide(decision: GlanceDecision) {
      glance = decision
    },
    grade(recorded: WatchGrade) {
      grade = recorded
    },
    leavePlan() {
      planRemains = true
    },
  }
}

const dueDecision: GlanceDecision = {
  due: true,
  text: "An area reached the amber limit of 2 (rule 3).",
}

test("a ruling waits for a reply then resumes the fix through normal completion and watch", async () => {
  const round = controlledRound()
  round.results.fix = { status: "needs-ruling", sessionId: "fix-session" }
  round.decide(dueDecision)
  const shown = Promise.withResolvers<void>()
  const reply = Promise.withResolvers<string | null>()
  const requestRuling = async (document: string) => {
    assert.equal(document, ruling)
    shown.resolve()
    return reply.promise
  }
  const running = runRound(
    { ...files, plan: "example.md", scope: "all" },
    { ...round.dependencies, requestRuling },
  )
  await shown.promise
  assert.deepEqual(
    round.calls.map((call) => call.phase),
    rulingPhases,
  )
  assert.equal(round.deletedReports.length, 0)
  assert.deepEqual(round.briefs, [])
  round.results.fix = { status: "finished", sessionId: "fix-session" }
  reply.resolve("Choose option 1.")
  assert.deepEqual(await running, {
    status: "finished",
    report: files.documents.report,
    cleanAudit: false,
    recommendation,
    watch: "green",
    commits: landedRecords("repo-edu", round.evidence.subjects).map(
      ({ repository, sha }) => ({ repository, sha }),
    ),
  })
  const fixes = round.calls.filter((call) => call.phase === "fix")
  assert.equal(fixes.length, 2)
  assert.deepEqual(fixes[1], {
    ...fixes[0],
    sessionId: "fix-session",
    rulingReply: "Choose option 1.",
  })
  assert.equal(round.deletedReports.length, 1)
  assert.equal(round.glances.length, 1)
  assert.deepEqual(round.briefs, [brief])
  assert.equal(round.calls.filter((call) => call.phase === "brief").length, 1)
  assert.deepEqual(
    round.calls.slice(-2).map((call) => call.phase),
    ["brief", "watch"],
  )
})

test("clarification can leave a decision open without creating a new fix session", async () => {
  const round = controlledRound()
  round.results.fix = { status: "needs-ruling", sessionId: "fix-session" }
  const replies = ["Explain option 2.", "Choose option 1."]
  const requested: string[] = []
  const result = await runRound(
    { ...files, plan: "example.md", scope: "all" },
    {
      ...round.dependencies,
      requestRuling: async (document) => {
        requested.push(document)
        const reply = replies.shift()
        assert.ok(reply)
        if (replies.length === 0)
          round.results.fix = { status: "finished", sessionId: "fix-session" }
        return reply
      },
    },
  )
  assert.equal(result.status, "finished")
  assert.deepEqual(requested, [ruling, ruling])
  assert.deepEqual(
    round.calls.map((call) => call.phase),
    [...rulingPhases, "fix", "fix", "brief"],
  )
  assert.deepEqual(round.briefs, [brief])
  assert.deepEqual(
    round.calls
      .filter((call) => call.phase === "fix")
      .map((call) => call.sessionId),
    [null, "fix-session", "fix-session"],
  )
  assert.equal(round.deletedReports.length, 1)
})

test("a resumed fix failure retains the session and never deletes the reports", async () => {
  const round = controlledRound()
  round.results.fix = { status: "needs-ruling", sessionId: "fix-session" }
  const result = await runRound(
    { ...files, plan: "example.md", scope: "all" },
    {
      ...round.dependencies,
      requestRuling: async () => {
        round.results.fix = {
          status: "failed",
          sessionId: "fix-session",
          reason: "Resume failed",
        }
        return "Choose option 1."
      },
    },
  )
  assert.equal(result.status, "failed")
  if (result.status === "failed") {
    assert.equal(result.phase, "fix")
    assert.equal(result.sessionId, "fix-session")
  }
  assert.equal(round.deletedReports.length, 0)
  assert.equal(round.glances.length, 0)
  assert.deepEqual(round.briefs, [])
  assert.equal(
    round.calls.some((call) => call.phase === "brief"),
    false,
  )
})

for (const grade of ["green", "amber"] as const) {
  test(`a both-repo round with only a plan fix uses the audited topic's ${grade} record`, async () => {
    const repo = history(
      commit("other/impl-1 oth feat(x): other plan", "", ["src/other.ts"]),
      correction(),
      correction(),
    )
    const plan = history(
      commit("example/impl-1 oth docs(x): initial plan", "", ["example.md"]),
    )
    const records = {
      other: {
        heads: { "repo-edu": repo[0].sha },
        grade: "red",
        written: "2026-09-23",
      },
      example: {
        heads: { "repo-edu": repo.at(-1)?.sha },
        grade,
        written: "2026-09-23",
      },
    }
    const landed = {
      ...commit(
        "example/impl-audit-all oth growth-none C1 docs(x): finished fix",
        bullet("section:decisions"),
        ["example.md"],
      ),
      sha: "finished-plan-fix",
    }
    const round = controlledRound(async (input) => {
      if (input.phase === "audit") assert.equal(round.watchEvidence.length, 0)
      if (input.phase === "fix") plan.unshift(landed)
    })
    let computations = 0
    const result = await runRound(
      { ...files, plan: "../plan/archive/example/plan.md", scope: "all" },
      {
        ...round.dependencies,
        readReport: async () => ({
          findings: [1],
          judgedRepos: ["plan", "repo-edu"],
          recommendation,
        }),
        readRecords: async (root, _before, repository) =>
          root === files.planRoot
            ? landedRecords(repository, [landed.subject])
            : [],
        glance: async (input) => {
          assert.equal(input.stem, "example")
          const result = glanceDecision(
            episode(repo, "repo-edu", input.stem),
            records,
          )
          assert.match(result.text, /area:area-a 2/)
          assert.match(
            result.text,
            new RegExp(`episode example recorded ${grade}`),
          )
          return result
        },
        watchEvidence: async (input) => {
          computations++
          assert.equal(round.calls.at(-1)?.phase, "brief")
          assert.ok("stem" in input)
          assert.equal(input.stem, "example")
          return formatWatchEvidence(
            joinedEpisode({ plan, "repo-edu": repo }, input.stem, areas),
          )
        },
      },
    )
    assert.equal(result.status, "finished")
    assert.equal(computations, grade === "amber" ? 1 : 0)
    const watches = round.calls.filter((call) => call.phase === "watch")
    assert.equal(watches.length, grade === "amber" ? 1 : 0)
    if (watches.length === 1) {
      const [writer] = watches
      assert.equal(writer.phase, "watch")
      assert.match(writer.evidence, /finished-plan-fix/)
      assert.equal(writer.arguments.includes(writer.evidence), false)
    }
  })
}

for (const accepted of [false, true]) {
  for (const target of [
    { plan: "example.md", scope: "all" },
    { commits: ["HEAD"] as const },
  ]) {
    test(`a finished ${"plan" in target ? "plan" : "commit"} fix deletes its reports once before the brief with accepted=${accepted}`, async () => {
      const round = controlledRound(async (input) => {
        if (input.phase === "brief")
          assert.deepEqual(round.deletedReports, [
            { cwd: files.planRoot, nameStart: "example-impl-all-01" },
          ])
      })
      round.evidence.accepted = accepted
      assert.equal(
        (await runRound({ ...files, ...target }, round.dependencies)).status,
        "finished",
      )
      assert.equal(round.deletedReports.length, 1)
    })
  }
}

test("clean audits, failed fixes and rulings retain the report set", async () => {
  for (const ending of ["clean", "failed", "needs-ruling"] as const) {
    const round = controlledRound()
    if (ending === "clean") round.evidence.findings = []
    else
      round.results.fix =
        ending === "failed"
          ? {
              status: ending,
              sessionId: "fix-session",
              reason: "Unable to finish",
            }
          : { status: ending, sessionId: "fix-session" }
    await runRound(
      { ...files, plan: "example.md", scope: "all" },
      round.dependencies,
    )
    assert.deepEqual(round.deletedReports, [])
  }
})

for (const [ending, sequence] of endings) {
  for (const phase of sequence.filter((phase) => phase !== "fix")) {
    test(`missing output stops ${phase} before the next phase on the ${ending} route`, async () => {
      const round = controlledRound()
      arrange(round, ending)
      const result = await runRound(
        { ...files, plan: "example.md", scope: "all" },
        {
          ...round.dependencies,
          async checkFile(file) {
            const call = round.calls.at(-1)
            if (call?.phase === phase)
              throw new Error(`Missing output: ${file}`)
          },
        },
      )
      assert.equal(result.status, "failed")
      if (result.status !== "failed") return
      assert.equal(result.phase, phase)
      assert.equal(result.sessionId, `${phase}-session`)
      assert.deepEqual(
        round.calls.map((call) => call.phase),
        sequence.slice(0, sequence.indexOf(phase) + 1),
      )
      assert.deepEqual(round.rulings, [])
    })
  }
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
  return "codex"
}

for (const auditor of ["claude", "codex"] as const) {
  const vetAssistant: Assistant = auditor === "claude" ? "codex" : "claude"

  for (const ownerRoot of [repoRoot, "/workspace/plan"]) {
    test(`${auditor} audit uses the selected workflows at ${ownerRoot}`, async () => {
      const report = files.documents.report
      const round = controlledRound()

      const result = await runRound(
        {
          ...files,
          cwd: ownerRoot,
          plan: "../plan/example.md",
          scope: "2-3",
          auditor,
        },
        round.dependencies,
      )

      assert.deepEqual(result, {
        status: "finished",
        report,
        cleanAudit: false,
        recommendation,
        watch: null,
        commits: landedRecords("repo-edu", round.evidence.subjects).map(
          ({ repository, sha }) => ({ repository, sha }),
        ),
      })
      assert.deepEqual(round.calls, [
        {
          phase: "audit",
          assistant: auditor,
          model: unpinned,
          ...testContext(repoRoot),
          cwd: ownerRoot,
          arguments: [files.documents.report, "../plan/example.md", "2-3"],
          sessionId: null,
        },
        {
          phase: "vet",
          assistant: vetAssistant,
          model: unpinned,
          ...testContext(repoRoot),
          cwd: ownerRoot,
          arguments: [report, files.documents.vet],
          sessionId: null,
        },
        {
          phase: "rebut",
          assistant: auditor,
          model: unpinned,
          ...testContext(repoRoot),
          cwd: ownerRoot,
          arguments: [report, files.documents.vet, files.documents.rebut],
          sessionId: null,
        },
        {
          phase: "fix",
          rulingFile: ruling,
          assistant: "codex",
          model: unpinned,
          ...testContext(repoRoot),
          cwd: ownerRoot,
          arguments: [report, files.documents.vet, files.documents.rebut],
          sessionId: null,
        },
        {
          phase: "brief",
          assistant: "codex",
          model: briefPin,
          ...testContext(repoRoot),
          cwd: ownerRoot,
          arguments: [transcript, brief],
          sessionId: null,
        },
      ])
      // The glance reads the round kind's repository record.
      assert.deepEqual(round.glances, [
        {
          cwd: ownerRoot,
          repoEduRoot: repoRoot,
          repository: "repo-edu",
          cacheRoot,
          stem: "example",
        },
      ])
      for (const call of round.calls) {
        const root = call.phase === "brief" ? repoRoot : ownerRoot
        const skill = call.phase === "brief" ? "brief-round" : call.phase
        assert.equal(
          phaseWorkflow(call),
          join(root, ".agents/skills", skill, "references/workflow.md"),
        )
      }
      assert.deepEqual(round.rulings, [])
    })
  }

  test(`the runner requests a reply after the ruling is written with ${auditor} auditing`, async () => {
    const round = controlledRound()
    round.results.fix = {
      status: "needs-ruling",
      sessionId: "fix-session",
    }

    const result = await runRound(
      { ...files, plan: "example.md", scope: "all", auditor },
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
    assert.equal(round.calls[3].phase, "fix")
    assert.equal(round.calls[3].rulingFile, ruling)
    assert.deepEqual(round.rulings, [ruling])
    assert.deepEqual(result, {
      status: "awaiting-ruling",
      report: `${repoRoot}/AUDIT-example.md`,
      session,
      commits: [],
    })
  })

  for (const [ending, sequence] of endings) {
    for (const phase of sequence) {
      test(`${auditor} round stops at a failed ${phase} on the way to a ${ending} with its recovery identity`, async () => {
        const round = controlledRound()
        arrange(round, ending)
        const failure = {
          status: "failed",
          sessionId: `${phase}-session`,
          reason: "Required work remains blocked by a permission refusal",
        } as const
        round.results[phase] = failure

        const result = await runRound(
          { ...files, plan: "example.md", scope: "all", auditor },
          round.dependencies,
        )

        assert.deepEqual(
          round.calls.map((call) => call.phase),
          sequence.slice(0, sequence.indexOf(phase) + 1),
        )
        assert.deepEqual(round.rulings, [])
        assert.deepEqual(result, {
          ...failure,
          phase,
          assistant: runner(phase, auditor, vetAssistant),
          model: phase === "brief" ? briefPin : unpinned,
          ...testContext(repoRoot),
          commits:
            phase === "brief" || phase === "watch"
              ? landedRecords("repo-edu", round.evidence.subjects).map(
                  ({ repository, sha }) => ({ repository, sha }),
                )
              : [],
        })
      })
    }
  }
}

test("a due glance completes the watch in one fresh session", async () => {
  const round = controlledRound()
  arrange(round, "watch")

  const result = await runRound(
    { ...files, plan: "example.md", scope: "all" },
    round.dependencies,
  )

  assert.deepEqual(result, {
    status: "finished",
    report: `${repoRoot}/AUDIT-example.md`,
    cleanAudit: false,
    recommendation,
    watch: "green",
    commits: landedRecords("repo-edu", round.evidence.subjects).map(
      ({ repository, sha }) => ({ repository, sha }),
    ),
  })
  // The watch reads the commit record, so it receives none of the round's files.
  assert.equal(round.glances.length, 1)
  assert.deepEqual(round.watchGrades, [{ cacheRoot, stem: "example" }])
  assert.deepEqual(round.calls.slice(5), [
    {
      phase: "watch",
      evidence: "Joined evidence including the finished fix",
      assistant: "codex",
      model: unpinned,
      ...testContext(repoRoot),
      arguments: [watch, cacheRoot],
      sessionId: null,
    },
  ])
  assert.deepEqual(round.rulings, [])
})

test("a red watch reaches the round result for the sequence to stop on", async () => {
  const round = controlledRound()
  arrange(round, "watch")
  round.grade("red")

  const result = await runRound(
    { ...files, plan: "example.md", scope: "all" },
    round.dependencies,
  )

  assert.equal(result.status === "finished" && result.watch, "red")
})

test("a watch that leaves no readable record fails its phase", async () => {
  const round = controlledRound()
  arrange(round, "watch")

  const result = await runRound(
    { ...files, plan: "example.md", scope: "all" },
    {
      ...round.dependencies,
      watchGrade: async () => {
        throw new Error("The watch left no readable record for example")
      },
    },
  )

  assert.deepEqual(result, {
    status: "failed",
    sessionId: "watch-session",
    phase: "watch",
    assistant: "codex",
    model: unpinned,
    ...testContext(repoRoot),
    reason: "The watch left no readable record for example",
    commits: landedRecords("repo-edu", round.evidence.subjects).map(
      ({ repository, sha }) => ({ repository, sha }),
    ),
  })
})

test("a round that hands over runs no watch, because its work has not landed", async () => {
  const round = controlledRound()
  arrange(round, "ruling")
  round.decide(dueDecision)

  await runRound(
    { ...files, plan: "example.md", scope: "all" },
    round.dependencies,
  )

  assert.deepEqual(
    round.calls.map((call) => call.phase),
    rulingPhases,
  )
  assert.deepEqual(round.glances, [])
})

test("a planning round glances at the plan repository's record from its own root", async () => {
  const round = controlledRound()
  const planning = testContext(repoRoot, "planning")

  await runRound(
    { ...files, ...planning, plan: "example.md" },
    round.dependencies,
  )

  assert.deepEqual(round.glances, [
    {
      cwd: planning.planRoot,
      repoEduRoot: planning.repoEduRoot,
      repository: "plan",
      cacheRoot,
      stem: "example",
    },
  ])
})

test("a round asked for no watch consults no glance, whatever the record says", async () => {
  const round = controlledRound()
  round.decide(dueDecision)

  const result = await runRound(
    { ...files, watch: null, plan: "example.md", scope: "all" },
    round.dependencies,
  )

  assert.deepEqual(result, {
    status: "finished",
    report: `${repoRoot}/AUDIT-example.md`,
    cleanAudit: false,
    recommendation,
    watch: null,
    commits: landedRecords("repo-edu", round.evidence.subjects).map(
      ({ repository, sha }) => ({ repository, sha }),
    ),
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

  const result = await runRound(
    { ...files, plan: "example.md", scope: "all" },
    {
      ...round.dependencies,
      async glance() {
        throw failure
      },
    },
  )
  assert.deepEqual(result, {
    status: "failed",
    sessionId: null,
    phase: "watch",
    assistant: "codex",
    model: unpinned,
    ...testContext(repoRoot),
    reason: failure.message,
    commits: landedRecords("repo-edu", round.evidence.subjects).map(
      ({ repository, sha }) => ({ repository, sha }),
    ),
  })
  assert.deepEqual(
    round.calls.map((call) => call.phase),
    phases,
  )
})

test("defaults to Codex and preserves plan arguments as data without inventing a scope", async () => {
  const round = controlledRound()
  const plan = '../plan/a "quoted" plan; $(touch should-not-exist).md'
  await runRound(
    { ...files, ...testContext(repoRoot, "planning"), plan },
    round.dependencies,
  )

  assert.equal(round.calls[0].assistant, "codex")
  assert.deepEqual(round.calls[0].arguments, [files.documents.report, plan])
})

for (const ruling of [false, true]) {
  test(`commit audit ${ruling ? "hands over after its ruling" : "finishes after its brief"} without a watch`, async () => {
    const round = controlledRound()
    if (ruling) arrange(round, "ruling")
    round.decide(dueDecision)
    const commits = ["HEAD-2", "HEAD-1", "HEAD"] as const
    const result = await runRound({ ...files, commits }, round.dependencies)
    assert.equal(result.status, ruling ? "awaiting-ruling" : "finished")
    assert.deepEqual(round.glances, [])
    assert.deepEqual(round.calls[0].arguments, [
      files.documents.report,
      ...commits,
    ])
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
    { ...files, plan: "example.md", scope: "all" },
    round.dependencies,
  )
  assert.deepEqual(result, {
    ...round.results.audit,
    phase: "audit",
    assistant: "codex",
    model: unpinned,
    ...testContext(repoRoot),
    commits: [],
  })
  assert.equal(round.calls.length, 1)
})

for (const [ending, sequence] of endings) {
  for (const phase of sequence) {
    test(`does not start another phase or retry when ${phase} rejects before a ${ending}`, async () => {
      const failure = new Error("Required run-file write failed")
      const round = controlledRound(async (input) => {
        if (input.phase === phase) throw failure
      })
      arrange(round, ending)

      const result = await runRound(
        { ...files, plan: "example.md", scope: "all" },
        round.dependencies,
      )
      const call = round.calls.at(-1)
      assert.ok(call)
      assert.deepEqual(result, {
        status: "failed",
        sessionId: null,
        phase,
        assistant: call.assistant,
        model: call.model,
        ...testContext(repoRoot),
        reason: failure.message,
        commits:
          phase === "brief" || phase === "watch"
            ? landedRecords("repo-edu", round.evidence.subjects).map(
                ({ repository, sha }) => ({ repository, sha }),
              )
            : [],
      })
      assert.deepEqual(
        round.calls.map((call) => call.phase),
        sequence.slice(0, sequence.indexOf(phase) + 1),
      )
      assert.deepEqual(round.rulings, [])
    })
  }
}

for (const [ending, sequence] of endings) {
  test(`each phase settles before the next starts on the way to a ${ending}`, {
    timeout: 2000,
  }, async () => {
    const entered = sequence.map(() => Promise.withResolvers<void>())
    const release = sequence.map(() => Promise.withResolvers<void>())
    const round = controlledRound(async (input) => {
      const index = sequence.indexOf(input.phase)
      entered[index].resolve()
      await release[index].promise
    })
    arrange(round, ending)
    const running = runRound(
      { ...files, plan: "example.md", scope: "all" },
      round.dependencies,
    )

    for (let index = 0; index < sequence.length; index += 1) {
      await entered[index].promise
      assert.equal(round.calls.length, index + 1)
      assert.deepEqual(round.rulings, [])
      release[index].resolve()
    }
    assert.equal(
      (await running).status,
      ending === "ruling" ? "awaiting-ruling" : "finished",
    )
  })
}

for (const operation of ["requestRuling"] as const) {
  test(`a failed ${operation} retains the fix session without retrying`, async () => {
    const round = controlledRound()
    round.results.fix = {
      status: "needs-ruling",
      sessionId: "fix-session",
    }
    let attempts = 0
    const result = await runRound(
      { ...files, plan: "example.md", scope: "all" },
      {
        ...round.dependencies,
        async [operation]() {
          attempts += 1
          throw new Error("Ruling input unavailable")
        },
      },
    )

    assert.equal(attempts, 1)
    assert.deepEqual(round.rulings, [])
    assert.deepEqual(result, {
      status: "failed",
      phase: "ruling-input",
      assistant: "codex",
      model: unpinned,
      sessionId: "fix-session",
      ...testContext(repoRoot),
      reason: "Ruling input unavailable",
      commits: [],
    })
  })
}

test("the rebuttal starts fresh for either auditor with the audit selection", async () => {
  for (const auditor of ["claude", "codex"] as const) {
    const round = controlledRound()

    const result = await runRound(
      { ...files, plan: "example.md", scope: "all", auditor },
      round.dependencies,
    )

    assert.equal(result.status, "finished")
    assert.equal(round.calls[2].phase, "rebut")
    assert.equal(round.calls[2].sessionId, null)
    assert.equal(round.calls[2].assistant, auditor)
    assert.deepEqual(round.calls[2].model, round.calls[0].model)
  }
})

test("an automatic rebuttal round replaces the report recommendation before deleting review files", async () => {
  const round = controlledRound()
  const finalRecommendation = {
    decision: "stop",
    reason: "The reconciled findings have converged.",
  } as const
  const result = await runRound(
    {
      ...files,
      plan: "example.md",
      scope: "all",
      auditor: "codex",
      automatic: true,
    },
    {
      ...round.dependencies,
      finalRecommendation: async (input) => {
        assert.equal(round.deletedReports.length, 0)
        assert.equal(input.sessionId, "audit-session")
        assert.equal(input.vet, `Contents of ${files.documents.vet}`)
        assert.equal(input.rebuttal, `Contents of ${files.documents.rebut}`)
        assert.deepEqual(input.records, [
          {
            repository: "repo-edu",
            sha: "0000000000000000000000000000000000000001",
            subject: round.evidence.subjects[0],
            message: round.evidence.subjects[0],
          },
        ])
        return {
          status: "finished",
          sessionId: input.sessionId,
          recommendation: finalRecommendation,
        }
      },
    },
  )

  assert.equal(round.deletedReports.length, 1)
  assert.deepEqual(result, {
    status: "finished",
    report: files.documents.report,
    cleanAudit: false,
    recommendation: finalRecommendation,
    watch: null,
    commits: landedRecords("repo-edu", round.evidence.subjects).map(
      ({ repository, sha }) => ({ repository, sha }),
    ),
  })
})

test("a final recommendation input failure retains the audit session and review files", async () => {
  const round = controlledRound()
  const result = await runRound(
    {
      ...files,
      plan: "example.md",
      scope: "all",
      auditor: "codex",
      automatic: true,
    },
    {
      ...round.dependencies,
      readDocument: async () => {
        throw new Error("Cannot read the review twins")
      },
    },
  )

  assert.equal(round.deletedReports.length, 0)
  assert.equal(result.status, "failed")
  if (result.status !== "failed") return
  assert.equal(result.sessionId, "audit-session")
  assert.equal(result.phase, "audit")
  assert.equal(result.reason, "Cannot read the review twins")
})

for (const auditor of ["claude", "codex"] as const) {
  test(`a clean ${auditor} audit completes without another assistant even when watch is due`, async () => {
    const report = files.documents.report
    const round = controlledRound()
    round.results.audit = {
      status: "finished",
      sessionId: "audit-session",
    }

    round.evidence.findings = []
    round.decide(dueDecision)
    const result = await runRound(
      { ...files, plan: "../plan/example.md", scope: "all", auditor },
      round.dependencies,
    )

    assert.deepEqual(result, {
      status: "finished",
      report,
      cleanAudit: true,
      recommendation,
      watch: null,
      commits: [],
    })
    assert.deepEqual(
      round.calls.map((call) => call.phase),
      ["audit"],
    )
    assert.deepEqual(round.completions, [
      {
        ...files,
        plan: "../plan/example.md",
        auditor,
        report,
        scope: "all",
        judgedRepos: ["repo-edu"],
      },
    ])
    assert.deepEqual(round.glances, [])
    assert.deepEqual(round.rulings, [])
  })
}

test("failed clean bookkeeping stops the round without a fictitious fix session", async () => {
  const round = controlledRound()
  round.evidence.findings = []
  const result = await runRound(
    { ...files, plan: "example.md", scope: "all" },
    {
      ...round.dependencies,
      completeClean: async () => {
        throw new Error("Commit refused")
      },
    },
  )
  assert.equal(result.status, "failed")
  if (result.status !== "failed") return
  assert.equal(result.phase, "complete")
  assert.equal(result.sessionId, null)
  assert.equal(result.reason, "Commit refused")
  assert.deepEqual(
    round.calls.map(({ phase }) => phase),
    ["audit"],
  )
  assert.deepEqual(round.glances, [])
})

for (const auditor of ["claude", "codex"] as const) {
  test(`a vet that accepts every ${auditor} finding skips the rebuttal on the way to the fix`, async () => {
    const report = files.documents.report
    const round = controlledRound()
    round.results.vet = {
      status: "finished",
      sessionId: "vet-session",
    }
    round.results.fix = {
      status: "finished",
      sessionId: "fix-session",
    }

    round.evidence.accepted = true
    round.evidence.subjects = [
      "example/impl-audit-all oth growth-none c1 fix(audit-round): correct",
    ]
    const result = await runRound(
      { ...files, plan: "../plan/example.md", scope: "all", auditor },
      round.dependencies,
    )

    assert.deepEqual(result, {
      status: "finished",
      report,
      cleanAudit: false,
      recommendation,
      watch: null,
      commits: landedRecords("repo-edu", round.evidence.subjects).map(
        ({ repository, sha }) => ({ repository, sha }),
      ),
    })
    // Every verdict is an unconditional accept, so the auditor has nothing to answer.
    assert.deepEqual(
      round.calls.map((call) => call.phase),
      ["audit", "vet", "fix", "brief"],
    )
    assert.deepEqual(round.calls[2], {
      phase: "fix",
      rulingFile: ruling,
      assistant: "codex",
      model: unpinned,
      ...testContext(repoRoot),
      arguments: [report, files.documents.vet],
      sessionId: null,
    })
    assert.deepEqual(round.rulings, [])
  })
}

test("a failed brief after a completed fix stops the round before the watch", async () => {
  const round = controlledRound()
  round.decide(dueDecision)
  round.results.brief = {
    status: "failed",
    sessionId: "brief-session",
    reason: "The transcript could not be read",
  }

  const result = await runRound(
    { ...files, plan: "example.md", scope: "all" },
    round.dependencies,
  )

  assert.deepEqual(
    round.calls.map((call) => call.phase),
    phases,
  )
  assert.deepEqual(round.rulings, [])
  assert.deepEqual(round.briefs, [])
  assert.deepEqual(round.glances, [])
  assert.deepEqual(result, {
    status: "failed",
    phase: "brief",
    assistant: "codex",
    model: briefPin,
    sessionId: "brief-session",
    ...testContext(repoRoot),
    reason: "The transcript could not be read",
    commits: landedRecords("repo-edu", round.evidence.subjects).map(
      ({ repository, sha }) => ({ repository, sha }),
    ),
  })
})

test("a brief display failure retains the brief session for recovery", async () => {
  const round = controlledRound()
  const result = await runBrief(
    { ...testContext(repoRoot), transcript, brief },
    {
      ...round.dependencies,
      showBrief: async () => {
        throw new Error("Cannot write the brief to the terminal")
      },
    },
  )
  assert.deepEqual(result, {
    status: "failed",
    phase: "brief",
    assistant: "codex",
    model: briefPin,
    sessionId: "brief-session",
    ...testContext(repoRoot),
    reason: "Cannot write the brief to the terminal",
  })
})

test("a missing ruling fails the fix before the brief or user input", async () => {
  const round = controlledRound()
  arrange(round, "ruling")
  const result = await runRound(
    { ...files, plan: "example.md", scope: "all" },
    {
      ...round.dependencies,
      async checkFile(file) {
        if (file === ruling) throw new Error("Missing ruling")
      },
    },
  )
  assert.deepEqual(result, {
    status: "failed",
    phase: "fix",
    sessionId: "fix-session",
    assistant: "codex",
    model: unpinned,
    ...testContext(repoRoot),
    reason: "Missing ruling",
    commits: [],
  })
  assert.deepEqual(
    round.calls.map((call) => call.phase),
    ["audit", "vet", "rebut", "fix"],
  )
  assert.deepEqual(round.rulings, [])
  assert.deepEqual(round.deletedReports, [])
})

test("a brief on its own runs only the brief phase over the named transcript", async () => {
  const round = controlledRound()

  const result = await runBrief(
    { ...testContext(repoRoot), transcript, brief },
    round.dependencies,
  )

  assert.deepEqual(result, { status: "finished", brief })
  assert.deepEqual(round.calls, [
    {
      phase: "brief",
      assistant: "codex",
      model: briefPin,
      ...testContext(repoRoot),
      arguments: [transcript, brief],
      sessionId: null,
    },
  ])
  assert.deepEqual(round.rulings, [])
})

for (const reason of [null, "The check cost more than it gave."]) {
  test(`a close${reason === null ? "" : " with an abort reason"} runs only the close phase from the plan checkout`, async () => {
    const round = controlledRound()
    const context = testContext(repoRoot, "planning")
    const plan = join(context.planRoot, "example.md")

    const result = await runClose(
      { ...context, plan, tag: "obh", record: "gpt-6-astra high", reason },
      round.dependencies,
    )

    assert.deepEqual(result, { status: "finished" })
    assert.deepEqual(round.calls, [
      {
        phase: "close",
        assistant: "codex",
        model: unpinned,
        ...context,
        arguments:
          reason === null
            ? [plan, "obh", "gpt-6-astra high"]
            : [plan, "obh", "gpt-6-astra high", reason],
        sessionId: null,
      },
    ])
    assert.equal(
      phaseWorkflow(round.calls[0]),
      join(context.planRoot, ".agents/skills/close/references/workflow.md"),
    )
  })
}

test("a failed close keeps its session for recovery", async () => {
  const round = controlledRound()
  round.results.close = {
    status: "failed",
    sessionId: "close-session",
    reason: "No shared folder for the peer plan",
  }
  const context = testContext(repoRoot, "planning")

  const result = await runClose(
    {
      ...context,
      plan: join(context.planRoot, "example.md"),
      tag: "obh",
      record: "gpt-6-astra high",
      reason: null,
    },
    round.dependencies,
  )

  assert.deepEqual(result, {
    status: "failed",
    sessionId: "close-session",
    reason: "No shared folder for the peer plan",
    phase: "close",
    assistant: "codex",
    model: unpinned,
    ...context,
  })
})

test("a finished close that left its plan at the root fails with its session", async () => {
  const round = controlledRound()
  round.leavePlan()
  const context = testContext(repoRoot, "planning")
  const plan = join(context.planRoot, "example.md")

  const result = await runClose(
    { ...context, plan, tag: "obh", record: "gpt-6-astra high", reason: null },
    round.dependencies,
  )

  assert.deepEqual(result, {
    status: "failed",
    sessionId: "close-session",
    phase: "close",
    assistant: "codex",
    model: unpinned,
    ...context,
    reason: `The finished close left ${plan} at the plan root`,
  })
})

test("the round reads each supplied file and records both heads immediately before the fix", async () => {
  const round = controlledRound()
  const reads: unknown[] = []
  const result = await runRound(
    { ...files, plan: "example.md", scope: "all" },
    {
      ...round.dependencies,
      async readReport(file, kind) {
        reads.push([file, kind])
        return {
          findings: [1, 2],
          judgedRepos: ["repo-edu"],
          recommendation,
        }
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
      async readRecords(root, before, repository) {
        assert.equal(round.calls.at(-1)?.phase, "fix")
        assert.equal(before, `head-${root}`)
        return landedRecords(
          repository,
          root === files.repoEduRoot
            ? [
                "example/impl-audit-all oth growth-none !C1a1 fix(audit-round): repair",
                "example/impl-2 oth feat(audit-round): deliver",
              ]
            : [
                "example/plan-audit ath growth-none B1: correct the plan",
                "example/ready ath: ready",
              ],
        )
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
    cleanAudit: false,
    recommendation,
    watch: null,
    commits: [
      ...landedRecords("repo-edu", [
        "example/impl-audit-all oth growth-none !C1a1 fix(audit-round): repair",
        "example/impl-2 oth feat(audit-round): deliver",
      ]),
      ...landedRecords("plan", [
        "example/plan-audit ath growth-none B1: correct the plan",
        "example/ready ath: ready",
      ]),
    ].map(({ repository, sha }) => ({ repository, sha })),
  })
})

test("landed plan corrections do not make an audit clean", async () => {
  const round = controlledRound()
  const result = await runRound(
    { ...files, plan: "example.md", scope: "all" },
    {
      ...round.dependencies,
      readRecords: async (root, _before, repository) =>
        landedRecords(
          repository,
          root === repoRoot
            ? [
                "example/impl-audit-all oth growth-none d1 fix(audit-round): polish",
              ]
            : ["example/plan-audit ath growth-none A1C2: correct the plan"],
        ),
    },
  )
  assert.equal(result.status === "finished" && result.cleanAudit, false)
})

for (const [reader, phase, sessionId, called] of [
  [
    "deleteRoundReports",
    "fix",
    "fix-session",
    ["audit", "vet", "rebut", "fix"],
  ],
  ["readReport", "audit", "audit-session", ["audit"]],
  ["readVet", "vet", "vet-session", ["audit", "vet"]],
  ["readHead", "fix", null, ["audit", "vet", "rebut"]],
  ["readRecords", "fix", "fix-session", ["audit", "vet", "rebut", "fix"]],
] as const) {
  test(`${reader} failure stops the round with the owning phase and recovery session`, async () => {
    const round = controlledRound()
    const result = await runRound(
      { ...files, plan: "example.md", scope: "all" },
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

test("a finished fix on a plan target requires a landed commit; clean audits use direct completion", async () => {
  for (const target of [
    { plan: "example.md", scope: "all" },
    { commits: ["HEAD"] as const },
  ]) {
    for (const findings of [[], [1]]) {
      const round = controlledRound()
      round.evidence.findings = findings
      round.evidence.subjects = []
      const result = await runRound({ ...files, ...target }, round.dependencies)
      assert.equal(
        result.status,
        "plan" in target && findings.length > 0 ? "failed" : "finished",
      )
      assert.equal(round.completions.length, findings.length === 0 ? 1 : 0)
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
    { ...files, plan: "example.md", scope: "all" },
    {
      ...round.dependencies,
      readRecords: async (root, _before, repository) =>
        landedRecords(
          repository,
          root === repoRoot
            ? ["example/impl-audit-all oth clean: done"]
            : [
                "example/plan-audit ath growth-none B1 docs(x): a kind on a planning record",
              ],
        ),
    },
  )
  assert.equal(result.status, "failed")
  if (result.status === "failed") {
    assert.equal(result.phase, "fix")
    assert.match(result.reason, /no conventional kind/)
  }
  assert.equal(round.calls.at(-1)?.phase, "fix")
})

test("a fix needing a ruling is not graded or required to have landed work", async () => {
  const round = controlledRound()
  arrange(round, "ruling")
  const result = await runRound(
    { ...files, plan: "example.md", scope: "all" },
    {
      ...round.dependencies,
      readRecords: async () => {
        throw new Error("No grade before the ruling")
      },
    },
  )
  assert.equal(result.status, "awaiting-ruling")
})
