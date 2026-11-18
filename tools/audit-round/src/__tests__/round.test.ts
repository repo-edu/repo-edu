import assert from "node:assert/strict"
import { basename, join } from "node:path"
import { test } from "node:test"
import type { CleanInput } from "../clean.js"
import { resolveTargets } from "../default-target.js"
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
import type { SeriesEvidence } from "../judge.js"
import type { LifecycleCommit } from "../lifecycle.js"
import {
  panelPhases,
  phaseWorkflow,
  type RulerScope,
  type RulingRequest,
} from "../phase.js"
import {
  continuedSetup,
  openSeriousFindings,
  rulerFindings,
  runRound as runRoundOn,
  seriousFindings,
} from "../round.js"
import type {
  FindingRebuttal,
  ImplementationRoundData,
  LandedCommit,
  PlanningRoundData,
  ReportFinding,
  RoundAccount,
  RoundFinding,
  RoundFindingReview,
} from "../round-data.js"
import type { RulingInput } from "../ruling-wait.js"
import { RunClock } from "../run-clock.js"
import { type CommitGroup, targetRequest } from "../target.js"
import type { VetReading } from "../vet.js"
import {
  type Assistant,
  roundRun as allocateRound,
  type LandedRecord,
  type Phase,
  type PhaseInput,
  type PhaseResult,
  pinned,
  pinnedCoder,
  type RoundDependencies,
  RoundOutput,
  runClose,
  runRound as runRoundWithAccount,
  testSettings,
  testVetter,
  testWatch,
} from "./configured-runner.js"
import {
  areas,
  bullet,
  commit,
  correction,
  episode,
  history,
} from "./episode-fixture.js"
import { releases, testContext, testSetup } from "./helpers.js"
import { commitFixture, roundFixture } from "./round-fixture.js"

const repoRoot = "/workspace/repo-edu"
const transcript = `${repoRoot}/example-impl-audit-01..01-01-1-round.oth.md`
const ruling = `${repoRoot}/example-impl-audit-01..01-01-7-ruling.abx.md`
const watch = `${repoRoot}/example-impl-audit-01..01-01-9-watch.abx.md`
const cacheRoot = "/cache/audit-round"
const watchEvidenceText = "joined watch evidence"
const seriesSelection = { model: "fixture-model", effort: "high" }

function implementationRead(
  assistant: Assistant,
  round: number,
  status: ImplementationRoundData["status"] = "finished",
): ImplementationRoundData {
  const auditor = testSettings.implementationAudit.auditors.find(
    (entry) => entry.assistant === assistant,
  )
  assert.ok(auditor)
  return {
    target: "example-impl-audit-01..01",
    round,
    tag: assistant === "claude" ? "abh" : "obh",
    started: `2026-11-08T1${round}:00:00Z`,
    status,
    settings: {
      vetters: [{ assistant: "claude", ...seriesSelection }],
      fix: { assistant: "codex", ...seriesSelection },
    },
    auditor: { ...auditor, chosenBy: "settings" },
    phases: [],
    commits: [{ repository: "repo-edu", sha: String(round).repeat(40) }],
    findings: [],
    judge: null,
    scope: "1",
    judgedRepos: ["repo-edu"],
  }
}
const reportFinding: ReportFinding = {
  number: 1,
  title: "Fixture finding",
  tier: "B",
  reach: "developer",
  complexity: "none",
  growthPattern: "none",
  location: { kind: "repo-edu", area: "tool-audit-round", covers: [] },
}

const fixPhaseStamp = [
  "audit, rebut: gpt-5.6-sol high",
  "vet: claude-opus-5 high",
  "fix: gpt-5.6-sol high",
  "Audit, vet and rebuttal took 3 min.",
].join("\n")

function commitTarget(group: CommitGroup) {
  return { originalGroups: [group] as const, groups: [group] as const }
}
const secondReportFinding: ReportFinding = {
  ...reportFinding,
  number: 2,
  title: "Second fixture finding",
  tier: "C",
}
const landedRecords = (
  repository: "repo-edu" | "plan",
  subjects: readonly string[],
) =>
  subjects.map((subject, index) => ({
    repository,
    sha: String(index + 1).padStart(40, "0"),
    subject,
    message: `${subject}\n\n${fixPhaseStamp}\n`,
  }))
/** The round's one vet report; its name carries the vetter's tag. */
const vetTag = "abh"
const vetReport = `/distinct-twins/example-impl-audit-01..01-01-3-vet.${vetTag}.md`
/** What every round input carries beyond the plan and the auditor. */
const files = {
  ...testSetup(repoRoot),
  transcript,
  watch: { file: watch, cacheRoot },
  documents: {
    report: `${repoRoot}/AUDIT-example.md`,
    vets: [vetReport],
    rebut: "/distinct-twins/REBUT-example.md",
    ruler: "/distinct-twins/RULE-example.md",
    ruling,
  },
}
/** The phases up to the fix, where an open decision returns to the user. */
const phases = ["audit", "vet", "rebut", "fix"] as const
/** Every phase in order when the round finishes and the glance calls a watch due. */
const watchPhases = [...phases, "watch"] as const

function withoutAccount<T extends object>(result: T): Omit<T, "account"> {
  const { account: _account, ...rest } = result as T & {
    readonly account?: unknown
  }
  return rest
}

const runRound: typeof runRoundWithAccount = async (...arguments_) =>
  withoutAccount(await runRoundWithAccount(...arguments_)) as Awaited<
    ReturnType<typeof runRoundWithAccount>
  >

/**
 * The fix either leaves an open item for the user or finishes through a due
 * watch. Each route is walked by the failure, rejection and settling tests.
 */
const endings: readonly (readonly [
  ending: "ruling" | "watch",
  phases: readonly Exclude<Phase, "implement">[],
])[] = [
  ["ruling", phases],
  ["watch", watchPhases],
]

/** What the fake close move reports for one plan. */
function closedFiles(stem: string) {
  return { folder: `/evidence/${stem}`, names: [`${stem}-close.obh.log`] }
}

