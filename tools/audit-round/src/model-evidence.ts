import { readFile } from "node:fs/promises"
import { basename, dirname, join, relative, sep } from "node:path"
import { readModelRecord, readStepModelRecord } from "./commit-msg.js"
import type { ExecutionContext } from "./context.js"
import { readImplementationLogs } from "./default-target.js"
import type { LogCommit } from "./episode-log.js"
import type { ReadingSample } from "./model-comparison.js"
import type { Assistant } from "./phase.js"
import { type PlanStep, readPlanSteps } from "./plan-steps.js"
import {
  type DisprovedFinding,
  parseRoundDataFile,
  type RoundData,
  type RoundDataFile,
  type RoundFinding,
  roundDataFiles,
} from "./round-data.js"
import { type Coder, parseCoderRecord } from "./settings.js"
import { looseForm } from "./subject.js"

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

export type AuditorSample = ReadingSample & {
  readonly workClass: WorkClass
  readonly counts: FindingCounts
}

export type AuditorRow = {
  readonly identity: ModelIdentity
  readonly samples: AuditorSample[]
  readonly detachedDisproved: Record<WorkClass, number>
}

export type CoderSample = Pick<ReadingSample, "yield"> & {
  readonly stem: string
  readonly steps: number
  readonly kept: number
}

export type CoderTimeSample = {
  readonly stem: string
  readonly steps: number
  readonly minutes: number
}

export type CoderRow = {
  readonly identity: ModelIdentity
  readonly yieldSamples: CoderSample[]
  readonly timeSamples: CoderTimeSample[]
  readonly excluded: Map<string, string>
}

type DisprovedBase = {
  readonly stem: string
  readonly workClass: WorkClass
  readonly date: string
  readonly reason: string
  readonly auditor: ModelIdentity
}

export type DisprovedEvidence =
  | (DisprovedBase & {
      readonly kind: "attached"
      readonly target: string
      readonly round: number
      readonly finding: number
      readonly title: string
      readonly tier: RoundFinding["tier"]
      readonly vet: ModelIdentity | null
      readonly vetVerdict: RoundFinding["vetVerdict"]
    })
  | (DisprovedBase & {
      readonly kind: "detached"
    })

export type ModelEvidence = {
  readonly auditors: ReadonlyMap<string, AuditorRow>
  readonly coders: ReadonlyMap<string, CoderRow>
  readonly disproved: readonly DisprovedEvidence[]
}

type RoundFileRecord = {
  readonly file: string
  readonly stem: string
  readonly workClass: WorkClass
  readonly data: RoundDataFile
}

