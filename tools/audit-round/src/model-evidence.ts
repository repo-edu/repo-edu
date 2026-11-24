import { readFile } from "node:fs/promises"
import { basename, dirname, join, relative, sep } from "node:path"
import { readModelRecord, readStepModelRecord } from "./commit-msg.js"
import type { ExecutionContext } from "./context.js"
import { readImplementationLogs } from "./default-target.js"
import type { LogCommit } from "./episode-log.js"
import type { Assistant } from "./phase.js"
import { type PlanStep, readPlanSteps } from "./plan-steps.js"
import {
  type DisprovedFinding,
  findingRevision,
  highestGrade,
  type PlanRoundDataFile,
  parseRoundDataFile,
  type RoundData,
  type RoundFinding,
  type RoundFindingReview,
  type RulingWinner,
  reviewsSplit,
  roundDataFiles,
  type TierRange,
  tierWithin,
  type VetVerdict,
} from "./round-data.js"
import { type Coder, parseCoderRecord } from "./settings.js"
import { planForm } from "./subject.js"

export type WorkClass = "planning" | "implementation"

export type ModelIdentity = {
  readonly assistant: Assistant | null
  readonly model: string
  readonly effort: string | null
}

export type FindingCounts = {
  readonly kept: number
  readonly dropped: number
  readonly downgraded: number
  readonly disproved: number
}

/** One complete round of an auditor, with its finding outcomes per tier range. */
export type AuditorSample = {
  readonly plan: string
  /** The round's start time, as its round data records it. */
  readonly started: string
  /** Whether it is the class's first complete round on the plan. */
  readonly first: boolean
  readonly workClass: WorkClass
  readonly minutes: number
  readonly counts: Record<TierRange, FindingCounts>
}

export type AuditorRow = {
  readonly identity: ModelIdentity
  readonly samples: AuditorSample[]
  /** One plan name per disproved finding whose original tier is unknown. */
  readonly detachedDisproved: Record<WorkClass, string[]>
}

/** One admitted plan: its steps, its minutes per step and its kept findings per tier range. */
export type CoderSample = {
  readonly stem: string
  readonly steps: number
  readonly minutes: number
  readonly kept: Record<TierRange, number>
}

export type CoderRow = {
  readonly identity: ModelIdentity
  readonly samples: CoderSample[]
  readonly excluded: Map<string, string>
}

/** One vetter of a round, named by its tag, and its verdict on one finding. */
export type RoundVet = {
  readonly tag: string
  readonly identity: ModelIdentity
  readonly verdict: VetVerdict | null
}

export type VetterTimeRow = {
  readonly identity: ModelIdentity
  rounds: number
  ownRuns: number
  ownMilliseconds: number
  panelRuns: number
  panelMilliseconds: number
}

/** Which vetters of a split pair the latest ruling proved right. */
export type PairEnding = "first" | "second" | "both" | "neither"

/**
 * Who named the latest ruling on a finding: the user, through the round's
 * winner or a later ruling, or the ruler, with the model and effort of the
 * round's rule phase entry or null without that entry.
 */
export type RulingJudge =
  | { readonly kind: "user" }
  | { readonly kind: "ruler"; readonly identity: ModelIdentity | null }

/** One vetter of a pair and its verdict on the finding both judged. */
export type PairVetter = {
  readonly identity: ModelIdentity
  readonly verdict: VetVerdict
}

/**
 * One finding that two vetters of one panel both judged. The pair is ordered by
 * model text, so every sample of two models has one orientation.
 */
export type VetPairSample = {
  readonly workClass: WorkClass
  /** The highest tier the audit report or a vetter gave the finding. */
  readonly grade: RoundFinding["tier"]
  /** The model and effort the round's audit reported. */
  readonly auditor: ModelIdentity
  readonly first: PairVetter
  readonly second: PairVetter
  /** The ruled split's ending and its judge; null without a split or while the split has no ruling. */
  readonly ruling: {
    readonly ending: PairEnding
    readonly judge: RulingJudge
  } | null
}

/** A finding whose round stored a winner, the user's or the ruler's. */
export type RuledFinding = {
  readonly workClass: WorkClass
  readonly stem: string
  readonly target: string
  readonly round: number
  readonly finding: number
  readonly title: string
  readonly tier: RoundFinding["tier"]
  readonly auditor: ModelIdentity
  /** Every vetter of the round, with its verdict on the finding when it gave one. */
  readonly vets: readonly RoundVet[]
  /**
   * Everyone the round's winner proved right: the auditor when the finding
   * stood as written, then the vetters in panel order. Empty when it proved
   * nobody right.
   */
  readonly winners: readonly RulingParty[]
  /** The later winners when the credited parties changed. An empty list means nobody won. */
  readonly laterWinners: readonly RulingParty[] | null
  readonly reason: string
}

/** A finding whose round stored the ruler's winner, with the ruler that named it. */
export type RulerWinner = RuledFinding & {
  /** The model and effort the round's rule phase reported, or null without that entry. */
  readonly ruler: ModelIdentity | null
}

