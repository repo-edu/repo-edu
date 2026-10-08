import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { execa } from "execa"
import { readModelRecord } from "./commit-msg.js"
import type { ExecutionContext } from "./context.js"
import { type Finding, findingTitle, readFindings } from "./findings.js"
import { elapsedText, tokenText } from "./output-format.js"
import {
  type ModelTokenUsage,
  type RoundData,
  roundDataSchema,
} from "./round-data.js"
import { parseSubject } from "./subject.js"

const dataName = /-1-round\.([ao][btu][lmhx])\.json$/
const phaseOrder = ["audit", "vet", "rebut", "fix", "brief", "watch"] as const
const reachOrder = ["ordinary", "rare", "very-rare", "developer"] as const

type TrialRecord = { readonly subject: string; readonly body: string }

export type TrialDependencies = {
  readonly readRecord: (root: string, sha: string) => Promise<TrialRecord>
}

type TrialRound = {
  readonly file: string
  readonly tag: string
  readonly data: RoundData
  readonly findings: readonly Finding[]
}

async function gitRecord(root: string, sha: string): Promise<TrialRecord> {
  const { stdout } = await execa(
    "git",
    ["show", "-s", "--format=%s%x00%b", sha],
    { cwd: root },
  )
  const divider = stdout.indexOf("\0")
  if (divider === -1) throw new Error(`Git returned no body for ${sha}`)
  return {
    subject: stdout.slice(0, divider),
    body: stdout.slice(divider + 1),
  }
}

const defaultDependencies: TrialDependencies = { readRecord: gitRecord }

function settingText(selection: {
  readonly model: string
  readonly effort: string | null
}) {
  return `${selection.model} ${selection.effort ?? "effort unavailable"}`
}

function auditText(
  selection: RoundData["settings"]["audit"]["claude"],
): string {
  return Array.isArray(selection)
    ? selection.map(settingText).join(" / ")
    : settingText(selection)
}

function escapeCell(text: string): string {
  return text.replaceAll("|", "\\|").replaceAll("\n", " ")
}

function phaseTimes(phases: RoundData["phases"]): string {
  const total = phases.reduce((sum, phase) => sum + phase.milliseconds, 0)
  const byPhase = phaseOrder.flatMap((name) => {
    const phase = phases.find((candidate) => candidate.phase === name)
    return phase === undefined
      ? []
      : [`${name} ${elapsedText(phase.milliseconds)}`]
  })
  return [`total ${elapsedText(total)}`, ...byPhase].join("; ")
}

function addTokens(
  target: Map<string, Omit<ModelTokenUsage, "model">>,
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

function tokenTotals(
  phases: RoundData["phases"],
): Map<string, Omit<ModelTokenUsage, "model">> {
  const totals = new Map<string, Omit<ModelTokenUsage, "model">>()
  for (const phase of phases) addTokens(totals, phase.tokens)
  return totals
}

function tokenTotalsText(
  tokens: ReadonlyMap<string, Omit<ModelTokenUsage, "model">>,
): string {
  if (tokens.size === 0) return "none"
  return [...tokens]
    .map(
      ([model, usage]) =>
        `${model}: input ${tokenText(usage.input, 1)}, cached ${tokenText(usage.cached, 1)}, output ${tokenText(usage.output, 1)}`,
    )
    .join("; ")
}

function findingsText(findings: readonly Finding[]): string {
  if (findings.length === 0) return "none"
  return findings
    .map(
      (finding) =>
        `${finding.tier.toUpperCase()} ${finding.reach.replace("-", " ")} — ${findingTitle(finding)}`,
    )
    .join("; ")
}

function findingCounts(findings: readonly Finding[]): string {
  const counts = new Map<string, number>()
  for (const finding of findings) {
    const key = `${finding.tier}|${finding.reach}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  if (counts.size === 0) return "none"
  return (["a", "b", "c", "d"] as const)
    .flatMap((tier) =>
      reachOrder.flatMap((reach) => {
        const count = counts.get(`${tier}|${reach}`)
        return count === undefined
          ? []
          : [`${tier.toUpperCase()} ${reach.replace("-", " ")} ${count}`]
      }),
    )
    .join("; ")
}

function auditorKey(round: TrialRound): string {
  const { assistant, model, effort } = round.data.auditor
  return JSON.stringify({ assistant, model, effort })
}

async function roundFindings(
  context: ExecutionContext,
  data: RoundData,
  dependencies: TrialDependencies,
): Promise<Finding[]> {
  return (
    await Promise.all(
      data.commits.map(async ({ repository, sha }) => {
        const root =
          repository === "repo-edu" ? context.repoEduRoot : context.planRoot
        const record = await dependencies.readRecord(root, sha)
        const subject = parseSubject(record.subject, repository)
        readModelRecord(record.body)
        return readFindings(record.body, repository, subject.form?.role ?? null)
      }),
    )
  ).flat()
}

async function trialRounds(
  context: ExecutionContext,
  dependencies: TrialDependencies,
): Promise<TrialRound[]> {
  const files = (await readdir(context.planRoot)).filter((name) =>
    dataName.test(name),
  )
  const rounds = await Promise.all(
    files.map(async (file) => {
      const match = dataName.exec(file)
      if (match === null)
        throw new Error(`Invalid round data file name: ${file}`)
      let data: RoundData
      try {
        data = roundDataSchema.parse(
          JSON.parse(await readFile(join(context.planRoot, file), "utf8")),
        )
      } catch (error) {
        throw new Error(
          `Invalid round data in ${file}: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        )
      }
      return { file, tag: match[1], data }
    }),
  )
  const picked = rounds
    .filter(({ data }) => data.auditor.chosenBy === "settings")
    .sort(
      (first, second) =>
        first.data.started.localeCompare(second.data.started) ||
        first.file.localeCompare(second.file),
    )
  const newest = picked.at(-1)
  if (newest === undefined)
    throw new Error(`No settings-chosen round data at ${context.planRoot}.`)
  const settings = JSON.stringify(newest.data.settings)
  let start = picked.length - 1
  while (
    start > 0 &&
    JSON.stringify(picked[start - 1].data.settings) === settings
  )
    start -= 1
  return Promise.all(
    picked.slice(start).map(async (round) => ({
      ...round,
      findings:
        round.data.commits.length === 0
          ? []
          : await roundFindings(context, round.data, dependencies),
    })),
  )
}

