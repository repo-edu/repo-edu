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
  type ModelTokenUsage,
  parseRoundDataFile,
  type RoundData,
  type RoundFinding,
  roundDataFiles,
} from "./round-data.js"
import { type Coder, parseCoderRecord } from "./settings.js"
import { looseForm } from "./subject.js"

export type WorkClass = "planning" | "implementation"

export type ModelIdentity = {
  readonly assistant: Assistant
  readonly model: string
  readonly effort: string | null
}

export type TokenTotals = Map<string, Omit<ModelTokenUsage, "model">>

export type AuditorSample = ReadingSample & {
  readonly workClass: WorkClass
  readonly position: "first" | "later" | "manual"
  readonly active: ReadonlySet<string>
  readonly dropped: number
  readonly tokens: TokenTotals
}

export type AuditorRow = {
  readonly identity: ModelIdentity
  readonly samples: AuditorSample[]
  readonly vets: Set<string>
}

export type CoderSample = Pick<ReadingSample, "yield"> & {
  readonly stem: string
  readonly dropped: number
}

export type CoderTimeSample = {
  readonly stem: string
  readonly minutes: number
}

export type CoderRow = {
  readonly identity: ModelIdentity
  readonly yieldSamples: CoderSample[]
  readonly timeSamples: CoderTimeSample[]
  readonly excluded: Map<string, string>
  readonly tokens: TokenTotals
  tokenSteps: number
}

export type ModelEvidence = {
  readonly auditors: ReadonlyMap<string, AuditorRow>
  readonly currentAuditors: readonly string[]
  readonly coders: ReadonlyMap<string, CoderRow>
}

type RoundRecord = {
  readonly file: string
  readonly stem: string
  readonly workClass: WorkClass
  readonly data: RoundData
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
  closed: boolean
  listedSteps: readonly PlanStep[] | null
  readonly stepShares: Map<string, StepShare>
  readonly rounds: RoundRecord[]
}

export function modelKey(identity: ModelIdentity): string {
  return JSON.stringify([identity.assistant, identity.model, identity.effort])
}

export function modelText(identity: ModelIdentity): string {
  return `${identity.assistant} ${identity.model} ${identity.effort ?? "effort unavailable"}`
}

function selectionIdentity(
  assistant: Assistant,
  selection: { readonly model: string; readonly effort: string | null },
): ModelIdentity {
  return { assistant, model: selection.model, effort: selection.effort }
}

export function addTokens(
  target: TokenTotals,
  source: readonly ModelTokenUsage[],
): void {
  for (const usage of source) {
    const current = target.get(usage.model) ?? {
      input: 0,
      cached: 0,
      output: 0,
    }
    target.set(usage.model, {
      input: current.input + usage.input,
      cached: current.cached + usage.cached,
      output: current.output + usage.output,
    })
  }
}

