import { readFile } from "node:fs/promises"
import { relative } from "node:path"
import type { ExecutionContext } from "./context.js"
import { elapsedText, tokenText } from "./output-format.js"
import {
  type ModelTokenUsage,
  parseRoundDataFile,
  type RoundData,
  type RoundFinding,
  roundDataFiles,
} from "./round-data.js"

const phaseOrder = ["audit", "vet", "rebut", "fix", "brief", "watch"] as const
const reachOrder = ["ordinary", "rare", "very-rare", "developer"] as const

type TrialRound = {
  readonly file: string
  readonly tag: string
  readonly data: RoundData
  readonly findings: readonly RoundFinding[]
}

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

function finalTier(finding: RoundFinding): RoundFinding["tier"] {
  return finding.finalTier ?? finding.tier
}

function finalReach(finding: RoundFinding): RoundFinding["reach"] {
  return finding.finalReach ?? finding.reach
}

function findingsText(findings: readonly RoundFinding[]): string {
  if (findings.length === 0) return "none"
  return findings
    .map(
      (finding) =>
        `${finalTier(finding)} ${finalReach(finding).replace("-", " ")} — ${finding.title}`,
    )
    .join("; ")
}

function findingCounts(findings: readonly RoundFinding[]): string {
  const counts = new Map<string, number>()
  for (const finding of findings) {
    const key = `${finalTier(finding).toLowerCase()}|${finalReach(finding)}`
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

async function trialRounds(context: ExecutionContext): Promise<TrialRound[]> {
  const files = await roundDataFiles(context.planRoot)
  const rounds = (
    await Promise.all(
      files.map(async (file) => {
        const display = relative(context.planRoot, file)
        try {
          return parseRoundDataFile(file, await readFile(file, "utf8")).map(
            (data) => ({
              file: display,
              tag: data.tag,
              data,
              findings: data.findings.filter(
                (finding) =>
                  finding.outcome === "kept" || finding.outcome === "unmatched",
              ),
            }),
          )
        } catch (error) {
          throw new Error(
            `Invalid round data in ${display}: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error },
          )
        }
      }),
    )
  ).flat()
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
  return picked.slice(start)
}

/** Read and render the newest unchanged-settings trial without changing either checkout. */
export async function trialReport(context: ExecutionContext): Promise<string> {
  const rounds = await trialRounds(context)
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
    "| Started | Target | Tag | Audit setting | Previous other-setting round on target | Phase time | Accepted findings | Tokens per model |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ]
  const previous = new Map<string, TrialRound>()
  for (const round of rounds) {
    const complete = round.data.status === "finished"
    const key = `${round.data.auditor.assistant}\0${round.data.target}`
    const earlier = complete ? previous.get(key) : undefined
    const comparison = !complete
      ? "not paired: incomplete"
      : earlier === undefined
        ? "none"
        : auditorKey(earlier) === auditorKey(round)
          ? "not paired: same setting"
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
    const findings: RoundFinding[] = []
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