/** Read and render the newest unchanged-settings trial without changing either checkout. */
export async function trialReport(
  context: ExecutionContext,
  dependencies: TrialDependencies = defaultDependencies,
): Promise<string> {
  const rounds = await trialRounds(context, dependencies)
  const settings = rounds.at(-1)?.data.settings
  if (settings === undefined) throw new Error("Trial has no rounds")
  const pairs = (["claude", "codex"] as const).flatMap((assistant) => {
    const selection = settings.audit[assistant]
    return Array.isArray(selection)
      ? [`${assistant}: ${selection.map(settingText).join(" versus ")}`]
      : []
  })
  const lines = [
    "# Auditor trial",
    "",
    `Newest unchanged-settings run: ${rounds.length} round${rounds.length === 1 ? "" : "s"}, ${rounds[0].data.started} to ${rounds.at(-1)?.data.started}. Command-line choices are excluded.`,
    "",
    "## Settings",
    "",
    "| Role | Selection |",
    "| --- | --- |",
    `| Claude audit | ${escapeCell(auditText(settings.audit.claude))} |`,
    `| Codex audit | ${escapeCell(auditText(settings.audit.codex))} |`,
    `| Compared pair | ${escapeCell(pairs.join("; ") || "none")} |`,
    `| Claude vet | ${escapeCell(settingText(settings.vet.claude))} |`,
    `| Codex vet | ${escapeCell(settingText(settings.vet.codex))} |`,
    `| Fix | ${escapeCell(`${settings.fix.assistant} ${settingText(settings.fix)}`)} |`,
    "",
    "## Rounds",
    "",
    "| Started | Target | Tag | Audit setting | Previous same-assistant round on target | Phase time | Accepted findings | Tokens per model |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ]
  const previous = new Map<string, TrialRound>()
  for (const round of rounds) {
    const complete = round.data.commits.length > 0
    const key = `${round.data.auditor.assistant}\0${round.data.target}`
    const earlier = complete ? previous.get(key) : undefined
    const comparison = !complete
      ? "not paired: incomplete"
      : earlier === undefined
        ? "none"
        : `${earlier.tag}: ${findingsText(earlier.findings)}`
    lines.push(
      `| ${escapeCell(round.data.started)} | ${escapeCell(`${round.data.target} #${round.data.round}`)} | ${round.tag} | ${escapeCell(`${round.data.auditor.assistant} ${settingText(round.data.auditor)}`)} | ${escapeCell(comparison)} | ${escapeCell(phaseTimes(round.data.phases))} | ${escapeCell(complete ? findingsText(round.findings) : "incomplete")} | ${escapeCell(tokenTotalsText(tokenTotals(round.data.phases)))} |`,
    )
    if (complete) previous.set(key, round)
  }

  lines.push(
    "",
    "## Totals by audit setting",
    "",
    "| Audit setting | Rounds | Time | Phase time | Accepted findings | Tokens per model |",
    "| --- | ---: | --- | --- | --- | --- |",
  )
  const groups = new Map<string, TrialRound[]>()
  for (const round of rounds) {
    const key = auditorKey(round)
    groups.set(key, [...(groups.get(key) ?? []), round])
  }
  for (const grouped of groups.values()) {
    const first = grouped[0]
    const phaseMilliseconds = new Map<string, number>()
    const tokens = new Map<string, Omit<ModelTokenUsage, "model">>()
    const findings: Finding[] = []
    for (const round of grouped) {
      for (const phase of round.data.phases)
        phaseMilliseconds.set(
          phase.phase,
          (phaseMilliseconds.get(phase.phase) ?? 0) + phase.milliseconds,
        )
      addTokens(
        tokens,
        round.data.phases.flatMap((phase) => phase.tokens),
      )
      findings.push(...round.findings)
    }
    const total = [...phaseMilliseconds.values()].reduce(
      (sum, value) => sum + value,
      0,
    )
    const perPhase = phaseOrder.flatMap((phase) => {
      const value = phaseMilliseconds.get(phase)
      return value === undefined ? [] : [`${phase} ${elapsedText(value)}`]
    })
    lines.push(
      `| ${escapeCell(`${first.data.auditor.assistant} ${settingText(first.data.auditor)}`)} | ${grouped.length} | ${elapsedText(total)} | ${escapeCell(perPhase.join("; ") || "none")} | ${escapeCell(findingCounts(findings))} | ${escapeCell(tokenTotalsText(tokens))} |`,
    )
  }
  return `${lines.join("\n")}\n`
}