export function mergeTokens(target: TokenTotals, source: TokenTotals): void {
  addTokens(
    target,
    [...source].map(([model, usage]) => ({ model, ...usage })),
  )
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

function acceptedYield(findings: readonly RoundFinding[]): number {
  return findings.filter(
    (finding) =>
      finding.outcome === "kept" &&
      (finalTier(finding) === "A" || finalTier(finding) === "B"),
  ).length
}

function droppedYield(findings: readonly RoundFinding[]): number {
  return findings.filter(
    (finding) =>
      finding.outcome === "dropped" &&
      (finding.tier === "A" || finding.tier === "B"),
  ).length
}

function roundAuditKeys(round: RoundData): ReadonlySet<string> {
  const keys = new Set<string>()
  for (const assistant of ["claude", "codex"] as const) {
    const selection = round.settings.audit[assistant]
    keys.add(modelKey(selectionIdentity(assistant, selection)))
  }
  return keys
}

function roundDataStem(file: string): string {
  const name = basename(file)
  const match = /^(.+)-(?:plan|impl)-rounds\.json$/.exec(name)
  if (match === null) throw new Error(`Invalid round data filename: ${name}`)
  return match[1]
}

async function readRoundRecords(
  context: ExecutionContext,
): Promise<RoundRecord[]> {
  const files = await roundDataFiles(context.planRoot)
  const records = (
    await Promise.all(
      files.map(async (file) => {
        const display = relative(context.planRoot, file)
        let entries: RoundData[]
        try {
          entries = [...parseRoundDataFile(file, await readFile(file, "utf8"))]
        } catch (error) {
          throw new Error(
            `Invalid round data in ${display}: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error },
          )
        }
        return entries.map(
          (data): RoundRecord => ({
            file: display,
            stem: roundDataStem(file),
            workClass: "phase" in data ? "planning" : "implementation",
            data,
          }),
        )
      }),
    )
  ).flat()
  return records.sort(
    (first, second) =>
      first.data.started.localeCompare(second.data.started) ||
      first.file.localeCompare(second.file) ||
      first.data.round - second.data.round,
  )
}

function auditorRows(records: readonly RoundRecord[]): Map<string, AuditorRow> {
  const rows = new Map<string, AuditorRow>()
  const targetKey = (record: RoundRecord) =>
    JSON.stringify([record.workClass, record.stem, record.data.target])
  const firstFinishedRounds = new Map<string, number>()
  for (const record of records) {
    if (!modelRoundComplete(record.data)) continue
    const key = targetKey(record)
    const first = firstFinishedRounds.get(key)
    if (first === undefined || record.data.round < first)
      firstFinishedRounds.set(key, record.data.round)
  }
  for (const record of records) {
    const identity = selectionIdentity(
      record.data.auditor.assistant,
      record.data.auditor,
    )
    const key = modelKey(identity)
    const row = rows.get(key) ?? {
      identity,
      samples: [],
      vets: new Set<string>(),
    }
    const vetAssistant = identity.assistant === "claude" ? "codex" : "claude"
    const vet = record.data.settings.vet[vetAssistant]
    row.vets.add(`${vet.model} ${vet.effort ?? "effort unavailable"}`)
    if (modelRoundComplete(record.data)) {
      const firstFinished =
        firstFinishedRounds.get(targetKey(record)) === record.data.round
      const owned = record.data.phases.filter(
        (phase) => phase.phase === "audit" || phase.phase === "rebut",
      )
      const tokens: TokenTotals = new Map()
      for (const phase of owned) addTokens(tokens, phase.tokens)
      row.samples.push({
        workClass: record.workClass,
        position:
          record.data.auditor.chosenBy !== "settings"
            ? "manual"
            : firstFinished
              ? "first"
              : "later",
        active: roundAuditKeys(record.data),
        yield: acceptedYield(record.data.findings),
        dropped: droppedYield(record.data.findings),
        minutes:
          owned.reduce((total, phase) => total + phase.milliseconds, 0) /
          60_000,
        tokens,
      })
    }
    rows.set(key, row)
  }
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
    // Older step records still create their descriptive row, but cannot rank.
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

function hasWholePlanAudit(
  plan: PlanEvidence,
  history: ReadonlyMap<string, HistoryCommit>,
): boolean {
  const finalStep = plan.listedSteps?.length ?? 0
  if (finalStep === 0) return false
  const stepRecords = listedStepRecords(plan)
  if (stepRecords === null) return false
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
          stepRecords.every((step) => newerThanStep(record, step)) &&
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

function excludedPlanReason(
  plan: PlanEvidence,
  actual: ReadonlySet<string>,
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
  if (plan.assignment !== null && !actual.has(modelKey(plan.assignment)))
    return "mixed model records"
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
  for (const record of records) {
    if (record.workClass === "implementation")
      planEvidence(record.stem, plans).rounds.push(record)
  }
  for (const commit of [...repoEduHistory, ...planHistory]) {
    const form = looseForm(commit.subject)
    if (form === null) continue
    const plan = planEvidence(form.stem, plans)
    if (form.role === "ready" && commit.repository === "plan") {
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
      plan.stepShares.set(key, {
        record: stepRecord(commit),
      })
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
      tokens: new Map<string, Omit<ModelTokenUsage, "model">>(),
      tokenSteps: 0,
    }
    rows.set(key, row)
    return row
  }

  for (const plan of plans.values()) {
    const actual = new Map<string, ModelIdentity>()
    const tokensByModel = new Map<string, TokenTotals>()
    const expectedShares =
      plan.listedSteps === null
        ? new Set(plan.stepShares.keys())
        : new Set(expectedStepShareKeys(plan.listedSteps))
    for (const [key, share] of plan.stepShares)
      if (expectedShares.has(key) && share.record !== null)
        actual.set(modelKey(share.record.identity), share.record.identity)
    for (const round of plan.rounds) {
      for (const phase of round.data.phases.filter(
        (candidate) => candidate.phase === "fix",
      )) {
        const identity = fixIdentity(phase)
        const key = modelKey(identity)
        actual.set(key, identity)
        const tokens = tokensByModel.get(key) ?? new Map()
        addTokens(tokens, phase.tokens)
        tokensByModel.set(key, tokens)
      }
    }
    if (actual.size === 0) continue
    const reason = excludedPlanReason(plan, new Set(actual.keys()), history)
    const stepCount = plan.listedSteps?.length ?? 0
    for (const [key, identity] of actual) {
      const row = ensureRow(identity)
      const tokens = tokensByModel.get(key) ?? new Map()
      if (stepCount > 0) {
        mergeTokens(row.tokens, tokens)
        row.tokenSteps += stepCount
      }
      if (reason.length > 0) {
        row.excluded.set(plan.stem, reason)
        continue
      }
      const completeRounds = plan.rounds.filter((round) =>
        modelRoundComplete(round.data),
      )
      const findings = completeRounds.flatMap((round) => round.data.findings)
      const stepRecords = listedStepRecords(plan)
      if (stepRecords === null) continue
      const fixMinutes = plan.rounds
        .flatMap((round) => round.data.phases)
        .filter((phase) => phase.phase === "fix")
        .reduce((total, phase) => total + phase.milliseconds / 60_000, 0)
      row.yieldSamples.push({
        stem: plan.stem,
        yield: acceptedYield(findings) / stepCount,
        dropped: droppedYield(findings) / stepCount,
      })
      if (stepRecords.every((record) => record.minutes !== null)) {
        const stepMinutes = stepRecords.reduce(
          (total, record) => total + (record.minutes ?? 0),
          0,
        )
        row.timeSamples.push({
          stem: plan.stem,
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
  const records = await readRoundRecords(context)
  const newestRound = records[records.length - 1]
  return {
    auditors: auditorRows(records),
    currentAuditors: newestRound ? [...roundAuditKeys(newestRound.data)] : [],
    coders: await coderRows(context, records),
  }
}