function controlledRound(
  settle: (input: PhaseInput) => Promise<void> = async () => {},
) {
  const calls: PhaseInput[] = []
  const completions: CleanInput[] = []
  const glances: GlanceInput[] = []
  const watchEvidence: WatchEvidenceInput[] = []
  const watchDocuments: { file: string; document: string }[] = []
  const watchRecords: Parameters<RoundDependencies["writeWatchRecord"]>[0][] =
    []
  const rulings: RulingRequest[] = []
  const archived: { stem: string; tag: string; record: string }[] = []
  const moved: string[] = []
  // A close finds round data to archive only when a test says it has some.
  let roundDataCommit: LifecycleCommit | null = null
  const settledWrites: {
    commits: readonly LandedCommit[]
    account: RoundAccount
  }[] = []
  // Most rounds do not move the record far enough, so the watch is off by default.
  let glance: GlanceDecision = { due: false, text: "No rule holds." }
  // A close that finished moved its plan unless a test leaves it in place.
  let planRemains = false
  // The reports a stopped round kept, and those of them their readers refuse.
  // A phase that runs writes its report afresh, which its reader admits.
  const kept = new Set<string>()
  const refused = new Set<string>()
  const admit = (file: string) => {
    if (refused.has(file)) throw new Error(`Refused kept report ${file}`)
  }
  const wrote = (file: string) => {
    kept.add(file)
    refused.delete(file)
  }
  // The commits a stopped fix landed, read back by their full IDs.
  const storedRecords = new Map<string, LandedRecord>()
  const results: { [P in Exclude<Phase, "implement">]: PhaseResult<P> } = {
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
    // The stub ruler names `report` on every finding it is given.
    rule: {
      status: "finished",
      sessionId: "rule-session",
      reading: { winners: [], sources: [] },
    },
    fix: { status: "finished", sessionId: "fix-session", settling: null },
    watch: {
      status: "finished",
      sessionId: "watch-session",
      document: "# Example: trajectory watch",
      grade: "green",
      compactions: 0,
    },
    close: {
      status: "finished",
      sessionId: "close-session",
    },
  }
  async function record(input: PhaseInput) {
    calls.push(input)
    await settle(input)
    // Only a finished report phase leaves its report behind.
    if (
      input.phase === "implement" ||
      results[input.phase].status !== "finished"
    )
      return
    if (input.phase === "audit") wrote(input.arguments[0])
    if (input.phase === "vet") wrote(input.arguments[1])
    if (input.phase === "rebut") wrote(input.arguments.at(-1) as string)
    if (input.phase === "rule") wrote(input.arguments.at(-2) as string)
  }
  const evidence: {
    settling: string
    findings: ReportFinding[]
    accepted: boolean
    vetVerdict: "revise" | "needs-user-ruling"
    revisedTier?: "A" | "B" | "C" | "D"
    rebuttalAnswer: "agree" | "contest" | "for-user-ruling"
    subjects: string[]
  } = {
    settling: "",
    findings: [reportFinding],
    accepted: false,
    vetVerdict: "revise",
    rebuttalAnswer: "agree",
    subjects: ["example/impl-audit-1 oth clean: settled"],
  }
  const vetReading = (): VetReading => ({
    reviews: evidence.findings.map((finding) => ({
      number: finding.number,
      tier: finding.tier,
      verdict: evidence.accepted ? "accept" : evidence.vetVerdict,
      ...(evidence.revisedTier === undefined
        ? {}
        : { revisedTier: evidence.revisedTier }),
    })),
    allAccepted: evidence.accepted,
  })
  const rebuttalReading = (): FindingRebuttal[] =>
    evidence.accepted
      ? []
      : [
          {
            number: evidence.findings[0]?.number ?? 1,
            tier: evidence.findings[0]?.tier ?? "B",
            vet: vetTag,
            answer: evidence.rebuttalAnswer,
          },
        ]
  const dependencies: RoundDependencies = {
    watchEvidence: async (input) => {
      assert.equal(calls.at(-1)?.phase, "fix")
      watchEvidence.push(input)
      return {
        evidence: watchEvidenceText,
        heads: { "repo-edu": "def4567", plan: "abc1234" },
      }
    },
    writeWatchDocument: async (file, document) => {
      watchDocuments.push({ file, document })
    },
    writeWatchRecord: async (input) => {
      assert.equal(watchDocuments.length, watchRecords.length + 1)
      watchRecords.push(input)
    },
    checkFile: async () => {},
    completeClean: async (input) => {
      completions.push(input)
      return { message: "Clean audit recorded", commits: [] }
    },
    readReport: async (file) => {
      admit(file)
      return {
        settling: evidence.settling,
        findings: evidence.findings,
        judgedRepos: ["repo-edu"],
      }
    },
    readVet: async (file) => {
      admit(file)
      return vetReading()
    },
    readRebuttal: async (file) => {
      admit(file)
      return rebuttalReading()
    },
    // A kept ruler report names `report` on every finding the ruler is given.
    readRuler: async (file, given) => {
      admit(file)
      return {
        winners: given.map(({ number, tier }) => ({
          number,
          tier,
          winner: "report",
          reason: "The finding stands.",
        })),
        sources: [],
      }
    },
    readHead: async (root) => `before-${root}`,
    resolvePlan: async (roots, stem) => join(roots.activeRoot, `${stem}.md`),
    fileExists: async (file) => planRemains || kept.has(file),
    archiveRoundData: async (stem, tag, record) => {
      assert.equal(planRemains, false)
      archived.push({ stem, tag, record })
      return roundDataCommit
    },
    moveRoundFiles: async (stem) => {
      // The round data leaves for the plan archive before the other files move.
      assert.equal(archived.at(-1)?.stem, stem)
      moved.push(stem)
      return closedFiles(stem)
    },
    // A landed record stays readable by its full ID for a continued round.
    readRecords: async (root, _before, repository) => {
      if (root !== repoRoot) return []
      const records = landedRecords(repository, evidence.subjects)
      for (const record of records) storedRecords.set(record.sha, record)
      return records
    },
    readRecord: async (_root, sha) => {
      const record = storedRecords.get(sha)
      assert.ok(record, `No landed record ${sha}`)
      return record
    },
    commitPhaseStamps: () => [fixPhaseStamp],
    seriesEvidence: async (): Promise<SeriesEvidence> => ({
      roundData: { file: "example-impl-rounds.json", rounds: [] },
      roundCommits: new Set(),
      roundCommitTimes: new Map(),
      commits: [],
    }),
    chainDeferrals: async () => "none",
    writeSettledRound: (commits, account) => {
      settledWrites.push({ commits, account })
    },
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
      async rule(input) {
        await record(input)
        const result = results.rule
        if (result.status !== "finished") return result
        const scope = input.arguments.at(-1) as RulerScope
        return {
          ...result,
          reading: {
            winners: scope.findings.map(({ finding, tier }) => ({
              number: finding,
              tier,
              winner: "report",
              reason: "The finding stands.",
            })),
            sources: [],
          },
        }
      },
      async fix(input) {
        await record(input)
        return results.fix
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
    async requestRuling(request) {
      rulings.push(request)
      return null
    },
  }
  return {
    calls,
    completions,
    glances,
    watchEvidence,
    watchDocuments,
    watchRecords,
    settledWrites,
    rulings,
    archived,
    moved,
    results,
    dependencies,
    evidence,
    decide(decision: GlanceDecision) {
      glance = decision
    },
    grade(recorded: WatchGrade) {
      const watch = results.watch
      if (watch.status !== "finished") throw new Error("Watch did not finish")
      results.watch = { ...watch, grade: recorded }
    },
    leavePlan() {
      planRemains = true
    },
    holdRoundData(commit: LifecycleCommit) {
      roundDataCommit = commit
    },
    kept,
    refused,
    storedRecords,
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
  const reply = Promise.withResolvers<RulingInput | null>()
  const requestRuling = async (request: RulingRequest) => {
    assert.equal(request.document, ruling)
    shown.resolve()
    return reply.promise
  }
  const running = runRound(
    { ...files, plan: "example.md", scope: "1" },
    { ...round.dependencies, requestRuling },
  )
  await shown.promise
  assert.deepEqual(
    round.calls.map((call) => call.phase),
    phases,
  )
  round.results.fix = {
    status: "finished",
    sessionId: "fix-session",
    settling: null,
  }
  reply.resolve({ rulings: [], reply: "Choose option 1." })
  assert.deepEqual(await running, {
    status: "finished",
    report: files.documents.report,
    cleanAudit: false,
    decision: null,
    watch: "green",
    deferralChain: "none",
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
  assert.equal(round.glances.length, 1)
  assert.deepEqual(
    round.calls.slice(-2).map((call) => call.phase),
    ["fix", "watch"],
  )
})

test("clarification can leave a decision open without creating a new fix session", async () => {
  const round = controlledRound()
  round.results.fix = { status: "needs-ruling", sessionId: "fix-session" }
  const replies = ["Explain option 2.", "Choose option 1."]
  const requested: RulingRequest[] = []
  const result = await runRound(
    { ...files, plan: "example.md", scope: "1" },
    {
      ...round.dependencies,
      requestRuling: async (request) => {
        requested.push(request)
        const reply = replies.shift()
        assert.ok(reply)
        if (replies.length === 0)
          round.results.fix = {
            status: "finished",
            sessionId: "fix-session",
            settling: null,
          }
        return { rulings: [], reply }
      },
    },
  )
  assert.equal(result.status, "finished")
  assert.deepEqual(
    requested.map((request) => request.document),
    [ruling, ruling],
  )
  assert.deepEqual(
    round.calls.map((call) => call.phase),
    [...phases, "fix", "fix"],
  )
  assert.deepEqual(
    round.calls
      .filter((call) => call.phase === "fix")
      .map((call) => call.sessionId),
    [null, "fix-session", "fix-session"],
  )
})

/** The release the test startup resolves Claude's `opus` alias to. */
const opusRelease = {
  assistant: "claude",
  model: "claude-opus-5",
  effort: "high",
} as const

for (const scenario of [
  { name: "auditor", side: "auditor" },
  {
    name: "vet",
    side: { vet: vetTag },
    fixer: { assistant: "claude", model: "opus", effort: "high" },
  },
  // The fixer names the release that the vetter's and the auditor's alias resolves to.
  { name: "aliased vet", side: { vet: vetTag }, fixer: opusRelease },
  {
    name: "aliased auditor",
    side: "auditor",
    auditor: "claude",
    fixer: opusRelease,
  },
  {
    name: "neither",
    side: "neither",
    fixer: { assistant: "codex", model: "gpt-6-astra", effort: "high" },
  },
] as const) {
  test(`a contested B finding names the ${scenario.name} fix model`, async () => {
    const round = controlledRound()
    round.evidence.rebuttalAnswer = "contest"
    round.results.fix = { status: "needs-ruling", sessionId: "fix-session" }
    const result = await runRound(
      {
        ...files,
        plan: "example.md",
        scope: "1",
        auditor: scenario.auditor ?? "codex",
        ...("fixer" in scenario
          ? { fixer: scenario.fixer, fixerSource: "test" }
          : {}),
      },
      round.dependencies,
    )
    assert.equal(result.status, "awaiting-ruling")
    assert.deepEqual(round.rulings, [
      {
        document: ruling,
        fixerSide: scenario.side,
        contests: [1],
        panel: [vetTag],
      },
    ])
  })
}

/** A panel of both assistants, each vetter named by the tag its vet report carries. */
const panelReports = ["abh", "obh"].map(
  (tag) => `/distinct-twins/example-impl-audit-01..01-01-3-vet.${tag}.md`,
)
const panelSettings = (() => {
  const settings = structuredClone(testSettings)
  settings.implementationAudit.vetters = [
    { assistant: "claude", model: "opus", effort: "high" },
    { assistant: "codex", model: "gpt-5.6-sol", effort: "high" },
  ]
  return settings
})()

test("a panel of both assistants vets side by side, and every vet report reaches the rebuttal, the fix and the ruling", async () => {
  let running = 0
  let peak = 0
  const round = controlledRound(async (input) => {
    if (input.phase !== "vet") return
    running += 1
    peak = Math.max(peak, running)
    await new Promise((resolve) => setImmediate(resolve))
    running -= 1
  })
  round.results.fix = { status: "needs-ruling", sessionId: "fix-session" }
  const result = await runRoundOn(
    {
      ...files,
      documents: { ...files.documents, vets: panelReports },
      plan: "example.md",
      scope: "1",
      // The Claude vetter runs on the auditor's own model.
      auditor: "claude",
    },
    {
      ...round.dependencies,
      // Claude accepts the B finding and Codex drops it, so the panel splits.
      readVet: async (vetReport) => ({
        reviews: [
          {
            number: 1,
            tier: "B",
            verdict: vetReport === panelReports[0] ? "accept" : "drop",
          },
        ],
        allAccepted: vetReport === panelReports[0],
      }),
      readRebuttal: async () => [
        { number: 1, tier: "B", vet: "obh", answer: "agree" },
      ],
    },
    releases,
    panelSettings,
  )
  assert.equal(result.status, "awaiting-ruling")
  assert.equal(peak, 2)
  const vets = round.calls.filter((call) => call.phase === "vet")
  assert.deepEqual(
    vets.map(({ assistant, model, arguments: args }) => ({
      assistant,
      model,
      arguments: args,
    })),
    panelPhases("implementation", panelSettings).map((run, index) => ({
      ...run,
      arguments: [files.documents.report, panelReports[index]],
    })),
  )
  const rebut = round.calls.find((call) => call.phase === "rebut")
  assert.deepEqual(rebut?.arguments, [
    files.documents.report,
    ...panelReports,
    files.documents.rebut,
  ])
  const fix = round.calls.find((call) => call.phase === "fix")
  assert.deepEqual(fix?.arguments.slice(0, 4), [
    files.documents.report,
    ...panelReports,
    files.documents.rebut,
  ])
  assert.deepEqual(round.rulings, [
    {
      document: ruling,
      fixerSide: { vet: "obh" },
      contests: [1],
      panel: ["abh", "obh"],
    },
  ])
})

/** Run a panel round whose two vetters split on one finding of the given tier. */
async function panelSplit(
  round: ReturnType<typeof controlledRound>,
  tier: ReportFinding["tier"],
) {
  round.evidence.findings = [{ ...reportFinding, tier }]
  return runRoundOn(
    {
      ...files,
      documents: { ...files.documents, vets: panelReports },
      plan: "example.md",
      scope: "1",
      auditor: "claude",
    },
    {
      ...round.dependencies,
      readVet: async (vetReport) => ({
        reviews: [
          {
            number: 1,
            tier,
            verdict: vetReport === panelReports[0] ? "accept" : "drop",
          },
        ],
        allAccepted: vetReport === panelReports[0],
      }),
      readRebuttal: async () => [
        { number: 1, tier, vet: "obh", answer: "agree" },
      ],
    },
    releases,
    panelSettings,
  )
}

test("a split on a C finding goes to the ruler, whose winner reaches the fix without a ruling", async () => {
  const round = controlledRound()
  const result = await panelSplit(round, "C")
  assert.equal(result.status, "finished")
  assert.deepEqual(
    round.calls.map((call) => call.phase),
    ["audit", "vet", "vet", "rebut", "rule", "fix"],
  )
  const rule = round.calls.find((call) => call.phase === "rule")
  assert.ok(rule?.phase === "rule")
  assert.deepEqual(rule.arguments, [
    files.documents.report,
    ...panelReports,
    files.documents.rebut,
    files.documents.ruler,
    { findings: [{ finding: 1, tier: "C" }] },
  ])
  assert.deepEqual(rule.panel, ["abh", "obh"])
  assert.equal(
    rule.assistant,
    panelSettings.implementationAudit.ruler.assistant,
  )
  // The fix reads the ruler report and receives the winner from its first call.
  const fix = round.calls.find((call) => call.phase === "fix")
  assert.deepEqual(fix?.arguments, [
    files.documents.report,
    ...panelReports,
    files.documents.rebut,
    files.documents.ruler,
    {
      contests: [
        { finding: 1, winner: "report", reason: "The finding stands." },
      ],
    },
  ])
  assert.deepEqual(round.rulings, [])
  assert.deepEqual(result.account.findings[0]?.ruling, {
    winner: "report",
    reason: "The finding stands.",
    namedBy: "ruler",
  })
})

test("a split on a B finding runs no ruler and goes to the user", async () => {
  const round = controlledRound()
  round.results.fix = { status: "needs-ruling", sessionId: "fix-session" }
  const result = await panelSplit(round, "B")
  assert.equal(result.status, "awaiting-ruling")
  assert.ok(!round.calls.some((call) => call.phase === "rule"))
  assert.deepEqual(
    round.rulings.map(({ contests }) => contests),
    [[1]],
  )
})

test("a failed ruler fails the round before the fix starts", async () => {
  const round = controlledRound()
  round.results.rule = {
    status: "failed",
    sessionId: "rule-session",
    reason: "The ruler report names sources its session did not open: abc123",
  }
  const result = await panelSplit(round, "D")
  assert.equal(result.status, "failed")
  assert.ok(result.status === "failed")
  assert.equal(result.phase, "rule")
  assert.equal(result.sessionId, "rule-session")
  assert.ok(!round.calls.some((call) => call.phase === "fix"))
})

test("a failed vetter of a panel fails the round once every vetter has ended", async () => {
  const round = controlledRound()
  const failure = {
    status: "failed",
    sessionId: "codex-vet-session",
    reason: "Required work remains blocked by a permission refusal",
  } as const
  const result = await runRoundOn(
    {
      ...files,
      documents: { ...files.documents, vets: panelReports },
      plan: "example.md",
      scope: "1",
    },
    {
      ...round.dependencies,
      runPhase: {
        ...round.dependencies.runPhase,
        async vet(input) {
          round.calls.push(input)
          return input.arguments[1] === panelReports[1]
            ? failure
            : round.results.vet
        },
      },
    },
    releases,
    panelSettings,
  )
  assert.deepEqual(
    round.calls.map((call) => call.phase),
    ["audit", "vet", "vet"],
  )
  const [, codexVet] = panelPhases("implementation", panelSettings)
  assert.deepEqual(withoutAccount(result), {
    ...failure,
    phase: "vet",
    ...codexVet,
    ...testContext(repoRoot),
    commits: [],
  })
})

test("a contested C finding raised to B goes to the user", async () => {
  const round = controlledRound()
  round.evidence.findings = [secondReportFinding]
  round.evidence.revisedTier = "B"
  round.evidence.rebuttalAnswer = "contest"
  round.results.fix = { status: "needs-ruling", sessionId: "fix-session" }
  const result = await runRound(
    { ...files, plan: "example.md", scope: "1" },
    round.dependencies,
  )
  assert.equal(result.status, "awaiting-ruling")
  assert.deepEqual(round.rulings[0]?.contests, [2])
})

test("a contested C finding goes to the ruler, and the fix receives its winner", async () => {
  const round = controlledRound()
  round.evidence.findings = [secondReportFinding]
  round.evidence.rebuttalAnswer = "contest"
  const result = await runRound(
    { ...files, plan: "example.md", scope: "1" },
    round.dependencies,
  )
  assert.equal(result.status, "finished")
  assert.deepEqual(round.rulings, [])
  assert.deepEqual(
    round.calls.map((call) => call.phase),
    ["audit", "vet", "rebut", "rule", "fix"],
  )
  const fix = round.calls.find((call) => call.phase === "fix")
  assert.ok(fix?.phase === "fix")
  assert.deepEqual(fix.arguments.at(-1), {
    contests: [
      {
        finding: secondReportFinding.number,
        winner: "report",
        reason: "The finding stands.",
      },
    ],
  })
})

test("a contested referral goes to the user", async () => {
  const round = controlledRound()
  round.evidence.vetVerdict = "needs-user-ruling"
  round.evidence.rebuttalAnswer = "contest"
  round.results.fix = { status: "needs-ruling", sessionId: "fix-session" }
  const result = await runRound(
    { ...files, plan: "example.md", scope: "1" },
    round.dependencies,
  )
  assert.equal(result.status, "awaiting-ruling")
  assert.deepEqual(round.rulings[0]?.contests, [1])
})

test("a second ruling in the same round asks only for the contests still open", async () => {
  const round = controlledRound()
  round.evidence.findings = [
    reportFinding,
    { ...secondReportFinding, tier: "B" },
  ]
  round.evidence.rebuttalAnswer = "contest"
  round.results.fix = { status: "needs-ruling", sessionId: "fix-session" }
  const asked: (readonly number[])[] = []
  const result = await runRoundWithAccount(
    { ...files, plan: "example.md", scope: "1" },
    {
      ...round.dependencies,
      readRebuttal: async () =>
        [1, 2].map((number) => ({
          number,
          tier: "B" as const,
          vet: vetTag,
          answer: "contest" as const,
        })),
      requestRuling: async (input) => {
        asked.push(input.contests)
        if (asked.length === 1)
          return {
            rulings: [
              {
                finding: 1,
                winner: [vetTag],
                reason: "The vet read the contract.",
              },
            ],
            reply: "Explain the evidence for finding 2.",
          }
        round.results.fix = {
          status: "finished",
          sessionId: "fix-session",
          settling: null,
        }
        return {
          rulings: [
            { finding: 2, winner: "report", reason: "The finding stands." },
          ],
          reply: "",
        }
      },
    },
  )
  assert.equal(result.status, "finished")
  assert.deepEqual(asked, [[1, 2], [2]])
  assert.deepEqual(
    result.account.findings.map((finding) => finding.ruling?.winner),
    [[vetTag], "report"],
  )
})

test("not yet keeps a contest open until the runner records its winner and reason", async () => {
  const round = controlledRound()
  round.evidence.rebuttalAnswer = "contest"
  round.results.fix = { status: "needs-ruling", sessionId: "fix-session" }
  let request = 0
  const result = await runRoundWithAccount(
    { ...files, plan: "example.md", scope: "1" },
    {
      ...round.dependencies,
      requestRuling: async (input) => {
        request += 1
        assert.deepEqual(input.contests, [1])
        if (request === 1)
          return { rulings: [], reply: "Explain the disputed evidence." }
        round.results.fix = {
          status: "finished",
          sessionId: "fix-session",
          settling: null,
        }
        return {
          rulings: [
            {
              finding: 1,
              winner: "report",
              reason: "The report quotes the owning contract.",
            },
          ],
          reply: "",
        }
      },
    },
  )
  assert.equal(result.status, "finished")
  assert.equal(request, 2)
  assert.deepEqual(result.account.findings[0]?.ruling, {
    winner: "report",
    reason: "The report quotes the owning contract.",
    namedBy: "user",
  })
  const fixes = round.calls.filter((call) => call.phase === "fix")
  assert.equal(fixes.length, 3)
  const commitBlocks = fixes.map(
    (fix) =>
      fix.arguments
        .find(
          (argument) =>
            typeof argument === "object" &&
            argument !== null &&
            "contests" in argument,
        )
        ?.contests.filter((contest) => contest.winner === undefined)
        .map((contest) => contest.finding) ?? [],
  )
  assert.deepEqual(commitBlocks, [[1], [1], []])
  const finalScope = fixes[2]?.arguments.find(
    (argument) =>
      typeof argument === "object" &&
      argument !== null &&
      "contests" in argument,
  )
  assert.deepEqual(finalScope, {
    contests: [
      {
        finding: 1,
        winner: "report",
        reason: "The report quotes the owning contract.",
      },
    ],
  })
})

test("a fix cannot finish while a serious contest has no winner", async () => {
  const round = controlledRound()
  round.evidence.rebuttalAnswer = "contest"

  const result = await runRound(
    { ...files, plan: "example.md", scope: "1" },
    round.dependencies,
  )

  assert.equal(result.status, "failed")
  if (result.status !== "failed") return
  assert.equal(result.phase, "fix")
  assert.match(result.reason, /finished fix left serious contests.*finding 1/)
})

/** The open contests one fix call receives: those its contest object names without a winner. */
function openInCall(call: PhaseInput): readonly number[] {
  return call.arguments
    .flatMap((argument) =>
      typeof argument === "object" &&
      argument !== null &&
      "contests" in argument
        ? argument.contests
        : [],
    )
    .filter((contest) => contest.winner === undefined)
    .map((contest) => contest.finding)
}

/** The entry a stopped round stored, as the runner writes it when the round ends. */
function storedEntry(
  stopped: {
    readonly commits: readonly LandedCommit[]
    readonly account: RoundAccount
  },
  status: ImplementationRoundData["status"] = "failed",
): ImplementationRoundData {
  return {
    ...implementationRead("codex", 1, status),
    commits: [...stopped.commits],
    findings: [...stopped.account.findings],
    judgedRepos: [...stopped.account.judgedRepos],
  }
}

/** The audit report's one finding as its vetter reviewed it, before the fix settles it. */
const reviewedFinding = {
  ...reportFinding,
  reviews: [{ vet: vetTag, verdict: "revise", answer: "agree" }],
  outcome: null,
  finalTier: null,
  finalReach: null,
} as const satisfies RoundFinding

for (const stopped of ["left-ruling", "failed-fix", "finished-fix"] as const) {
  test(`a ${stopped} serious contest continues on its kept reports with a fresh fix`, async () => {
    const round = controlledRound()
    round.evidence.rebuttalAnswer = "contest"
    if (stopped === "left-ruling")
      round.results.fix = { status: "needs-ruling", sessionId: "fix-session" }
    if (stopped === "failed-fix")
      round.results.fix = {
        status: "failed",
        sessionId: "fix-session",
        reason: "The fix stopped.",
      }

    const initial = await runRoundWithAccount(
      { ...files, plan: "example.md", scope: "1" },
      round.dependencies,
    )
    assert.equal(
      initial.status,
      stopped === "left-ruling" ? "awaiting-ruling" : "failed",
    )
    const priorCalls = round.calls.length
    round.results.fix = { status: "needs-ruling", sessionId: "fix-session" }

    const continued = await runRoundWithAccount(
      {
        ...files,
        plan: "example.md",
        scope: "1",
        stored: storedEntry(initial, initial.status),
      },
      {
        ...round.dependencies,
        requestRuling: async (request) => {
          assert.deepEqual(request.contests, [1])
          round.results.fix = {
            status: "finished",
            sessionId: "fix-session",
            settling: null,
          }
          return {
            rulings: [
              {
                finding: 1,
                winner: [vetTag],
                reason: "The vet read the current contract.",
              },
            ],
            reply: "",
          }
        },
      },
    )

    assert.equal(continued.status, "finished")
    assert.deepEqual(continued.account.findings[0]?.ruling?.winner, [vetTag])
    // The kept audit, vet and rebuttal reports stand. The fix starts fresh,
    // writes its ruling again and resumes only with the user's answer.
    const later = round.calls.slice(priorCalls)
    assert.deepEqual(
      later.map((call) => [call.phase, call.sessionId]),
      [
        ["fix", null],
        ["fix", "fix-session"],
      ],
    )
    assert.deepEqual(later.map(openInCall), [[1], []])
  })
}

test("not yet in a continued contest keeps the runner block until a later winner", async () => {
  const round = controlledRound()
  round.evidence.rebuttalAnswer = "contest"
  round.results.fix = { status: "needs-ruling", sessionId: "fix-session" }
  const initial = await runRoundWithAccount(
    { ...files, plan: "example.md", scope: "1" },
    round.dependencies,
  )
  assert.equal(initial.status, "awaiting-ruling")
  const priorCalls = round.calls.length
  let requests = 0

  const continued = await runRoundWithAccount(
    {
      ...files,
      plan: "example.md",
      scope: "1",
      stored: storedEntry(initial, "awaiting-ruling"),
    },
    {
      ...round.dependencies,
      requestRuling: async () => {
        requests += 1
        if (requests === 1)
          return { rulings: [], reply: "Explain the disputed evidence." }
        round.results.fix = {
          status: "finished",
          sessionId: "fix-session",
          settling: null,
        }
        return {
          rulings: [
            {
              finding: 1,
              winner: "report",
              reason: "The report quotes the owning contract.",
            },
          ],
          reply: "",
        }
      },
    },
  )

  assert.equal(continued.status, "finished")
  assert.equal(requests, 2)
  const later = round.calls.slice(priorCalls)
  assert.deepEqual(
    later.map((call) => call.phase),
    ["fix", "fix", "fix"],
  )
  assert.deepEqual(later.map(openInCall), [[1], [1], []])
})

test("a stored winner stands only while the kept reports rebuild its finding as stored", async () => {
  const round = controlledRound()
  round.evidence.rebuttalAnswer = "contest"
  round.results.fix = { status: "needs-ruling", sessionId: "fix-session" }
  const initial = await runRoundWithAccount(
    { ...files, plan: "example.md", scope: "1" },
    round.dependencies,
  )
  assert.equal(initial.status, "awaiting-ruling")
  const [finding] = initial.account.findings
  assert.ok(finding)
  const ruled = (reviews: RoundFinding["reviews"]) =>
    storedEntry(
      {
        commits: [],
        account: {
          ...initial.account,
          findings: [
            {
              ...finding,
              reviews,
              ruling: {
                winner: "report",
                reason: "The report quotes the owning contract.",
                namedBy: "user",
              },
            },
          ],
        },
      },
      "awaiting-ruling",
    )
  const asked = round.rulings.length

  // The kept reports rebuild the finding as stored, so its winner stands and
  // the fix finishes without asking again.
  round.results.fix = {
    status: "finished",
    sessionId: "fix-session",
    settling: null,
  }
  const kept = await runRoundWithAccount(
    {
      ...files,
      plan: "example.md",
      scope: "1",
      stored: ruled(finding.reviews),
    },
    round.dependencies,
  )
  assert.equal(kept.status, "finished")
  assert.equal(round.rulings.length, asked)
  assert.deepEqual(openInCall(round.calls.at(-1) as PhaseInput), [])

  // A winner given on a drop the kept vet report no longer gives judged other
  // reviews, so the user rules again.
  round.results.fix = { status: "needs-ruling", sessionId: "fix-session" }
  const changed = await runRoundWithAccount(
    {
      ...files,
      plan: "example.md",
      scope: "1",
      stored: ruled([{ vet: vetTag, verdict: "drop", answer: "contest" }]),
    },
    round.dependencies,
  )
  assert.equal(changed.status, "awaiting-ruling")
  assert.deepEqual(openInCall(round.calls.at(-1) as PhaseInput), [1])
})

test("a continued vet runs only the vetters of the current panel without a kept vet report", async () => {
  const round = controlledRound()
  round.evidence.accepted = true
  round.kept.add(files.documents.report)
  round.kept.add(panelReports[0] as string)
  const result = await runRoundOn(
    {
      ...files,
      documents: { ...files.documents, vets: panelReports },
      plan: "example.md",
      scope: "1",
      stored: storedEntry({
        commits: [],
        account: {
          settling: "",
          judgedRepos: ["repo-edu"],
          findings: [{ ...reviewedFinding, reviews: [] }],
        },
      }),
    },
    round.dependencies,
    releases,
    panelSettings,
  )
  assert.equal(result.status, "finished")
  assert.deepEqual(
    round.calls.map((call) => [
      call.phase,
      call.phase === "vet" ? call.arguments[1] : null,
    ]),
    [
      ["vet", panelReports[1]],
      ["fix", null],
    ],
  )
})

test("a kept report its reader refuses runs its phase again in a fresh session", async () => {
  const round = controlledRound()
  for (const file of [files.documents.report, vetReport, files.documents.rebut])
    round.kept.add(file)
  round.refused.add(vetReport)
  const result = await runRoundWithAccount(
    {
      ...files,
      plan: "example.md",
      scope: "1",
      stored: storedEntry({
        commits: [],
        account: {
          settling: "",
          judgedRepos: ["repo-edu"],
          findings: [reviewedFinding],
        },
      }),
    },
    round.dependencies,
  )
  assert.equal(result.status, "finished")
  assert.deepEqual(
    round.calls.map((call) => [call.phase, call.sessionId]),
    [
      ["vet", null],
      ["fix", null],
    ],
  )
})

test("the commits a stopped fix landed count for the fresh fix that finishes the round", async () => {
  const round = controlledRound()
  for (const file of [files.documents.report, vetReport, files.documents.rebut])
    round.kept.add(file)
  // The stopped fix landed the record; the fresh fix finds nothing left to land.
  const [record] = landedRecords("repo-edu", [
    "example/impl-audit-1 oth clean: settled",
  ])
  assert.ok(record)
  round.storedRecords.set(record.sha, record)
  round.evidence.subjects = []
  const landed = [{ repository: "repo-edu", sha: record.sha }] as const
  const result = await runRoundWithAccount(
    {
      ...files,
      plan: "example.md",
      scope: "1",
      stored: storedEntry({
        commits: landed,
        account: {
          settling: "",
          judgedRepos: ["repo-edu"],
          findings: [reviewedFinding],
        },
      }),
    },
    round.dependencies,
  )
  assert.equal(result.status, "finished")
  assert.deepEqual(result.commits, landed)
  assert.deepEqual(
    round.calls.map((call) => call.phase),
    ["fix"],
  )
})

for (const ended of ["fix", "clean completion"] as const) {
  test(`a continued round whose ${ended} ended runs only what follows it`, async () => {
    const round = controlledRound()
    const landed = [{ repository: "repo-edu", sha: "2".repeat(40) }] as const
    const account: RoundAccount = {
      settling: "",
      judgedRepos: ["repo-edu"],
      findings:
        ended === "fix" ? [{ ...reviewedFinding, outcome: "kept" }] : [],
    }
    const result = await runRoundWithAccount(
      {
        ...files,
        plan: "example.md",
        scope: "1",
        stored: storedEntry({ commits: landed, account }),
      },
      round.dependencies,
    )
    assert.equal(result.status, "finished")
    assert.ok(result.status === "finished")
    assert.equal(result.cleanAudit, ended === "clean completion")
    assert.deepEqual(result.commits, landed)
    assert.deepEqual(round.calls, [])
    assert.deepEqual(round.completions, [])
    // The settled account is published again before the watch and series rules read it.
    assert.deepEqual(round.settledWrites, [{ commits: landed, account }])
    assert.equal(round.glances.length, ended === "fix" ? 1 : 0)
  })
}

test("a continued round's setup takes the stored audit's launched selection and a chained round's stored deferrals", () => {
  const deferral = {
    deferringRepository: "repo-edu",
    sha: "a".repeat(40),
    position: 1,
    tier: "c",
    destination: "../plan/example.md#decisions",
    title: "Defer the decision",
  } as const
  const {
    scope: _scope,
    judgedRepos: _judged,
    ...common
  } = implementationRead("claude", 1)
  const chained: PlanningRoundData = {
    ...common,
    target: "example-plan-audit",
    auditor: {
      assistant: "claude",
      model: "claude-fable-5-2",
      effort: "high",
      chosenBy: "command-line",
    },
    phases: [
      {
        phase: "audit",
        assistant: "claude",
        model: "claude-fable-5-2",
        effort: "high",
        launched: { model: "fable", effort: "xhigh" },
        milliseconds: 1,
        tokens: [],
        peakContext: null,
        compactions: 0,
      },
    ],
    phase: "detailing",
    settling: "",
    deferrals: [deferral],
  }
  assert.deepEqual(continuedSetup(chained), {
    auditor: "claude",
    auditorSelectionSource: "--auditor",
    override: { listed: { model: "fable", effort: "xhigh" } },
    deferrals: [deferral],
  })
  // An ordinary round stores no list, so the call's own deferrals stay.
  const { deferrals: _deferrals, ...ordinary } = chained
  assert.equal("deferrals" in continuedSetup(ordinary), false)
})

/** Round data whose one finding the panel reviewed as given. */
function reviewedAccount(
  tier: ReportFinding["tier"],
  ...reviews: readonly RoundFindingReview[]
): RoundAccount {
  return {
    settling: "",
    judgedRepos: ["repo-edu"],
    findings: [
      {
        ...reportFinding,
        tier,
        reviews: [...reviews],
        outcome: null,
        finalTier: null,
        finalReach: null,
      },
    ],
  }
}

const panelReview = (
  vet: string,
  verdict: RoundFindingReview["verdict"],
  answer: RoundFindingReview["answer"] = verdict === "accept" ? null : "agree",
  revisedTier?: RoundFindingReview["revisedTier"],
): RoundFindingReview => ({
  vet,
  verdict,
  ...(revisedTier === undefined ? {} : { revisedTier }),
  answer,
})

test("each pair of different verdict words on a B finding is a split the user rules on", () => {
  const verdicts = ["accept", "revise", "drop", "needs-user-ruling"] as const
  for (const [index, first] of verdicts.entries())
    for (const second of verdicts.slice(index + 1)) {
      const account = reviewedAccount(
        "B",
        panelReview("abx", first),
        panelReview("obh", second),
      )
      assert.deepEqual(seriousFindings(account), [1], `${first} and ${second}`)
      assert.deepEqual(rulerFindings(account), [], `${first} and ${second}`)
    }
})

test("two vetters that both send a finding to the user do not split", () => {
  const account = reviewedAccount(
    "C",
    panelReview("abx", "needs-user-ruling", "for-user-ruling"),
    panelReview("obh", "needs-user-ruling", "for-user-ruling"),
  )
  assert.deepEqual(seriousFindings(account), [])
  assert.deepEqual(rulerFindings(account), [])
})

test("two revisions split only when the rebuttal does not agree with both", () => {
  assert.deepEqual(
    seriousFindings(
      reviewedAccount(
        "A",
        panelReview("abx", "revise"),
        panelReview("obh", "revise", "agree", "C"),
      ),
    ),
    [],
  )
  for (const answer of ["contest", "for-user-ruling"] as const)
    assert.deepEqual(
      seriousFindings(
        reviewedAccount(
          "B",
          panelReview("abx", "revise"),
          panelReview("obh", "revise", answer),
        ),
      ),
      [1],
      answer,
    )
})

test("the ruler judges every contest and split on a finding no side graded A or B", () => {
  const judges = (
    tier: ReportFinding["tier"],
    ...reviews: readonly RoundFindingReview[]
  ) => {
    const account = reviewedAccount(tier, ...reviews)
    return { user: seriousFindings(account), ruler: rulerFindings(account) }
  }
  for (const tier of ["C", "D"] as const) {
    assert.deepEqual(
      judges(tier, panelReview("abx", "accept"), panelReview("obh", "drop")),
      { user: [], ruler: [1] },
      `${tier} split`,
    )
    assert.deepEqual(
      judges(
        tier,
        panelReview("abx", "drop", "contest"),
        panelReview("obh", "drop"),
      ),
      { user: [], ruler: [1] },
      `${tier} contest`,
    )
  }
  // One side's higher grade keeps the finding with the user.
  assert.deepEqual(
    judges(
      "C",
      panelReview("abx", "accept"),
      panelReview("obh", "revise", "agree", "B"),
    ),
    { user: [1], ruler: [] },
  )
  // A finding without a contest or a split needs no judge.
  assert.deepEqual(
    judges("C", panelReview("abx", "revise"), panelReview("obh", "revise")),
    { user: [], ruler: [] },
  )
})

test("a contest on one of two agreeing vetters goes to the user", () => {
  const account = reviewedAccount(
    "B",
    panelReview("abx", "drop", "contest"),
    panelReview("obh", "drop"),
  )
  assert.deepEqual(seriousFindings(account), [1])
  const [finding] = account.findings
  assert.ok(finding)
  assert.deepEqual(
    openSeriousFindings({
      ...account,
      findings: [
        {
          ...finding,
          ruling: {
            winner: ["abx", "obh"],
            reason: "Both drops held.",
            namedBy: "user",
          },
        },
      ],
    }),
    [],
  )
})

test("the round data retains review, rebuttal and settlement outcomes", async () => {
  const round = controlledRound()
  const result = await runRoundWithAccount(
    { ...files, plan: "example.md", scope: "1" },
    round.dependencies,
  )
  assert.equal(result.status, "finished")
  assert.deepEqual(result.account, {
    settling: "",
    judgedRepos: ["repo-edu"],
    findings: [
      {
        ...reportFinding,
        reviews: [{ vet: vetTag, verdict: "revise", answer: "agree" }],
        outcome: "dropped",
        finalTier: null,
        finalReach: null,
      },
    ],
  })
})

test("a resumed fix failure retains the session and never deletes the reports", async () => {
  const round = controlledRound()
  round.results.fix = { status: "needs-ruling", sessionId: "fix-session" }
  const result = await runRound(
    { ...files, plan: "example.md", scope: "1" },
    {
      ...round.dependencies,
      requestRuling: async () => {
        round.results.fix = {
          status: "failed",
          sessionId: "fix-session",
          reason: "Resume failed",
        }
        return { rulings: [], reply: "Choose option 1." }
      },
    },
  )
  assert.equal(result.status, "failed")
  if (result.status === "failed") {
    assert.equal(result.phase, "fix")
    assert.equal(result.sessionId, "fix-session")
  }
  assert.equal(round.glances.length, 0)
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
        heads: { "repo-edu": repo[0].sha, plan: plan[0].sha },
        grade: "red",
        written: "2026-09-23",
      },
      example: {
        heads: { "repo-edu": repo.at(-1)?.sha, plan: plan[0].sha },
        grade,
        written: "2026-09-23",
      },
    }
    const landed = {
      ...commit(
        "example/impl-audit-1 oth growth-none C1 docs(x): finished fix",
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
      { ...files, plan: "../plan/archive/example/plan.md", scope: "1" },
      {
        ...round.dependencies,
        readReport: async () => ({
          settling: "",
          findings: [reportFinding],
          judgedRepos: ["plan", "repo-edu"],
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
          assert.equal(round.calls.at(-1)?.phase, "fix")
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
      assert.match(writer.evidence, /finished fix/)
      assert.deepEqual(writer.arguments, [])
    }
  })
}

test("a due watch receives the current round's dropped findings from joined evidence", async () => {
  const round = controlledRound()
  round.decide(dueDecision)
  const result = await runRoundWithAccount(
    { ...files, plan: "example.md", scope: "1" },
    {
      ...round.dependencies,
      watchEvidence: async () => {
        assert.equal(round.settledWrites.length, 1)
        const settled = round.settledWrites[0]
        assert.ok(settled)
        assert.equal(settled.account.findings[0]?.outcome, "dropped")
        return {
          evidence: JSON.stringify({
            roundData: {
              implementation: [
                {
                  target: "example-impl-audit-01..01",
                  round: 1,
                  findings: settled.account.findings,
                },
              ],
            },
          }),
          heads: { "repo-edu": "def4567", plan: "abc1234" },
        }
      },
    },
  )

  assert.equal(result.status, "finished")
  assert.equal(result.account.findings[0]?.outcome, "dropped")
  const writer = round.calls.find((call) => call.phase === "watch")
  assert.equal(writer?.phase, "watch")
  if (writer?.phase !== "watch") return
  assert.equal(
    JSON.parse(writer.evidence).roundData.implementation[0].findings[0].outcome,
    "dropped",
  )
})

for (const [ending, sequence] of endings) {
  for (const phase of sequence.filter((phase) => phase !== "fix")) {
    test(`missing output stops ${phase} before the next phase on the ${ending} route`, async () => {
      const round = controlledRound()
      arrange(round, ending)
      const result = await runRound(
        { ...files, plan: "example.md", scope: "1" },
        {
          ...round.dependencies,
          async checkFile(file) {
            const call = round.calls.at(-1)
            if (call?.phase === phase)
              throw new Error(`Missing output: ${file}`)
          },
          async writeWatchDocument(file, document) {
            if (phase === "watch") throw new Error(`Missing output: ${file}`)
            await round.dependencies.writeWatchDocument(file, document)
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

/** Sends a controlled round down one of the two paths past its fix. */
function arrange(round: ControlledRound, ending: "ruling" | "watch"): void {
  if (ending === "ruling")
    round.results.fix = {
      status: "needs-ruling",
      sessionId: "fix-session",
    }
  else round.decide(dueDecision)
}

/** Which assistant a phase runs on under the test settings. */
function runner(phase: Phase, auditor: Assistant): Assistant {
  if (phase === "audit" || phase === "rebut") return auditor
  if (phase === "vet") return testVetter().assistant
  return "codex"
}

const repoEduDeferrals = [
  {
    deferringRepository: "plan",
    sha: `abcdef0${"0".repeat(33)}`,
    position: 1,
    tier: "c",
    destination: "tool-audit-round",
    title: "Runner correction",
  },
] as const

for (const auditor of ["claude", "codex"] as const) {
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
          deferrals: repoEduDeferrals,
        },
        round.dependencies,
      )

      assert.deepEqual(result, {
        status: "finished",
        report,
        cleanAudit: false,
        decision: null,
        watch: null,
        deferralChain: "none",
        commits: landedRecords("repo-edu", round.evidence.subjects).map(
          ({ repository, sha }) => ({ repository, sha }),
        ),
      })
      assert.deepEqual(round.calls, [
        {
          phase: "audit",
          assistant: auditor,
          model: pinned(auditor),
          ...testContext(repoRoot),
          cwd: ownerRoot,
          arguments: [
            files.documents.report,
            "../plan/example.md",
            "2-3",
            { deferrals: repoEduDeferrals },
          ],
          sessionId: null,
        },
        {
          phase: "vet",
          ...testVetter(),
          ...testContext(repoRoot),
          cwd: ownerRoot,
          arguments: [report, vetReport],
          sessionId: null,
        },
        {
          phase: "rebut",
          assistant: auditor,
          model: pinned(auditor),
          ...testContext(repoRoot),
          cwd: ownerRoot,
          arguments: [report, vetReport, files.documents.rebut],
          sessionId: null,
        },
        {
          phase: "fix",
          rulingFile: ruling,
          assistant: "codex",
          model: pinnedCoder(),
          ...testContext(repoRoot),
          cwd: ownerRoot,
          arguments: [
            report,
            vetReport,
            files.documents.rebut,
            { deferrals: repoEduDeferrals },
          ],
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
      for (const call of round.calls)
        assert.equal(
          phaseWorkflow(call),
          join(
            ownerRoot,
            ".agents/skills",
            call.phase,
            "references/workflow.md",
          ),
        )
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
      { ...files, plan: "example.md", scope: "1", auditor },
      round.dependencies,
    )

    const session = {
      assistant: "codex",
      model: pinnedCoder(),
      sessionId: "fix-session",
      ...testContext(repoRoot),
    }
    assert.deepEqual(
      round.calls.map((call) => call.phase),
      phases,
    )
    assert.equal(round.calls[3].sessionId, null)
    assert.equal(round.calls[3].phase, "fix")
    assert.equal(round.calls[3].rulingFile, ruling)
    assert.deepEqual(
      round.rulings.map((request) => request.document),
      [ruling],
    )
    assert.deepEqual(result, {
      status: "awaiting-ruling",
      report: `${repoRoot}/AUDIT-example.md`,
      session,
      commits: landedRecords("repo-edu", round.evidence.subjects).map(
        ({ repository, sha }) => ({ repository, sha }),
      ),
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
          { ...files, plan: "example.md", scope: "1", auditor },
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
          assistant: runner(phase, auditor),
          model:
            phase === "fix"
              ? pinnedCoder()
              : phase === "vet"
                ? testVetter().model
                : phase === "watch"
                  ? testWatch().model
                  : pinned(runner(phase, auditor)),
          ...testContext(repoRoot),
          commits:
            phase === "fix" || phase === "watch"
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
    { ...files, plan: "example.md", scope: "1" },
    round.dependencies,
  )

  assert.deepEqual(result, {
    status: "finished",
    report: `${repoRoot}/AUDIT-example.md`,
    cleanAudit: false,
    decision: null,
    watch: "green",
    deferralChain: "none",
    commits: landedRecords("repo-edu", round.evidence.subjects).map(
      ({ repository, sha }) => ({ repository, sha }),
    ),
  })
  // The watch reads retained evidence, so it receives none of the round's session files.
  assert.equal(round.glances.length, 1)
  assert.deepEqual(round.watchDocuments, [
    { file: watch, document: "# Example: trajectory watch" },
  ])
  assert.deepEqual(round.watchRecords, [
    {
      cacheRoot,
      stem: "example",
      heads: { "repo-edu": "def4567", plan: "abc1234" },
      grade: "green",
    },
  ])
  assert.deepEqual(round.calls.slice(4), [
    {
      phase: "watch",
      evidence: watchEvidenceText,
      ...testWatch(),
      ...testContext(repoRoot),
      arguments: [],
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
    { ...files, plan: "example.md", scope: "1" },
    round.dependencies,
  )

  assert.equal(result.status === "finished" && result.watch, "red")
})

test("a compacted watch writes neither output and names the evidence size", async () => {
  const round = controlledRound()
  arrange(round, "watch")
  const watch = round.results.watch
  assert.equal(watch.status, "finished")
  if (watch.status === "finished")
    round.results.watch = { ...watch, compactions: 1 }

  const result = await runRound(
    { ...files, plan: "example.md", scope: "1" },
    round.dependencies,
  )

  assert.deepEqual(result, {
    status: "failed",
    sessionId: "watch-session",
    phase: "watch",
    ...testWatch(),
    ...testContext(repoRoot),
    reason:
      "The watch compacted while reading 21 characters of evidence; it needs one uncompacted session. The next watch must start fresh.",
    commits: landedRecords("repo-edu", round.evidence.subjects).map(
      ({ repository, sha }) => ({ repository, sha }),
    ),
  })
  assert.deepEqual(round.watchDocuments, [])
  assert.deepEqual(round.watchRecords, [])
})

test("a watch document failure skips the cadence record", async () => {
  const round = controlledRound()
  arrange(round, "watch")
  const result = await runRound(
    { ...files, plan: "example.md", scope: "1" },
    {
      ...round.dependencies,
      writeWatchDocument: async () => {
        throw new Error("Document write failed")
      },
    },
  )
  assert.equal(result.status, "failed")
  assert.equal(
    result.status === "failed" && result.reason,
    "Document write failed. The next watch must start fresh.",
  )
  assert.deepEqual(round.watchRecords, [])
})

test("a watch record failure keeps the admitted document", async () => {
  const round = controlledRound()
  arrange(round, "watch")
  const result = await runRound(
    { ...files, plan: "example.md", scope: "1" },
    {
      ...round.dependencies,
      writeWatchRecord: async () => {
        throw new Error("Record write failed")
      },
    },
  )
  assert.equal(result.status, "failed")
  assert.equal(
    result.status === "failed" && result.reason,
    "Record write failed. The next watch must start fresh.",
  )
  assert.deepEqual(round.watchDocuments, [
    { file: watch, document: "# Example: trajectory watch" },
  ])
  assert.deepEqual(round.watchRecords, [])
})

test("a round that hands over runs no watch, because its work has not landed", async () => {
  const round = controlledRound()
  arrange(round, "ruling")
  round.decide(dueDecision)

  await runRound(
    { ...files, plan: "example.md", scope: "1" },
    round.dependencies,
  )

  assert.deepEqual(
    round.calls.map((call) => call.phase),
    phases,
  )
  assert.deepEqual(round.glances, [])
})

test("a widening fix's settling line replaces the audit report's line in the retained account", async () => {
  const round = controlledRound()
  round.evidence.settling =
    "keep open. Finding 1 needs the user's ruling before the shape can close."
  round.results.fix = {
    status: "finished",
    sessionId: "fix-session",
    settling: "settle. Finding 1 landed and no shape question remains.",
  }

  const result = await runRound(
    {
      ...files,
      ...testContext(repoRoot, "planning"),
      plan: "example-widen.md",
    },
    round.dependencies,
  )

  assert.equal(result.status, "finished")
  assert.equal(
    round.settledWrites[0]?.account.settling,
    "settle. Finding 1 landed and no shape question remains.",
  )
})

test("a plan round records only the landed commits that carry its stem", async () => {
  const round = controlledRound()
  round.results.fix = {
    status: "finished",
    sessionId: "fix-session",
    settling: "settle. Finding 1 landed and no shape question remains.",
  }
  // Another plan's round landed in the same checkout while the fix ran, with
  // its own finding numbered from one.
  const foreign = {
    repository: "plan" as const,
    sha: "1".repeat(40),
    subject: "other/plan-audit obx growth-none B1: correct the other plan",
    message:
      "- B [finding:1] [field:missing] [section:decisions] [growth-pattern:none] [reach:developer] [complexity:none] Fixture finding: Apply the correction.",
  }
  const own = {
    repository: "plan" as const,
    sha: "2".repeat(40),
    subject: "example/plan-audit ath growth-none B1: correct the plan",
    message:
      "- B [finding:1] [field:missing] [section:decisions] [growth-pattern:none] [reach:developer] [complexity:none] Fixture finding: Apply the correction.",
  }

  const result = await runRound(
    {
      ...files,
      ...testContext(repoRoot, "planning"),
      plan: "example-widen.md",
    },
    {
      ...round.dependencies,
      readRecords: async (root) => (root === repoRoot ? [] : [foreign, own]),
    },
  )

  assert.equal(result.status, "finished")
  assert.deepEqual(round.settledWrites[0]?.commits, [
    { repository: "plan", sha: own.sha },
  ])
  assert.equal(round.settledWrites[0]?.account.findings[0]?.outcome, "kept")
})

test("a commit round records only stamped unstemmed landed commits", async () => {
  const round = controlledRound()
  const foreign = {
    repository: "repo-edu" as const,
    sha: "1".repeat(40),
    subject:
      "other/impl-audit-1 obx growth-none b1 fix(audit-round): correct the other plan",
    message: `other/impl-audit-1 obx growth-none b1 fix(audit-round): correct the other plan\n\n${fixPhaseStamp}\n\n- [B] [finding:1] [area:tool-audit-round] [growth-pattern:none] [reach:developer] [complexity:none] Fixture finding: Apply the correction.`,
  }
  const own = {
    repository: "repo-edu" as const,
    sha: "2".repeat(40),
    subject: "obx growth-none b1 fix(audit-round): correct the commit audit",
    message: `obx growth-none b1 fix(audit-round): correct the commit audit\n\n${fixPhaseStamp}\n\n- [B] [finding:1] [area:tool-audit-round] [growth-pattern:none] [reach:developer] [complexity:none] Fixture finding: Apply the correction.`,
  }
  const manual = {
    repository: "repo-edu" as const,
    sha: "3".repeat(40),
    subject: "obh growth-none c1 fix(audit-round): unrelated hand-run fix",
    message:
      "obh growth-none c1 fix(audit-round): unrelated hand-run fix\n\ngpt-5.6-sol high",
  }
  const group = {
    references: ["HEAD"] as const,
    repository: "repo-edu" as const,
    startingHead: "abc1234",
    commits: ["a".repeat(40)] as const,
    shortReferences: ["abc123"] as const,
  }

  const result = await runRound(
    { ...files, ...commitTarget(group) },
    {
      ...round.dependencies,
      readRecords: async (root) =>
        root === repoRoot ? [foreign, own, manual] : [],
    },
  )

  assert.equal(result.status, "finished")
  assert.deepEqual(round.settledWrites[0]?.commits, [
    { repository: "repo-edu", sha: own.sha },
  ])
  assert.equal(round.settledWrites[0]?.account.findings[0]?.outcome, "kept")
})

for (const ending of ["failed", "awaiting-ruling"] as const) {
  test(`a commit round retains stamped records when its fix ends ${ending}`, async () => {
    const round = controlledRound()
    round.results.fix =
      ending === "failed"
        ? {
            status: "failed",
            sessionId: "fix-session",
            reason: "The fix stopped after its commit.",
          }
        : { status: "needs-ruling", sessionId: "fix-session" }
    const own = {
      repository: "repo-edu" as const,
      sha: "2".repeat(40),
      subject: "obx growth-none b1 fix(audit-round): retain the landed fix",
      message: `obx growth-none b1 fix(audit-round): retain the landed fix\n\n${fixPhaseStamp}\n`,
    }
    const group = {
      references: ["HEAD"] as const,
      repository: "repo-edu" as const,
      startingHead: "abc1234",
      commits: ["a".repeat(40)] as const,
      shortReferences: ["abc123"] as const,
    }

    const result = await runRound(
      { ...files, ...commitTarget(group) },
      {
        ...round.dependencies,
        readRecords: async (root) => (root === repoRoot ? [own] : []),
      },
    )

    assert.equal(result.status, ending)
    assert.deepEqual(result.commits, [{ repository: "repo-edu", sha: own.sha }])
    assert.deepEqual(round.settledWrites, [])
  })
}

test("a clean widening audit retains the audit report's settling line as the settling recommendation", async () => {
  const round = controlledRound()
  round.evidence.settling = "settle. No concrete shape question remains."
  round.evidence.findings = []

  const result = await runRound(
    {
      ...files,
      ...testContext(repoRoot, "planning"),
      plan: "example-widen.md",
    },
    round.dependencies,
  )

  assert.equal(result.status, "finished")
  assert.equal(
    round.settledWrites[0]?.account.settling,
    round.evidence.settling,
  )
})

test("a widening fix without a settling line fails at the fix and keeps the reports", async () => {
  const round = controlledRound()

  const result = await runRound(
    {
      ...files,
      ...testContext(repoRoot, "planning"),
      plan: "example-widen.md",
    },
    round.dependencies,
  )

  assert.equal(result.status, "failed")
  if (result.status !== "failed") return
  assert.equal(result.phase, "fix")
  assert.equal(result.sessionId, "fix-session")
  assert.match(result.reason, /widening fix must end with a settling line/)
  assert.deepEqual(round.settledWrites, [])
})

for (const [kind, input] of [
  ["detailing", { ...testContext(repoRoot, "planning"), plan: "example.md" }],
  ["implementation", { plan: "example.md", scope: "1" }],
] as const) {
  test(`a settling line from a ${kind} fix fails at the fix`, async () => {
    const round = controlledRound()
    round.results.fix = {
      status: "finished",
      sessionId: "fix-session",
      settling: "settle. Nothing remains.",
    }

    const result = await runRound({ ...files, ...input }, round.dependencies)

    assert.equal(result.status, "failed")
    if (result.status !== "failed") return
    assert.equal(result.phase, "fix")
    assert.match(result.reason, /Only a widening fix returns a settling line/)
  })
}

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
    { ...files, watch: null, plan: "example.md", scope: "1" },
    round.dependencies,
  )

  assert.deepEqual(result, {
    status: "finished",
    report: `${repoRoot}/AUDIT-example.md`,
    cleanAudit: false,
    decision: null,
    watch: null,
    deferralChain: "none",
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
    { ...files, plan: "example.md", scope: "1" },
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
    ...testWatch(),
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
  test(`commit audit ${ruling ? "hands over after its ruling" : "finishes after its fix"} without a watch`, async () => {
    const round = controlledRound()
    if (ruling) arrange(round, "ruling")
    round.decide(dueDecision)
    const commits = ["HEAD-2", "HEAD-1", "HEAD"] as const
    const group = {
      references: commits,
      repository: "repo-edu" as const,
      startingHead: "abc1234",
      commits: ["a".repeat(40)] as const,
      shortReferences: ["abc111", "abc222", "abc123"] as const,
    }
    const result = await runRound(
      { ...files, ...commitTarget(group) },
      round.dependencies,
    )
    assert.equal(result.status, ruling ? "awaiting-ruling" : "finished")
    assert.deepEqual(round.glances, [])
    assert.deepEqual(round.calls[0].arguments, [
      files.documents.report,
      { ...group, originalCommits: group.commits },
    ])
    assert.deepEqual(
      round.calls.map((call) => call.phase),
      phases,
    )
  })
}

test("commit groups keep their starting head after document allocation", async (t) => {
  const fixture = await roundFixture(t)
  const context = testContext(fixture.repoRoot)
  const [target] = await resolveTargets(context, targetRequest("HEAD", []))
  assert.ok("groups" in target)
  const setup = { ...testSetup(fixture.repoRoot), ...target }
  const allocated = await allocateRound(setup, 0, releases)
  const output = new RoundOutput(allocated, {
    clock: new RunClock(Date.now),
    terminal: { write() {}, status() {}, clear() {} },
  })
  t.after(() => output.close())

  const startingHead = target.groups[0].startingHead
  const currentHead = await commitFixture(
    fixture.repoRoot,
    "obx test(audit-round): advance after allocation",
  )
  assert.notEqual(currentHead, startingHead)

  const round = controlledRound()
  const result = await runRound(
    {
      ...setup,
      documents: allocated.documents,
      transcript: allocated.paths.markdown,
      watch: null,
    },
    round.dependencies,
  )

  assert.equal(result.status, "finished")
  assert.ok(
    basename(allocated.paths.markdown).startsWith(
      `commit-${startingHead.slice(0, 6)}-`,
    ),
  )
  assert.deepEqual(round.calls[0].arguments, [
    allocated.documents.report,
    ...target.groups.map((group) => ({
      ...group,
      originalCommits: group.commits,
    })),
  ])
})

test("retains a failure before the assistant establishes a session", async () => {
  const round = controlledRound()
  round.results.audit = {
    status: "failed",
    sessionId: null,
    reason: "Unable to start the CLI",
  }
  const result = await runRound(
    { ...files, plan: "example.md", scope: "1" },
    round.dependencies,
  )
  assert.deepEqual(result, {
    ...round.results.audit,
    phase: "audit",
    assistant: "codex",
    model: pinned("codex"),
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
        { ...files, plan: "example.md", scope: "1" },
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
          phase === "fix" || phase === "watch"
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
      if (input.phase === "implement")
        throw new Error("A round cannot start an implementation worker")
      const index = sequence.indexOf(input.phase)
      entered[index].resolve()
      await release[index].promise
    })
    arrange(round, ending)
    const running = runRound(
      { ...files, plan: "example.md", scope: "1" },
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
      { ...files, plan: "example.md", scope: "1" },
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
      model: pinnedCoder(),
      sessionId: "fix-session",
      ...testContext(repoRoot),
      reason: "Ruling input unavailable",
      commits: landedRecords("repo-edu", round.evidence.subjects).map(
        ({ repository, sha }) => ({ repository, sha }),
      ),
    })
  })
}

test("the rebuttal starts fresh for either auditor with the audit selection", async () => {
  for (const auditor of ["claude", "codex"] as const) {
    const round = controlledRound()

    const result = await runRound(
      { ...files, plan: "example.md", scope: "1", auditor },
      round.dependencies,
    )

    assert.equal(result.status, "finished")
    assert.equal(round.calls[2].phase, "rebut")
    assert.equal(round.calls[2].sessionId, null)
    assert.equal(round.calls[2].assistant, auditor)
    assert.deepEqual(round.calls[2].model, round.calls[0].model)
  }
})

test("an automatic round publishes its settled entry before the series decision", async () => {
  const round = controlledRound()
  const answer = {
    answer: "stop",
    reason:
      "Rule 2: every listed auditor has a current read; the series stops.",
  } as const
  const result = await runRound(
    {
      ...files,
      plan: "example.md",
      scope: "1",
      auditor: "codex",
      pool: testSettings.implementationAudit.auditors,
    },
    {
      ...round.dependencies,
      seriesEvidence: async () => {
        assert.equal(round.settledWrites.length, 1)
        return {
          roundData: {
            file: "example-impl-rounds.json",
            rounds: [
              implementationRead("codex", 1, "in-progress"),
              implementationRead("claude", 2),
            ],
          },
          roundCommits: new Set(),
          roundCommitTimes: new Map(),
          commits: [],
        }
      },
    },
  )

  assert.deepEqual(result, {
    status: "finished",
    report: files.documents.report,
    cleanAudit: false,
    decision: answer,
    watch: null,
    deferralChain: "none",
    commits: landedRecords("repo-edu", round.evidence.subjects).map(
      ({ repository, sha }) => ({ repository, sha }),
    ),
  })
})

test("a series evidence failure follows the first retained write", async () => {
  const round = controlledRound()
  const result = await runRound(
    {
      ...files,
      plan: "example.md",
      scope: "1",
      auditor: "codex",
      pool: testSettings.implementationAudit.auditors,
    },
    {
      ...round.dependencies,
      seriesEvidence: async () => {
        assert.equal(round.settledWrites.length, 1)
        throw new Error("Cannot read the retained evidence")
      },
    },
  )

  assert.equal(result.status, "failed")
  if (result.status !== "failed") return
  assert.equal(result.sessionId, null)
  assert.equal(result.phase, "complete")
  assert.equal(result.reason, "Cannot read the retained evidence")
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
      { ...files, plan: "../plan/example.md", scope: "1", auditor },
      round.dependencies,
    )

    assert.deepEqual(result, {
      status: "finished",
      report,
      cleanAudit: true,
      decision: null,
      watch: null,
      deferralChain: "none",
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
        scope: "1",
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
    { ...files, plan: "example.md", scope: "1" },
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

test("a later clean-chain failure keeps the landed commit for final recording", async () => {
  const round = controlledRound()
  const landed = { repository: "repo-edu", sha: "a".repeat(40) } as const
  round.evidence.findings = []
  const result = await runRound(
    {
      ...files,
      plan: "example.md",
      scope: "1",
      pool: testSettings.implementationAudit.auditors,
    },
    {
      ...round.dependencies,
      completeClean: async () => ({
        message: "Clean audit recorded",
        commits: [landed],
      }),
      chainDeferrals: async () => {
        throw new Error("Cannot read open deferrals")
      },
    },
  )

  assert.equal(result.status, "failed")
  if (result.status !== "failed") return
  assert.equal(result.phase, "complete")
  assert.equal(result.reason, "Cannot read open deferrals")
  assert.deepEqual(result.commits, [landed])
  assert.deepEqual(round.settledWrites[0]?.commits, [landed])
})

for (const auditor of ["claude", "codex"] as const) {
  test(`a vetter that accepts every ${auditor} finding skips the rebuttal on the way to the fix`, async () => {
    const report = files.documents.report
    const round = controlledRound()
    round.results.vet = {
      status: "finished",
      sessionId: "vet-session",
    }
    round.results.fix = {
      status: "finished",
      sessionId: "fix-session",
      settling: null,
    }

    round.evidence.accepted = true
    round.evidence.subjects = [
      "example/impl-audit-1 oth growth-none c1 fix(audit-round): correct",
    ]
    const result = await runRound(
      { ...files, plan: "../plan/example.md", scope: "1", auditor },
      round.dependencies,
    )

    assert.deepEqual(result, {
      status: "finished",
      report,
      cleanAudit: false,
      decision: null,
      watch: null,
      deferralChain: "none",
      commits: landedRecords("repo-edu", round.evidence.subjects).map(
        ({ repository, sha }) => ({ repository, sha }),
      ),
    })
    // Every verdict is an accept, so the auditor has nothing to answer.
    assert.deepEqual(
      round.calls.map((call) => call.phase),
      ["audit", "vet", "fix"],
    )
    assert.deepEqual(round.calls[2], {
      phase: "fix",
      rulingFile: ruling,
      assistant: "codex",
      model: pinnedCoder(),
      ...testContext(repoRoot),
      arguments: [report, vetReport],
      sessionId: null,
    })
    assert.deepEqual(round.rulings, [])
  })
}

test("a missing ruling fails the fix before user input", async () => {
  const round = controlledRound()
  arrange(round, "ruling")
  const result = await runRound(
    { ...files, plan: "example.md", scope: "1" },
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
    model: pinnedCoder(),
    ...testContext(repoRoot),
    reason: "Missing ruling",
    commits: landedRecords("repo-edu", round.evidence.subjects).map(
      ({ repository, sha }) => ({ repository, sha }),
    ),
  })
  assert.deepEqual(
    round.calls.map((call) => call.phase),
    ["audit", "vet", "rebut", "fix"],
  )
  assert.deepEqual(round.rulings, [])
})

const openDeferral = {
  deferringRepository: "repo-edu",
  sha: `abcdef0${"0".repeat(33)}`,
  position: 1,
  tier: "c",
  destination: "../plan/example.md#decisions",
  title: "Plan choice",
} as const

for (const reason of [null, "The check cost more than it gave."]) {
  test(`a close${reason === null ? "" : " with an abort reason"} runs only the close phase from the plan checkout`, async () => {
    const round = controlledRound()
    const context = testContext(repoRoot, "planning")
    const plan = join(context.activeRoot, "example.md")
    const deferrals = reason === null ? [openDeferral] : []

    const result = await runClose(
      {
        ...context,
        plan,
        tag: "obh",
        record: "gpt-6-astra high",
        reason,
        deferrals,
      },
      round.dependencies,
    )

    assert.deepEqual(result, {
      status: "finished",
      archived: null,
      moved: closedFiles("example"),
    })
    assert.deepEqual(round.archived, [
      { stem: "example", tag: "obh", record: "gpt-6-astra high" },
    ])
    assert.deepEqual(round.moved, ["example"])
    assert.deepEqual(round.calls, [
      {
        phase: "close",
        assistant: "codex",
        model: pinned("codex"),
        ...context,
        arguments:
          reason === null
            ? [plan, "obh", "gpt-6-astra high", { deferrals: [openDeferral] }]
            : [plan, "obh", "gpt-6-astra high", { deferrals: [] }, reason],
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
      deferrals: [],
    },
    round.dependencies,
  )

  assert.deepEqual(result, {
    status: "failed",
    sessionId: "close-session",
    reason: "No shared folder for the peer plan",
    phase: "close",
    assistant: "codex",
    model: pinned("codex"),
    ...context,
  })
})

test("a finished close that left its plan in the active folder fails with its session", async () => {
  const round = controlledRound()
  round.leavePlan()
  const context = testContext(repoRoot, "planning")
  const plan = join(context.activeRoot, "example.md")

  const result = await runClose(
    {
      ...context,
      plan,
      tag: "obh",
      record: "gpt-6-astra high",
      reason: null,
      deferrals: [],
    },
    round.dependencies,
  )

  assert.deepEqual(result, {
    status: "failed",
    sessionId: "close-session",
    phase: "close",
    assistant: "codex",
    model: pinned("codex"),
    ...context,
    reason: `The finished close left ${plan} in the active folder`,
  })
  assert.deepEqual(round.archived, [])
  assert.deepEqual(round.moved, [])
})

test("a finished close returns the runner's commit of the archived round data", async () => {
  const round = controlledRound()
  const commit = {
    sha: "abc1234",
    subject: "example/closed obh: archive the round data",
  }
  round.holdRoundData(commit)
  const context = testContext(repoRoot, "planning")

  const result = await runClose(
    {
      ...context,
      plan: join(context.activeRoot, "example.md"),
      tag: "obh",
      record: "gpt-6-astra high",
      reason: null,
      deferrals: [],
    },
    round.dependencies,
  )

  assert.deepEqual(result, {
    status: "finished",
    archived: commit,
    moved: closedFiles("example"),
  })
})

test("a finished close whose round data cannot be archived fails with its session", async () => {
  const round = controlledRound()
  round.dependencies = {
    ...round.dependencies,
    archiveRoundData: async () => {
      throw new Error("No archived plan named example to hold its round data.")
    },
  }
  const context = testContext(repoRoot, "planning")

  const result = await runClose(
    {
      ...context,
      plan: join(context.activeRoot, "example.md"),
      tag: "obh",
      record: "gpt-6-astra high",
      reason: null,
      deferrals: [],
    },
    round.dependencies,
  )

  assert.deepEqual(result, {
    status: "failed",
    sessionId: "close-session",
    phase: "close",
    assistant: "codex",
    model: pinned("codex"),
    ...context,
    reason: "No archived plan named example to hold its round data.",
  })
  assert.deepEqual(round.moved, [])
})

test("the round reads each supplied file and records both heads immediately before the fix", async () => {
  const round = controlledRound()
  const reads: unknown[] = []
  const result = await runRound(
    { ...files, plan: "example.md", scope: "1" },
    {
      ...round.dependencies,
      async readReport(file, kind) {
        reads.push([file, kind])
        return {
          settling: "",
          findings: [reportFinding, secondReportFinding],
          judgedRepos: ["repo-edu"],
        }
      },
      async readVet(file, findings) {
        reads.push([file, findings])
        return {
          reviews: [
            {
              number: 1,
              tier: "B",
              verdict: "revise",
            },
            {
              number: 2,
              tier: "C",
              verdict: "accept",
            },
          ],
          allAccepted: false,
        }
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
                "example/impl-audit-1 oth growth-none !C1a1 fix(audit-round): repair",
                "example/impl-2 oth feat(audit-round): deliver",
              ]
            : [
                "example/plan-audit ath growth-none B1: correct the plan",
                "example/ready: ready",
              ],
        )
      },
    },
  )
  assert.deepEqual(reads, [
    [`${repoRoot}/AUDIT-example.md`, "implementation"],
    [vetReport, [reportFinding, secondReportFinding]],
  ])
  assert.deepEqual(result, {
    status: "finished",
    report: `${repoRoot}/AUDIT-example.md`,
    cleanAudit: false,
    decision: null,
    watch: null,
    deferralChain: "none",
    commits: [
      ...landedRecords("repo-edu", [
        "example/impl-audit-1 oth growth-none !C1a1 fix(audit-round): repair",
        "example/impl-2 oth feat(audit-round): deliver",
      ]),
      ...landedRecords("plan", [
        "example/plan-audit ath growth-none B1: correct the plan",
        "example/ready: ready",
      ]),
    ].map(({ repository, sha }) => ({ repository, sha })),
  })
})

test("landed plan corrections do not make an audit clean", async () => {
  const round = controlledRound()
  const result = await runRound(
    { ...files, plan: "example.md", scope: "1" },
    {
      ...round.dependencies,
      readRecords: async (root, _before, repository) =>
        landedRecords(
          repository,
          root === repoRoot
            ? [
                "example/impl-audit-1 oth growth-none d1 fix(audit-round): polish",
              ]
            : ["example/plan-audit ath growth-none A1C2: correct the plan"],
        ),
    },
  )
  assert.equal(result.status === "finished" && result.cleanAudit, false)
})

for (const [reader, phase, sessionId, called] of [
  ["readReport", "audit", "audit-session", ["audit"]],
  ["readVet", "vet", "vet-session", ["audit", "vet"]],
  ["readHead", "fix", null, ["audit", "vet", "rebut"]],
  ["readRecords", "fix", "fix-session", ["audit", "vet", "rebut", "fix"]],
] as const) {
  test(`${reader} failure stops the round with the owning phase and recovery session`, async () => {
    const round = controlledRound()
    const result = await runRound(
      { ...files, plan: "example.md", scope: "1" },
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
    { plan: "example.md", scope: "1" },
    commitTarget({
      references: ["HEAD"] as const,
      repository: "repo-edu" as const,
      startingHead: "abc1234",
      commits: ["a".repeat(40)] as const,
      shortReferences: ["abc123"] as const,
    }),
  ]) {
    for (const findings of [[], [reportFinding]]) {
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
    { ...files, plan: "example.md", scope: "1" },
    {
      ...round.dependencies,
      readRecords: async (root, _before, repository) =>
        landedRecords(
          repository,
          root === repoRoot
            ? ["example/impl-audit-1 oth clean: done"]
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
    { ...files, plan: "example.md", scope: "1" },
    {
      ...round.dependencies,
      readRecords: async () => [],
    },
  )
  assert.equal(result.status, "awaiting-ruling")
  assert.deepEqual(result.commits, [])
  assert.deepEqual(round.settledWrites, [])
})
