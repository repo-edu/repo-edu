import { readFile } from "node:fs/promises"
import { relative } from "node:path"
import type { ExecutionContext } from "./context.js"
import { reachValues } from "./finding-tokens.js"
import { elapsedText, tokenText } from "./output-format.js"
import {
  type ModelTokenUsage,
  parseRoundDataFile,
  type RoundData,
  type RoundFinding,
  roundDataFiles,
} from "./round-data.js"

const phaseOrder = [
  "audit",
  "vet",
  "rebut",
  "fix",
  "brief",
  "watch",
  "judge",
] as const

type TrialRound = {
  readonly file: string
  readonly tag: string
  readonly data: RoundData
}

/**
 * Whether a round supplies first-look evidence: it ended, landed a commit and
 * every finding reached an outcome. The `alternate` opener stamp moves on the
 * same test, so the trial's first rounds stay balanced between assistants.
 */
export function trialRoundComplete(round: {
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

/**
 * An incomplete round's findings never reached a record through the runner,
 * so it supplies neither accepted nor dropped findings.
 */
function completeFindings(round: TrialRound): readonly RoundFinding[] {
  return trialRoundComplete(round.data) ? round.data.findings : []
}

function acceptedFindings(round: TrialRound): readonly RoundFinding[] {
  return completeFindings(round).filter(
    (finding) => finding.outcome === "kept" || finding.outcome === "unmatched",
  )
}

/**
 * Audit findings that never reached the record. A dropped finding records no
 * final tier or reach, so it counts under the tier and reach the audit gave it.
 */
function droppedFindings(round: TrialRound): readonly RoundFinding[] {
  return completeFindings(round).filter(
    (finding) => finding.outcome === "dropped",
  )
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

function findingRates(
  findings: readonly RoundFinding[],
  completeRounds: number,
): string {
  if (completeRounds === 0) return "no complete rounds"
  const counts = new Map<string, number>()
  for (const finding of findings) {
    const key = `${finalTier(finding).toLowerCase()}|${finalReach(finding)}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  if (counts.size === 0) return "none"
  return (["a", "b", "c", "d"] as const)
    .flatMap((tier) =>
      reachValues.flatMap((reach) => {
        const count = counts.get(`${tier}|${reach}`)
        return count === undefined
          ? []
          : [
              `${tier.toUpperCase()} ${reach.replace("-", " ")} ${(count / completeRounds).toFixed(1)}`,
            ]
      }),
    )
    .join("; ")
}

function auditorKey(round: TrialRound): string {
  const { assistant, model, effort } = round.data.auditor
  return JSON.stringify({ assistant, model, effort })
}

/** A manual selection supplies no comparable position evidence. */
function trialAdmits(round: TrialRound): boolean {
  const source = round.data.auditor.chosenBy
  return source !== "--auditor" && source !== "command-line"
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
    .filter(trialAdmits)
    .sort(
      (first, second) =>
        first.data.started.localeCompare(second.data.started) ||
        first.file.localeCompare(second.file),
    )
  const newest = picked.at(-1)
  if (newest === undefined)
    throw new Error(`No trial round data at ${context.planRoot}.`)
  const settings = JSON.stringify(newest.data.settings)
  let start = picked.length - 1
  while (
    start > 0 &&
    JSON.stringify(picked[start - 1].data.settings) === settings
  )
    start -= 1
  return picked.slice(start)
}

/** The rows each audit setting's means split into, by the round's place on its target. */
const positions: readonly [string, (round: TrialRound) => boolean][] = [
  ["all", () => true],
  ["first", (round) => round.data.round === 1],
  ["later", (round) => round.data.round > 1],
]

/** Round count, complete count and the per-round means of one group of rounds, as table cells. */
function meanCells(grouped: readonly TrialRound[]): string[] {
  const completeRounds = grouped.filter((round) =>
    trialRoundComplete(round.data),
  ).length
  const phaseMilliseconds = new Map<string, number>()
  const tokens = new Map<string, Omit<ModelTokenUsage, "model">>()
  const accepted: RoundFinding[] = []
  const dropped: RoundFinding[] = []
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
    accepted.push(...acceptedFindings(round))
    dropped.push(...droppedFindings(round))
  }
  const total = [...phaseMilliseconds.values()].reduce(
    (sum, value) => sum + value,
    0,
  )
  const perPhase = phaseOrder.flatMap((phase) => {
    const value = phaseMilliseconds.get(phase)
    return value === undefined
      ? []
      : [`${phase} ${elapsedText(value / grouped.length)}`]
  })
  const tokensPerRound = new Map(
    [...tokens].map(([model, usage]) => [
      model,
      {
        input: usage.input / grouped.length,
        cached: usage.cached / grouped.length,
        output: usage.output / grouped.length,
      },
    ]),
  )
  return [
    String(grouped.length),
    String(completeRounds),
    elapsedText(total / grouped.length),
    escapeCell(perPhase.join("; ") || "none"),
    escapeCell(findingRates(accepted, completeRounds)),
    escapeCell(findingRates(dropped, completeRounds)),
    escapeCell(tokenTotalsText(tokensPerRound)),
  ]
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
    `Newest unchanged-settings run: ${rounds.length} round${rounds.length === 1 ? "" : "s"}, ${rounds[0].data.started} to ${rounds.at(-1)?.data.started}. Manual --auditor rounds are excluded.`,
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
    const complete = trialRoundComplete(round.data)
    const key = `${round.data.auditor.assistant}\0${round.data.target}`
    const earlier = complete ? previous.get(key) : undefined
    const comparison = !complete
      ? "not paired: incomplete"
      : earlier === undefined
        ? "none"
        : auditorKey(earlier) === auditorKey(round)
          ? "not paired: same setting"
          : `${earlier.tag}: ${findingsText(acceptedFindings(earlier))}`
    lines.push(
      `| ${escapeCell(round.data.started)} | ${escapeCell(`${round.data.target} #${round.data.round}`)} | ${round.tag} | ${escapeCell(`${round.data.auditor.assistant} ${settingText(round.data.auditor)}`)} | ${escapeCell(comparison)} | ${escapeCell(phaseTimes(round.data.phases))} | ${escapeCell(complete ? findingsText(acceptedFindings(round)) : "incomplete")} | ${escapeCell(tokenTotalsText(tokenTotals(round.data.phases)))} |`,
    )
    if (complete) previous.set(key, round)
  }

  lines.push(
    "",
    "## Means per round by audit setting and position",
    "",
    "Time and tokens divide by every round. Accepted and dropped findings divide by complete rounds only, because an incomplete round supplies neither. A dropped finding is an audit finding that never reached the record, counted by the tier and reach the audit gave it. A first round is the first look at its target; a later round follows other rounds on the same target, which have already removed what they found.",
    "",
    "| Audit setting | Position | Rounds | Complete | Time per round | Phase time per round | Accepted findings per complete round | Dropped findings per complete round | Tokens per model per round |",
    "| --- | --- | ---: | ---: | --- | --- | --- | --- | --- |",
  )
  const groups = new Map<string, TrialRound[]>()
  for (const round of rounds) {
    const key = auditorKey(round)
    groups.set(key, [...(groups.get(key) ?? []), round])
  }
  for (const grouped of groups.values()) {
    const setting = `${grouped[0].data.auditor.assistant} ${settingText(grouped[0].data.auditor)}`
    for (const [position, member] of positions) {
      const selected = grouped.filter(member)
      if (selected.length === 0) continue
      lines.push(
        `| ${escapeCell(setting)} | ${position} | ${meanCells(selected).join(" | ")} |`,
      )
    }
  }
  return `${lines.join("\n")}\n`
}