type RoundRecord = {
  readonly file: string
  readonly stem: string
  readonly workClass: WorkClass
  readonly data: RoundData
  readonly disprovedFindingNumbers: ReadonlySet<number>
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

type PlanEvidence = {
  readonly stem: string
  assignment: Coder | null
  readyCommit: HistoryCommit | null
  closed: boolean
  listedSteps: readonly PlanStep[] | null
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

function finalTier(finding: RoundFinding): RoundFinding["tier"] {
  return finding.finalTier ?? finding.tier
}

function emptyFindingCounts(): FindingCounts {
  return { kept: 0, dropped: 0, downgraded: 0, disproved: 0 }
}

function findingCounts(
  findings: readonly RoundFinding[],
  disproved: ReadonlySet<number>,
): FindingCounts {
  const counts = { ...emptyFindingCounts() }
  for (const finding of findings) {
    if (finding.tier !== "A" && finding.tier !== "B") continue
    if (finding.outcome === "dropped") {
      counts.dropped += 1
      continue
    }
    if (finding.outcome !== "kept") continue
    if (finding.number !== null && disproved.has(finding.number)) {
      counts.disproved += 1
      continue
    }
    if (finalTier(finding) === "A" || finalTier(finding) === "B")
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

function attachedNumbers(
  disproved: readonly DisprovedFinding[],
  round: RoundData,
): ReadonlySet<number> {
  return new Set(
    disproved.flatMap((entry) =>
      "target" in entry &&
      entry.target === round.target &&
      entry.round === round.round
        ? [entry.finding]
        : [],
    ),
  )
}

async function readRoundFiles(
  context: ExecutionContext,
): Promise<RoundFileRecord[]> {
  const files = await roundDataFiles(context.planRoot)
  return Promise.all(
    files.map(async (file) => {
      const display = relative(context.planRoot, file)
      try {
        return {
          file: display,
          stem: roundDataStem(file),
          workClass: roundWorkClass(file),
          data: parseRoundDataFile(file, await readFile(file, "utf8")),
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

function roundRecords(files: readonly RoundFileRecord[]): RoundRecord[] {
  return files
    .flatMap((file) =>
      (file.data.rounds as readonly RoundData[]).map(
        (data): RoundRecord => ({
          file: file.file,
          stem: file.stem,
          workClass: file.workClass,
          data,
          disprovedFindingNumbers: attachedNumbers(file.data.disproved, data),
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

function reportedVet(round: RoundData): ModelIdentity | null {
  const phase = round.phases.find((candidate) => candidate.phase === "vet")
  if (phase === undefined) return null
  return {
    assistant: phase.assistant,
    model: phase.model,
    effort: phase.effort,
  }
}

function disprovedEvidence(
  files: readonly RoundFileRecord[],
): DisprovedEvidence[] {
  return files
    .flatMap((file) =>
      file.data.disproved.map((entry): DisprovedEvidence => {
        if ("auditor" in entry)
          return {
            kind: "detached",
            stem: file.stem,
            workClass: file.workClass,
            date: entry.date,
            reason: entry.reason,
            auditor: { assistant: null, ...entry.auditor },
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
            `Disproved finding ${entry.target} round ${entry.round} finding ${entry.finding} has no retained finding in ${file.file}`,
          )
        return {
          kind: "attached",
          stem: file.stem,
          workClass: file.workClass,
          date: entry.date,
          reason: entry.reason,
          auditor: selectionIdentity(round.auditor.assistant, round.auditor),
          target: entry.target,
          round: entry.round,
          finding: entry.finding,
          title: finding.title,
          tier: finding.tier,
          vet: reportedVet(round),
          vetVerdict: finding.vetVerdict,
        }
      }),
    )
    .sort(
      (first, second) =>
        auditorKey(first.auditor).localeCompare(auditorKey(second.auditor)) ||
        second.date.localeCompare(first.date) ||
        first.stem.localeCompare(second.stem),
    )
}

function auditorRows(
  records: readonly RoundRecord[],
  disproved: readonly DisprovedEvidence[],
): Map<string, AuditorRow> {
  const rows = new Map<string, AuditorRow>()
  const ensureRow = (identity: ModelIdentity) => {
    const key = auditorKey(identity)
    const row = rows.get(key) ?? {
      identity,
      samples: [],
      detachedDisproved: { planning: 0, implementation: 0 },
    }
    rows.set(key, row)
    return row
  }
  for (const record of records) {
    const identity = selectionIdentity(
      record.data.auditor.assistant,
      record.data.auditor,
    )
    const row = ensureRow(identity)
    if (!modelRoundComplete(record.data)) continue
    const owned = record.data.phases.filter(
      (phase) => phase.phase === "audit" || phase.phase === "rebut",
    )
    const counts = findingCounts(
      record.data.findings,
      record.disprovedFindingNumbers,
    )
    row.samples.push({
      workClass: record.workClass,
      yield: counts.kept,
      minutes:
        owned.reduce((total, phase) => total + phase.milliseconds, 0) / 60_000,
      counts,
    })
  }
  for (const entry of disproved)
    if (entry.kind === "detached")
      ensureRow(entry.auditor).detachedDisproved[entry.workClass] += 1
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
    listedSteps: null,
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
  if (plan.listedSteps === null) return null
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
  if (plan.listedSteps === null) return null
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
  const finalStep = plan.listedSteps?.length ?? 0
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
        const form = record === undefined ? null : looseForm(record.subject)
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
): Promise<readonly PlanStep[] | null> {
  const archivedRound = plan.rounds.find(
    (round) => round.file.split(sep)[0] === "archive",
  )
  if (archivedRound === undefined) return null
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
      return null
    }
  }
  return null
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
  if (plan.listedSteps === null) return "archived plan unavailable"
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

async function coderRows(
  context: ExecutionContext,
  records: readonly RoundRecord[],
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
    const form = looseForm(commit.subject)
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
  await Promise.all(
    [...plans.values()].map(async (plan) => {
      if (plan.closed)
        plan.listedSteps = await readArchivedPlanSteps(context, plan)
    }),
  )

  const rows = new Map<string, CoderRow>()
  const ensureRow = (identity: ModelIdentity) => {
    const key = modelKey(identity)
    const row = rows.get(key) ?? {
      identity,
      yieldSamples: [],
      timeSamples: [],
      excluded: new Map<string, string>(),
    }
    rows.set(key, row)
    return row
  }

  for (const plan of plans.values()) {
    const actual = new Map<string, ModelIdentity>()
    const expectedShares =
      plan.listedSteps === null
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
    const reason = excludedPlanReason(plan, actual, history)
    const stepCount = plan.listedSteps?.length ?? 0
    for (const identity of actual.values()) {
      const row = ensureRow(identity)
      if (reason.length > 0) {
        row.excluded.set(plan.stem, reason)
        continue
      }
      const kept = plan.rounds
        .filter((round) => modelRoundComplete(round.data))
        .reduce(
          (total, round) =>
            total +
            findingCounts(round.data.findings, round.disprovedFindingNumbers)
              .kept,
          0,
        )
      row.yieldSamples.push({
        stem: plan.stem,
        steps: stepCount,
        kept,
        yield: kept / stepCount,
      })
      const stepMinutes = implementationMinutes(plan)
      if (stepMinutes !== null) {
        const fixMinutes = plan.rounds
          .flatMap((round) => round.data.phases)
          .filter((phase) => phase.phase === "fix")
          .reduce((total, phase) => total + phase.milliseconds / 60_000, 0)
        row.timeSamples.push({
          stem: plan.stem,
          steps: stepCount,
          minutes: (stepMinutes + fixMinutes) / stepCount,
        })
      }
    }
  }
  return rows
}

/** Load the retained round data once, then join the two commit histories. */
export async function readModelEvidence(
  context: ExecutionContext,
): Promise<ModelEvidence> {
  const files = await readRoundFiles(context)
  const records = roundRecords(files)
  const disproved = disprovedEvidence(files)
  return {
    auditors: auditorRows(records, disproved),
    coders: await coderRows(context, records),
    disproved,
  }
}