/**
 * One auditor, vetter or ruler of a ruled finding, on the side a ruling put
 * it: the round's own winner or a later ruling.
 */
export type RulingParty = {
  readonly role: "auditor" | "vetter" | "ruler"
  /** Null for a ruler whose round kept no rule phase entry. */
  readonly identity: ModelIdentity | null
  /**
   * In a later-ruling row, a vetter's verdict or the winner a ruler named with
   * each vetter as its model. Null in a winners list, whose row shows every
   * verdict beside it.
   */
  readonly detail: string | null
}

type DisprovedBase = {
  readonly stem: string
  readonly workClass: WorkClass
  readonly date: string
  readonly reason: string
  readonly auditor: ModelIdentity
  /**
   * The table for this ruling: ruler winners when the winner changed, vetter
   * verdicts when the finding stood as written, otherwise auditor findings.
   */
  readonly claim: RulingParty["role"]
  /** In the order auditor, vetters in panel order, ruler. */
  readonly wrong: readonly RulingParty[]
  readonly right: readonly RulingParty[]
}

export type DisprovedEvidence =
  | (DisprovedBase & {
      readonly kind: "attached"
      readonly target: string
      readonly round: number
      readonly finding: number
      readonly title: string
      readonly tier: RoundFinding["tier"]
    })
  | (DisprovedBase & {
      readonly kind: "detached"
    })

export type ModelEvidence = {
  readonly auditors: ReadonlyMap<string, AuditorRow>
  readonly coders: ReadonlyMap<string, CoderRow>
  readonly vetPairs: readonly VetPairSample[]
  readonly vetterTimes: Record<WorkClass, ReadonlyMap<string, VetterTimeRow>>
  /** The user's winners, newest round first, then in finding order. */
  readonly rulings: readonly RuledFinding[]
  /** The ruler's winners, in the same order. */
  readonly rulerWinners: readonly RulerWinner[]
  readonly disproved: readonly DisprovedEvidence[]
}

type RoundFileRecord = {
  readonly file: string
  readonly stem: string
  readonly workClass: WorkClass
  readonly data: PlanRoundDataFile
}

type RoundRecord = {
  readonly file: string
  readonly stem: string
  readonly workClass: WorkClass
  readonly data: RoundData
  readonly counts: Record<TierRange, FindingCounts>
}

type HistoryCommit = LogCommit & {
  readonly repository: "repo-edu" | "plan"
  readonly order: number
}

type StepRecord = {
  readonly identity: ModelIdentity
  readonly minutes: number | null
  readonly commit: HistoryCommit
}

type StepShare = {
  readonly record: StepRecord | null
}

/** Why a closed plan's step list could not be read, worded as its exclusion reason. */
type StepListGap = "archived plan unavailable" | "archived step list unreadable"

type PlanEvidence = {
  readonly stem: string
  assignment: Coder | null
  readyCommit: HistoryCommit | null
  closed: boolean
  listedSteps: readonly PlanStep[] | StepListGap
  readonly stepShares: Map<string, StepShare>
  readonly rounds: RoundRecord[]
}

export function modelKey(identity: ModelIdentity): string {
  return JSON.stringify([identity.assistant, identity.model, identity.effort])
}

export function auditorKey(
  identity: Pick<ModelIdentity, "model" | "effort">,
): string {
  return JSON.stringify([identity.model, identity.effort])
}

export function modelText(identity: ModelIdentity): string {
  return `${identity.model} ${identity.effort ?? "effort unavailable"}`
}

function selectionIdentity(
  assistant: Assistant,
  selection: { readonly model: string; readonly effort: string | null },
): ModelIdentity {
  return { assistant, model: selection.model, effort: selection.effort }
}

/** A runner round supplies settled evidence only after its commits and findings agree. */
export function modelRoundComplete(round: {
  readonly status: RoundData["status"]
  readonly commits: readonly RoundData["commits"][number][]
  readonly findings: readonly RoundFinding[]
}): boolean {
  return (
    ["finished", "failed", "interrupted"].includes(round.status) &&
    round.commits.length > 0 &&
    round.findings.every((finding) => finding.outcome !== null)
  )
}

function emptyFindingCounts(): FindingCounts {
  return { kept: 0, dropped: 0, downgraded: 0, disproved: 0 }
}

/**
 * The outcomes of the findings the audit report graded within the range. A kept
 * finding counts as downgraded only when its final tier fell below the range.
 */
function findingCounts(
  findings: readonly RoundFinding[],
  rulings: ReadonlyMap<RoundFinding, LaterRuling>,
  range: TierRange,
): FindingCounts {
  const counts = { ...emptyFindingCounts() }
  for (const finding of findings) {
    if (!tierWithin(finding.tier, range)) continue
    const result = rulings.get(finding) ?? finding
    if (result.outcome === "dropped" || result.outcome === "disproved") {
      counts[result.outcome] += 1
      continue
    }
    if (result.outcome !== "kept") continue
    const finalTier = result.finalTier ?? finding.tier
    if (finalTier < finding.tier || tierWithin(finalTier, range))
      counts.kept += 1
    else counts.downgraded += 1
  }
  return counts
}

