import { readFile } from "node:fs/promises"
import { basename, relative } from "node:path"
import { execa } from "execa"
import { readModelRecord, readStepModelRecord } from "./commit-msg.js"
import type { ExecutionContext } from "./context.js"
import type { ReadingSample } from "./model-comparison.js"
import type { Assistant } from "./phase.js"
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
  readonly settingsPeers: Record<WorkClass, Set<string>>
  readonly vets: Set<string>
}

export type CoderSample = ReadingSample & {
  readonly stem: string
  readonly dropped: number
  readonly tokens: TokenTotals
}

export type CoderRow = {
  readonly identity: ModelIdentity
  readonly samples: CoderSample[]
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

type HistoryCommit = {
  readonly repository: "repo-edu" | "plan"
  readonly sha: string
  readonly committedAt: number
  readonly order: number
  readonly subject: string
  readonly body: string
}

type StepRecord = {
  readonly identity: ModelIdentity
  readonly minutes: number | null
  readonly commit: HistoryCommit
}

type PlanEvidence = {
  readonly stem: string
  assignment: Coder | null
  closed: boolean
  readonly steps: Set<string>
  readonly stepRecords: StepRecord[]
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

function auditorSettingsPeers(
  records: readonly RoundRecord[],
): Map<string, Record<WorkClass, Set<string>>> {
  const peers = new Map<string, Record<WorkClass, Set<string>>>()
  for (const record of records) {
    const active = [...roundAuditKeys(record.data)]
    for (const key of active) {
      const row = peers.get(key) ?? {
        planning: new Set<string>(),
        implementation: new Set<string>(),
      }
      for (const peer of active)
        if (peer !== key) row[record.workClass].add(peer)
      peers.set(key, row)
    }
  }
  return peers
}

function auditorRows(records: readonly RoundRecord[]): Map<string, AuditorRow> {
  const rows = new Map<string, AuditorRow>()
  const settingsPeers = auditorSettingsPeers(records)
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
      settingsPeers: settingsPeers.get(key) ?? {
        planning: new Set(),
        implementation: new Set(),
      },
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

async function readHistory(
  repository: "repo-edu" | "plan",
  root: string,
): Promise<HistoryCommit[]> {
  const { stdout } = await execa(
    "git",
    ["log", "-z", "--format=%H%x00%ct%x00%s%x00%b"],
    { cwd: root },
  )
  const fields = stdout.split("\0")
  const commits: HistoryCommit[] = []
  for (let at = 0; at + 3 < fields.length; at += 4) {
    const [sha, committedAt, subject, body] = fields.slice(at, at + 4)
    if (sha.length > 0)
      commits.push({
        repository,
        sha,
        committedAt: Number(committedAt),
        order: at / 4,
        subject,
        body,
      })
  }
  return commits
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
    steps: new Set<string>(),
    stepRecords: [],
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

function hasWholePlanAudit(
  plan: PlanEvidence,
  history: ReadonlyMap<string, HistoryCommit>,
): boolean {
  const finalStep = Math.max(...[...plan.steps].map(Number))
  const scope = finalStep === 1 ? "1" : `1-${finalStep}`
  const newerThanStep = (audit: HistoryCommit, step: StepRecord) =>
    audit.repository === step.commit.repository
      ? audit.order < step.commit.order
      : audit.committedAt > step.commit.committedAt
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
          plan.stepRecords.every((step) => newerThanStep(record, step)) &&
          form?.stem === plan.stem &&
          form.role === `impl-audit-${scope}`
        )
      }),
  )
}

function excludedPlanReason(
  plan: PlanEvidence,
  actual: ReadonlySet<string>,
  history: ReadonlyMap<string, HistoryCommit>,
): string {
  if (!plan.closed) return "not closed"
  if (plan.assignment === null) return "no ready assignment"
  if (plan.steps.size === 0) return "no step records"
  if (plan.stepRecords.some((record) => record.minutes === null))
    return "step time unavailable"
  if (!hasWholePlanAudit(plan, history))
    return "no complete whole-plan audit after the final step"
  const assigned = modelKey(plan.assignment)
  if (actual.size !== 1 || !actual.has(assigned)) return "mixed model records"
  return ""
}

async function coderRows(
  context: ExecutionContext,
  records: readonly RoundRecord[],
): Promise<Map<string, CoderRow>> {
  const [repoEduHistory, planHistory] = await Promise.all([
    readHistory("repo-edu", context.repoEduRoot),
    readHistory("plan", context.planRoot),
  ])
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
    const record = stepRecord(commit)
    if (record === null) continue
    plan.steps.add(scope)
    plan.stepRecords.push(record)
  }

  const rows = new Map<string, CoderRow>()
  const ensureRow = (identity: ModelIdentity) => {
    const key = modelKey(identity)
    const row = rows.get(key) ?? {
      identity,
      samples: [],
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
    for (const record of plan.stepRecords)
      actual.set(modelKey(record.identity), record.identity)
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
    for (const [key, identity] of actual) {
      const row = ensureRow(identity)
      const tokens = tokensByModel.get(key) ?? new Map()
      mergeTokens(row.tokens, tokens)
      row.tokenSteps += plan.steps.size
      if (reason.length > 0) {
        row.excluded.set(plan.stem, reason)
        continue
      }
      const completeRounds = plan.rounds.filter((round) =>
        modelRoundComplete(round.data),
      )
      const findings = completeRounds.flatMap((round) => round.data.findings)
      const stepMinutes = plan.stepRecords.reduce(
        (total, record) => total + (record.minutes ?? 0),
        0,
      )
      const fixMinutes = plan.rounds
        .flatMap((round) => round.data.phases)
        .filter((phase) => phase.phase === "fix")
        .reduce((total, phase) => total + phase.milliseconds / 60_000, 0)
      row.samples.push({
        stem: plan.stem,
        yield: acceptedYield(findings) / plan.steps.size,
        dropped: droppedYield(findings) / plan.steps.size,
        minutes: (stepMinutes + fixMinutes) / plan.steps.size,
        tokens,
      })
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