function roundDataStem(file: string): string {
  const name = basename(file)
  const match = /^(.+)-(?:plan|impl)-rounds\.json$/.exec(name)
  if (match === null) throw new Error(`Invalid round data filename: ${name}`)
  return match[1]
}

function roundWorkClass(file: string): WorkClass {
  return file.endsWith("-plan-rounds.json") ? "planning" : "implementation"
}

async function readRoundFiles(
  context: ExecutionContext,
): Promise<RoundFileRecord[]> {
  const files = await roundDataFiles(context)
  return Promise.all(
    files.map(async (file) => {
      const display = relative(context.planRoot, file)
      try {
        const data = parseRoundDataFile(file, await readFile(file, "utf8"))
        if (!("disproved" in data))
          throw new Error(`Plan round data has no disproved list: ${display}`)
        return {
          file: display,
          stem: roundDataStem(file),
          workClass: roundWorkClass(file),
          data,
        }
      } catch (error) {
        throw new Error(
          `Invalid round data in ${display}: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        )
      }
    }),
  )
}

function roundRecords(
  files: readonly RoundFileRecord[],
  rulings: ReadonlyMap<RoundFinding, LaterRuling>,
): RoundRecord[] {
  return files
    .flatMap((file) =>
      (file.data.rounds as readonly RoundData[]).map(
        (data): RoundRecord => ({
          file: file.file,
          stem: file.stem,
          workClass: file.workClass,
          data,
          counts: {
            "A/B": findingCounts(data.findings, rulings, "A/B"),
            C: findingCounts(data.findings, rulings, "C"),
          },
        }),
      ),
    )
    .sort(
      (first, second) =>
        first.data.started.localeCompare(second.data.started) ||
        first.file.localeCompare(second.file) ||
        first.data.round - second.data.round,
    )
}

/** Each vetter the round ran, named by its phase entry, with its review of the finding. */
function roundVets(round: RoundData, finding: RoundFinding): RoundVet[] {
  return round.phases.flatMap((phase) =>
    phase.phase === "vet"
      ? [
          {
            tag: phase.tag,
            identity: {
              assistant: phase.assistant,
              model: phase.model,
              effort: phase.effort,
            },
            verdict:
              finding.reviews.find((review) => review.vet === phase.tag)
                ?.verdict ?? null,
          },
        ]
      : [],
  )
}

/** Reviews in panel order, with the model and effort from each vet phase. */
function judgedVets(round: RoundData, finding: RoundFinding) {
  return finding.reviews.flatMap((review) => {
    const vet = round.phases.find(
      (phase) => phase.phase === "vet" && phase.tag === review.vet,
    )
    return vet === undefined
      ? []
      : [{ review, identity: selectionIdentity(vet.assistant, vet) }]
  })
}

/** The round's ruler, as its rule phase entry reported it. */
function roundRuler(round: RoundData): ModelIdentity | null {
  const entry = round.phases.find((phase) => phase.phase === "rule")
  return entry === undefined ? null : selectionIdentity(entry.assistant, entry)
}

type LaterRuling = {
  readonly outcome: RoundFinding["outcome"] | "disproved"
  readonly finalTier: RoundFinding["tier"] | null
  readonly proof: WinnerProof
}

function resolveLaterRuling(
  entry: Extract<DisprovedFinding, { target: string }>,
  finding: RoundFinding,
): LaterRuling {
  const { reviews, tier } = finding
  if ("revision" in entry) {
    const revision = findingRevision(finding, entry.revision)
    return {
      outcome: "kept",
      finalTier: revision.revisedTier ?? tier,
      proof: winnerProof([revision.vet], reviews),
    }
  }
  if (entry.side === "vet")
    return {
      outcome: "kept",
      finalTier: tier,
      proof: winnerProof("report", reviews),
    }
  const drops = reviews
    .filter((review) => review.verdict === "drop")
    .map((review) => review.vet)
  return {
    outcome: finding.outcome === "kept" ? "disproved" : finding.outcome,
    finalTier: null,
    proof: winnerProof(drops.length === 0 ? "neither" : drops, reviews),
  }
}

/**
 * Who the later ruling proved right or wrong. A vetter without a verdict
 * took no part. A vetter that sent a disproved finding to
 * the user took no side either, so it is on neither.
 */
function laterRulingParties(
  later: LaterRuling,
  auditor: ModelIdentity,
  round: RoundData,
  finding: RoundFinding,
): Pick<DisprovedBase, "claim" | "wrong" | "right"> &
  Pick<RuledFinding, "laterWinners"> {
  const wrong: RulingParty[] = []
  const right: RulingParty[] = []
  ;(later.proof.auditor ? right : wrong).push({
    role: "auditor",
    identity: auditor,
    detail: null,
  })
  const vets = judgedVets(round, finding)
  for (const { review, identity } of vets) {
    if (later.outcome !== "kept" && review.verdict === "needs-user-ruling")
      continue
    const proved = later.proof.proves(review)
    ;(proved ? right : wrong).push({
      role: "vetter",
      identity,
      detail: review.verdict,
    })
  }
  const claim = later.proof.auditor ? "vetter" : "auditor"
  const ruling = finding.ruling
  const original = ruling && winnerProof(ruling.winner, finding.reviews)
  const winnersChanged =
    original !== undefined &&
    (original.auditor !== later.proof.auditor ||
      vets.some(
        ({ review }) => original.proves(review) !== later.proof.proves(review),
      ))
  const laterWinners = winnersChanged
    ? right.map((party) => ({ ...party, detail: null }))
    : null
  if (ruling?.namedBy !== "ruler") return { claim, wrong, right, laterWinners }
  const winner = ruling.winner
  const named =
    typeof winner === "string"
      ? winner
      : winner
          .map((tag) => {
            const vet = round.phases.find(
              (phase) => phase.phase === "vet" && phase.tag === tag,
            )
            return vet === undefined
              ? tag
              : modelText(selectionIdentity(vet.assistant, vet))
          })
          .join(", ")
  ;(winnersChanged ? wrong : right).push({
    role: "ruler",
    identity: roundRuler(round),
    detail: `named ${named}`,
  })
  return {
    claim: winnersChanged ? "ruler" : claim,
    wrong,
    right,
    laterWinners,
  }
}

function readLaterRulings(
  files: readonly RoundFileRecord[],
  included: ReadonlySet<RoundData> | undefined,
) {
  const byFinding = new Map<
    RoundFinding,
    LaterRuling & Pick<RuledFinding, "laterWinners">
  >()
  const entries = files
    .flatMap((file) =>
      file.data.disproved.flatMap<DisprovedEvidence>((entry) => {
        if ("auditor" in entry) {
          if (included !== undefined) return []
          const auditor = { assistant: null, ...entry.auditor }
          return {
            kind: "detached",
            stem: file.stem,
            workClass: file.workClass,
            date: entry.date,
            reason: entry.reason,
            auditor,
            claim: "auditor",
            wrong: [{ role: "auditor", identity: auditor, detail: null }],
            right: [],
          }
        }
        const round = (file.data.rounds as readonly RoundData[]).find(
          (candidate) =>
            candidate.target === entry.target &&
            candidate.round === entry.round,
        )
        const finding = round?.findings.find(
          (candidate) => candidate.number === entry.finding,
        )
        if (round === undefined || finding === undefined)
          throw new Error(
            `Later ruling on ${entry.target} round ${entry.round} finding ${entry.finding} has no retained finding in ${file.file}`,
          )
        if (included !== undefined && !included.has(round)) return []
        const auditor = selectionIdentity(
          round.auditor.assistant,
          round.auditor,
        )
        const later = resolveLaterRuling(entry, finding)
        const { laterWinners, ...parties } = laterRulingParties(
          later,
          auditor,
          round,
          finding,
        )
        byFinding.set(finding, { ...later, laterWinners })
        return {
          kind: "attached",
          stem: file.stem,
          workClass: file.workClass,
          date: entry.date,
          reason: entry.reason,
          auditor,
          ...parties,
          target: entry.target,
          round: entry.round,
          finding: entry.finding,
          title: finding.title,
          tier: finding.tier,
        }
      }),
    )
    .sort(
      (first, second) =>
        auditorKey(first.auditor).localeCompare(auditorKey(second.auditor)) ||
        second.date.localeCompare(first.date) ||
        first.stem.localeCompare(second.stem),
    )
  return { byFinding, entries }
}

type LatestRuling = {
  readonly proves: (review: RoundFindingReview) => boolean
  readonly judge: RulingJudge
}

/** Who the winner of a round or a later ruling proved right. */
type WinnerProof = {
  /** Whether the finding stood as written, which proves the auditor right. */
  readonly auditor: boolean
  readonly proves: (review: RoundFindingReview) => boolean
}

/**
 * The one rule for who a round's winner proved right. `report` proves the
 * accepts right, because the finding stood as written, and `neither` proves
 * nobody right. A list proves its named vetters right, and with them every
 * vetter that gave the same accept, drop or referral, because each of those
 * verdicts states one position. A revision is the vetter's own correction, so
 * only a named revision is right. Naming a vetter that accepted says the
 * finding stood, as `report` does.
 */
function winnerProof(
  winner: RulingWinner,
  reviews: readonly RoundFindingReview[],
): WinnerProof {
  if (winner === "report")
    return { auditor: true, proves: (review) => review.verdict === "accept" }
  if (winner === "neither") return { auditor: false, proves: () => false }
  const positions = new Set(
    reviews
      .filter(
        (review) => winner.includes(review.vet) && review.verdict !== "revise",
      )
      .map((review) => review.verdict),
  )
  return {
    auditor: positions.has("accept"),
    proves: (review) =>
      winner.includes(review.vet) || positions.has(review.verdict),
  }
}

/**
 * Everyone the round's winner proved right, in the order auditor, vetters in
 * panel order. A vetter without a verdict on the finding took no part.
 */
function rulingWinners(
  auditor: ModelIdentity,
  round: RoundData,
  finding: RoundFinding,
  winner: RulingWinner,
): RulingParty[] {
  const proof = winnerProof(winner, finding.reviews)
  const auditorParty: RulingParty = {
    role: "auditor",
    identity: auditor,
    detail: null,
  }
  return [
    ...(proof.auditor ? [auditorParty] : []),
    ...judgedVets(round, finding)
      .filter((vet) => proof.proves(vet.review))
      .map(
        (vet): RulingParty => ({
          role: "vetter",
          identity: vet.identity,
          detail: null,
        }),
      ),
  ]
}

/**
 * Which verdicts the latest ruling on a finding proved right and who named it,
 * or null without one. The user's later ruling takes precedence.
 */
function latestRuling(
  finding: RoundFinding,
  later: LaterRuling | undefined,
  ruler: ModelIdentity | null,
): LatestRuling | null {
  const user = { kind: "user" } as const
  if (later !== undefined) return { proves: later.proof.proves, judge: user }
  if (finding.ruling === undefined) return null
  return {
    proves: winnerProof(finding.ruling.winner, finding.reviews).proves,
    judge:
      finding.ruling.namedBy === "user"
        ? user
        : { kind: "ruler", identity: ruler },
  }
}

function pairEnding(firstRight: boolean, secondRight: boolean): PairEnding {
  if (firstRight && secondRight) return "both"
  if (firstRight) return "first"
  return secondRight ? "second" : "neither"
}

/** Count each model's rounds once and pool the recorded vetter runs in those rounds. */
function vetterTimes(
  records: readonly RoundRecord[],
): ModelEvidence["vetterTimes"] {
  const rows = {
    planning: new Map<string, VetterTimeRow>(),
    implementation: new Map<string, VetterTimeRow>(),
  }
  for (const { data, workClass } of records) {
    const panel = data.phases.filter((phase) => phase.phase === "vet")
    const panelMilliseconds = panel.reduce(
      (sum, vet) => sum + vet.milliseconds,
      0,
    )
    for (const [key, runs] of Map.groupBy(panel, auditorKey)) {
      const row = rows[workClass].get(key) ?? {
        identity: selectionIdentity(runs[0].assistant, runs[0]),
        rounds: 0,
        ownRuns: 0,
        ownMilliseconds: 0,
        panelRuns: 0,
        panelMilliseconds: 0,
      }
      row.rounds += 1
      row.ownRuns += runs.length
      for (const run of runs) row.ownMilliseconds += run.milliseconds
      row.panelRuns += panel.length
      row.panelMilliseconds += panelMilliseconds
      rows[workClass].set(key, row)
    }
  }
  return rows
}

/**
 * One sample per pair of panel vetters and finding they both judged. A round
 * of one vetter has no pair, so it supplies none.
 */
function vetPairSamples(
  records: readonly RoundRecord[],
  rulings: ReadonlyMap<RoundFinding, LaterRuling>,
): VetPairSample[] {
  return records.flatMap((record) => {
    const auditor = selectionIdentity(
      record.data.auditor.assistant,
      record.data.auditor,
    )
    const ruler = roundRuler(record.data)
    return record.data.findings.flatMap((finding) => {
      const grade = highestGrade(finding)
      const ruling = latestRuling(finding, rulings.get(finding), ruler)
      const judged = judgedVets(record.data, finding)
      return judged.flatMap((left, index) =>
        judged.slice(index + 1).map((right): VetPairSample => {
          const [first, second] =
            modelText(right.identity).localeCompare(modelText(left.identity)) <
            0
              ? [right, left]
              : [left, right]
          return {
            workClass: record.workClass,
            grade,
            auditor,
            first: { identity: first.identity, verdict: first.review.verdict },
            second: {
              identity: second.identity,
              verdict: second.review.verdict,
            },
            ruling:
              reviewsSplit(first.review, second.review) && ruling !== null
                ? {
                    ending: pairEnding(
                      ruling.proves(first.review),
                      ruling.proves(second.review),
                    ),
                    judge: ruling.judge,
                  }
                : null,
          }
        }),
      )
    })
  })
}

/**
 * Every finding with a stored winner, newest round first and in finding order
 * within a round, split by who named the winner. The user's and the ruler's
 * stay apart, so the user can check the ruler's winners without them burying
 * the user's own.
 */
function ruledFindings(
  records: readonly RoundRecord[],
  rulings: ReadonlyMap<RoundFinding, Pick<RuledFinding, "laterWinners">>,
): {
  readonly user: RuledFinding[]
  readonly ruler: RulerWinner[]
} {
  const user: RuledFinding[] = []
  const ruler: RulerWinner[] = []
  for (const record of [...records].reverse()) {
    const auditor = selectionIdentity(
      record.data.auditor.assistant,
      record.data.auditor,
    )
    for (const finding of record.data.findings) {
      if (finding.ruling === undefined || finding.number === null) continue
      const entry: RuledFinding = {
        workClass: record.workClass,
        stem: record.stem,
        target: record.data.target,
        round: record.data.round,
        finding: finding.number,
        title: finding.title,
        tier: finding.tier,
        auditor,
        vets: roundVets(record.data, finding),
        winners: rulingWinners(
          auditor,
          record.data,
          finding,
          finding.ruling.winner,
        ),
        laterWinners: rulings.get(finding)?.laterWinners ?? null,
        reason: finding.ruling.reason,
      }
      if (finding.ruling.namedBy === "user") user.push(entry)
      else ruler.push({ ...entry, ruler: roundRuler(record.data) })
    }
  }
  return { user, ruler }
}

function auditorRows(
  records: readonly RoundRecord[],
  disproved: readonly DisprovedEvidence[],
  included: ReadonlySet<RoundData> | undefined,
): Map<string, AuditorRow> {
  const rows = new Map<string, AuditorRow>()
  const firstCompleteRounds = new Set<string>()
  const ensureRow = (identity: ModelIdentity) => {
    const key = auditorKey(identity)
    const row: AuditorRow = rows.get(key) ?? {
      identity,
      samples: [],
      detachedDisproved: { planning: [], implementation: [] },
    }
    rows.set(key, row)
    return row
  }
  for (const record of records) {
    const complete = modelRoundComplete(record.data)
    const planClass = `${record.workClass}:${record.stem}`
    const first = !firstCompleteRounds.has(planClass)
    if (complete) firstCompleteRounds.add(planClass)
    if (included !== undefined && !included.has(record.data)) continue
    const identity = selectionIdentity(
      record.data.auditor.assistant,
      record.data.auditor,
    )
    const row = ensureRow(identity)
    if (!complete) continue
    const owned = record.data.phases.filter(
      (phase) => phase.phase === "audit" || phase.phase === "rebut",
    )
    row.samples.push({
      plan: record.stem,
      started: record.data.started,
      first,
      workClass: record.workClass,
      minutes:
        owned.reduce((total, phase) => total + phase.milliseconds, 0) / 60_000,
      counts: record.counts,
    })
  }
  for (const entry of disproved)
    if (entry.kind === "detached")
      ensureRow(entry.auditor).detachedDisproved[entry.workClass].push(
        entry.stem,
      )
  return rows
}

function historyCommits(
  repository: "repo-edu" | "plan",
  commits: readonly LogCommit[],
): HistoryCommit[] {
  return commits.map((commit, order) => ({ ...commit, repository, order }))
}

function subjectAssistant(subject: string): Assistant | null {
  const tag = subject.split(" ")[1]
  const match = /^([ao])[btu][lmhx]$/.exec(tag ?? "")
  return match?.[1] === "a" ? "claude" : match?.[1] === "o" ? "codex" : null
}

function stepRecord(commit: HistoryCommit): StepRecord | null {
  const assistant = subjectAssistant(commit.subject)
  if (assistant === null) return null
  let record: readonly string[]
  try {
    record = readModelRecord(commit.body)
  } catch {
    return null
  }
  const selection = /^(\S+) (low|medium|high|xhigh)$/.exec(record[0] ?? "")
  if (selection === null) return null
  let minutes: number | null = null
  try {
    minutes = readStepModelRecord(commit.body).minutes
  } catch {
    // Step records from before active timing still contribute through their commit span.
  }
  return {
    identity: { assistant, model: selection[1], effort: selection[2] },
    minutes,
    commit,
  }
}

function planEvidence(
  stem: string,
  plans: Map<string, PlanEvidence>,
): PlanEvidence {
  const found = plans.get(stem)
  if (found !== undefined) return found
  const created: PlanEvidence = {
    stem,
    assignment: null,
    readyCommit: null,
    closed: false,
    listedSteps: "archived plan unavailable",
    stepShares: new Map(),
    rounds: [],
  }
  plans.set(stem, created)
  return created
}

function fixIdentity(phase: RoundData["phases"][number]): ModelIdentity {
  return {
    assistant: phase.assistant,
    model: phase.model,
    effort: phase.effort,
  }
}

function historyKey(repository: HistoryCommit["repository"], sha: string) {
  return `${repository}:${sha.toLowerCase()}`
}

function stepShareKey(repository: HistoryCommit["repository"], step: number) {
  return `${repository}:${step}`
}

function expectedStepShareKeys(steps: readonly PlanStep[]): string[] {
  return steps.flatMap((step) =>
    step.repositories.map((repository) =>
      stepShareKey(repository, step.number),
    ),
  )
}

function listedStepRecords(plan: PlanEvidence): StepRecord[] | null {
  if (typeof plan.listedSteps === "string") return null
  const records: StepRecord[] = []
  for (const key of expectedStepShareKeys(plan.listedSteps)) {
    const share = plan.stepShares.get(key)
    if (share?.record === undefined || share.record === null) return null
    records.push(share.record)
  }
  return records
}

function stepRecords(plan: PlanEvidence, step: PlanStep): StepRecord[] | null {
  const records: StepRecord[] = []
  for (const repository of step.repositories) {
    const record = plan.stepShares.get(
      stepShareKey(repository, step.number),
    )?.record
    if (record === undefined || record === null) return null
    records.push(record)
  }
  return records
}

function laterCommit(records: readonly StepRecord[]): HistoryCommit {
  return records.reduce(
    (latest, record) =>
      Date.parse(record.commit.committedAt) > Date.parse(latest.committedAt)
        ? record.commit
        : latest,
    records[0].commit,
  )
}

function implementationMinutes(plan: PlanEvidence): number | null {
  if (typeof plan.listedSteps === "string") return null
  let previous = plan.readyCommit
  let total = 0
  for (const step of plan.listedSteps) {
    const records = stepRecords(plan, step)
    if (records === null) return null
    const latest = laterCommit(records)
    if (records.every((record) => record.minutes !== null))
      total += records.reduce(
        (minutes, record) => minutes + (record.minutes ?? 0),
        0,
      )
    else {
      if (previous === null) return null
      const span =
        Date.parse(latest.committedAt) - Date.parse(previous.committedAt)
      if (!Number.isFinite(span) || span < 0) return null
      total += span / 60_000
    }
    previous = latest
  }
  return total
}

function hasWholePlanAudit(
  plan: PlanEvidence,
  history: ReadonlyMap<string, HistoryCommit>,
): boolean {
  if (typeof plan.listedSteps === "string") return false
  const finalStep = plan.listedSteps.length
  if (finalStep === 0) return false
  const records = listedStepRecords(plan)
  if (records === null) return false
  const scope = finalStep === 1 ? "1" : `1-${finalStep}`
  const newerThanStep = (audit: HistoryCommit, step: StepRecord) =>
    audit.repository === step.commit.repository
      ? audit.order < step.commit.order
      : Date.parse(audit.committedAt) > Date.parse(step.commit.committedAt)
  return plan.rounds.some(
    (round) =>
      modelRoundComplete(round.data) &&
      "scope" in round.data &&
      round.data.scope === scope &&
      round.data.commits.some((commit) => {
        const record = history.get(historyKey(commit.repository, commit.sha))
        const form = record === undefined ? null : planForm(record.subject)
        return (
          record !== undefined &&
          records.every((step) => newerThanStep(record, step)) &&
          form?.stem === plan.stem &&
          form.role === `impl-audit-${scope}`
        )
      }),
  )
}

async function readArchivedPlanSteps(
  context: ExecutionContext,
  plan: PlanEvidence,
): Promise<readonly PlanStep[] | StepListGap> {
  const archivedRound = plan.rounds.find(
    (round) => round.file.split(sep)[0] === "archive",
  )
  if (archivedRound === undefined) return "archived plan unavailable"
  const directory = dirname(join(context.planRoot, archivedRound.file))
  for (const path of [
    join(directory, `${plan.stem}.md`),
    join(directory, "plan.md"),
  ]) {
    let source: string
    try {
      source = await readFile(path, "utf8")
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue
      throw new Error(
        `Invalid archived plan ${relative(context.planRoot, path)}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      )
    }
    try {
      return readPlanSteps(source)
    } catch {
      return "archived step list unreadable"
    }
  }
  return "archived plan unavailable"
}

/**
 * The ready marker records the launched selection, which may be a family
 * alias such as `opus`, while every step record names the release the CLI
 * reported. The read-out performs no release lookup, so it matches the
 * assignment on assistant and effort and leaves the release to the records.
 */
function matchesAssignment(
  assignment: Coder,
  identity: ModelIdentity,
): boolean {
  return (
    identity.assistant === assignment.assistant &&
    identity.effort === assignment.effort
  )
}

function excludedPlanReason(
  plan: PlanEvidence,
  actual: ReadonlyMap<string, ModelIdentity>,
  history: ReadonlyMap<string, HistoryCommit>,
): string {
  if (!plan.closed) return "not closed"
  if (plan.rounds.length === 0) return "no implementation round data"
  if (typeof plan.listedSteps === "string") return plan.listedSteps
  const expectedShares = expectedStepShareKeys(plan.listedSteps)
  if (expectedShares.some((key) => !plan.stepShares.has(key)))
    return "implementation shares missing"
  if (expectedShares.some((key) => plan.stepShares.get(key)?.record === null))
    return "step model record unreadable"
  if (!hasWholePlanAudit(plan, history))
    return "no complete whole-plan audit after the final step"
  if (actual.size !== 1) return "mixed model records"
  const [identity] = actual.values()
  if (plan.assignment !== null && !matchesAssignment(plan.assignment, identity))
    return "coder differs from the ready assignment"
  return ""
}

/** An admitted plan's implementation minutes, or the reason the plan is excluded. */
function planAdmission(
  plan: PlanEvidence,
  actual: ReadonlyMap<string, ModelIdentity>,
  history: ReadonlyMap<string, HistoryCommit>,
): number | string {
  const reason = excludedPlanReason(plan, actual, history)
  if (reason.length > 0) return reason
  return implementationMinutes(plan) ?? "implementation time unreadable"
}

async function coderRows(
  context: ExecutionContext,
  records: readonly RoundRecord[],
  from: Date | undefined,
): Promise<Map<string, CoderRow>> {
  const logs = await readImplementationLogs(context)
  const repoEduHistory = historyCommits("repo-edu", logs["repo-edu"])
  const planHistory = historyCommits("plan", logs.plan)
  const history = new Map(
    [...repoEduHistory, ...planHistory].map((commit) => [
      historyKey(commit.repository, commit.sha),
      commit,
    ]),
  )
  const plans = new Map<string, PlanEvidence>()
  for (const record of records)
    if (record.workClass === "implementation")
      planEvidence(record.stem, plans).rounds.push(record)
  for (const commit of [...repoEduHistory, ...planHistory]) {
    const form = planForm(commit.subject)
    if (form === null) continue
    const plan = planEvidence(form.stem, plans)
    if (form.role === "ready" && commit.repository === "plan") {
      if (plan.readyCommit === null) plan.readyCommit = commit
      if (plan.assignment === null)
        plan.assignment = parseCoderRecord(commit.body)
      continue
    }
    if (form.role === "closed" && commit.repository === "plan") {
      plan.closed = true
      continue
    }
    if (!form.role.startsWith("impl-") || form.role.startsWith("impl-audit-"))
      continue
    const scope = form.role.slice("impl-".length)
    if (!/^[1-9]\d*$/.test(scope)) continue
    const step = Number(scope)
    const key = stepShareKey(commit.repository, step)
    if (!plan.stepShares.has(key))
      plan.stepShares.set(key, { record: stepRecord(commit) })
  }
  // A coder sample covers the whole implementation, starting with its ready marker.
  // Keep all its step records and audits together on either side of the cutoff.
  const selectedPlans = [...plans.values()].filter(
    (plan) =>
      from === undefined ||
      (plan.readyCommit !== null &&
        Date.parse(plan.readyCommit.committedAt) >= from.getTime() &&
        plan.rounds.every(
          (round) => Date.parse(round.data.started) >= from.getTime(),
        )),
  )
  await Promise.all(
    selectedPlans.map(async (plan) => {
      if (plan.closed)
        plan.listedSteps = await readArchivedPlanSteps(context, plan)
    }),
  )

  const rows = new Map<string, CoderRow>()
  const ensureRow = (identity: ModelIdentity) => {
    const key = modelKey(identity)
    const row = rows.get(key) ?? {
      identity,
      samples: [],
      excluded: new Map<string, string>(),
    }
    rows.set(key, row)
    return row
  }

  for (const plan of selectedPlans) {
    const actual = new Map<string, ModelIdentity>()
    const expectedShares =
      typeof plan.listedSteps === "string"
        ? new Set(plan.stepShares.keys())
        : new Set(expectedStepShareKeys(plan.listedSteps))
    for (const [key, share] of plan.stepShares)
      if (expectedShares.has(key) && share.record !== null)
        actual.set(modelKey(share.record.identity), share.record.identity)
    for (const round of plan.rounds)
      for (const phase of round.data.phases.filter(
        (candidate) => candidate.phase === "fix",
      )) {
        const identity = fixIdentity(phase)
        actual.set(modelKey(identity), identity)
      }
    if (actual.size === 0) continue
    const admission = planAdmission(plan, actual, history)
    const stepCount =
      typeof plan.listedSteps === "string" ? 0 : plan.listedSteps.length
    for (const identity of actual.values()) {
      const row = ensureRow(identity)
      if (typeof admission === "string") {
        row.excluded.set(plan.stem, admission)
        continue
      }
      const complete = plan.rounds.filter((round) =>
        modelRoundComplete(round.data),
      )
      const kept = (range: TierRange) =>
        complete.reduce((total, round) => total + round.counts[range].kept, 0)
      const fixMinutes = plan.rounds
        .flatMap((round) => round.data.phases)
        .filter((phase) => phase.phase === "fix")
        .reduce((total, phase) => total + phase.milliseconds / 60_000, 0)
      row.samples.push({
        stem: plan.stem,
        steps: stepCount,
        kept: { "A/B": kept("A/B"), C: kept("C") },
        minutes: (admission + fixMinutes) / stepCount,
      })
    }
  }
  return rows
}

/** Load the retained round data once, then join the two commit histories. */
export async function readModelEvidence(
  context: ExecutionContext,
  from?: Date,
): Promise<ModelEvidence> {
  const files = await readRoundFiles(context)
  const included =
    from === undefined
      ? undefined
      : new Set<RoundData>(
          files.flatMap((file) =>
            file.data.rounds.filter(
              (round) => Date.parse(round.started) >= from.getTime(),
            ),
          ),
        )
  const { byFinding, entries } = readLaterRulings(files, included)
  const allRecords = roundRecords(files, byFinding)
  const records =
    included === undefined
      ? allRecords
      : allRecords.filter((record) => included.has(record.data))
  const winners = ruledFindings(records, byFinding)
  return {
    auditors: auditorRows(allRecords, entries, included),
    coders: await coderRows(context, allRecords, from),
    vetPairs: vetPairSamples(records, byFinding),
    vetterTimes: vetterTimes(records),
    rulings: winners.user,
    rulerWinners: winners.ruler,
    disproved: entries,
  }
}
