import { mean, standardDeviation } from "simple-statistics"
import type { ExecutionContext } from "./context.js"
import {
  auditorFloor,
  clearlyPreferred,
  coderFloor,
  coderReliabilityDisadvantages,
  type ReadingSample,
  speedWords,
  yieldWords,
} from "./model-comparison.js"
import {
  type AuditorRow,
  type AuditorSample,
  type CoderRow,
  type CoderSample,
  type ModelIdentity,
  mergeTokens,
  modelKey,
  modelText,
  readModelEvidence,
  type TokenTotals,
  type WorkClass,
} from "./model-evidence.js"
import { tokenText } from "./output-format.js"
import type { Coder } from "./settings.js"

type CoderReading = {
  readonly recommendation: string | null
  readonly reliabilityBlocks: readonly string[]
}

function escapeCell(text: string): string {
  return text.replaceAll("|", "\\|").replaceAll("\n", " ")
}

function numberText(value: number): string {
  return value.toFixed(1)
}

function plural(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`
}

function tokenTotalsText(tokens: TokenTotals, divisor: number): string {
  if (tokens.size === 0 || divisor === 0) return "none"
  return [...tokens]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(
      ([model, usage]) =>
        `${model}: input ${tokenText(usage.input / divisor, 1)}, cached ${tokenText(usage.cached / divisor, 1)}, output ${tokenText(usage.output / divisor, 1)}`,
    )
    .join("; ")
}

function sharedAuditorSamples(
  rows: ReadonlyMap<string, AuditorRow>,
  first: string,
  second: string,
  workClass: WorkClass,
): readonly [AuditorSample[], AuditorSample[]] {
  const select = (key: string) =>
    (rows.get(key)?.samples ?? []).filter(
      (sample) =>
        sample.workClass === workClass &&
        sample.position === "first" &&
        sample.active.has(first) &&
        sample.active.has(second),
    )
  return [select(first), select(second)]
}

function comparisonClause(
  role: "auditor" | "coder",
  first: ModelIdentity,
  second: ModelIdentity,
  firstSamples: readonly ReadingSample[],
  secondSamples: readonly ReadingSample[],
  floor: number,
  context: string,
): string {
  if (firstSamples.length < floor || secondSamples.length < floor) {
    const firstMissing = Math.max(0, floor - firstSamples.length)
    const secondMissing = Math.max(0, floor - secondSamples.length)
    return `${context}, ${modelText(first)} needs ${plural(firstMissing, "more example")} and ${modelText(second)} needs ${plural(secondMissing, "more example")} before their records can be compared`
  }
  const firstYield = mean(firstSamples.map((sample) => sample.yield))
  const secondYield = mean(secondSamples.map((sample) => sample.yield))
  const firstMinutes = mean(firstSamples.map((sample) => sample.minutes))
  const secondMinutes = mean(secondSamples.map((sample) => sample.minutes))
  const speedReading = speedWords(firstMinutes, secondMinutes)
  const speedClause =
    speedReading === "the same speed"
      ? `has the same speed (${numberText(firstMinutes)} vs ${numberText(secondMinutes)} min) as`
      : `is ${speedReading} (${numberText(firstMinutes)} vs ${numberText(secondMinutes)} min) than`
  return `${context}, ${modelText(first)} has ${yieldWords(firstYield, secondYield)} (${numberText(firstYield)} vs ${numberText(secondYield)} accepted A/B findings per ${role === "auditor" ? "round" : "step"}) and ${speedClause} ${modelText(second)}, from ${firstSamples.length} and ${secondSamples.length} examples`
}

function auditorRecommendation(
  rows: ReadonlyMap<string, AuditorRow>,
  current: readonly string[],
): string | null {
  const ranked = [...new Set(current)].filter((key) => rows.has(key))
  if (ranked.length < 2) return null
  const winners = ranked.filter((candidate) =>
    ranked.every((other) => {
      if (candidate === other) return true
      return (["planning", "implementation"] as const).every((workClass) => {
        const [candidateSamples, otherSamples] = sharedAuditorSamples(
          rows,
          candidate,
          other,
          workClass,
        )
        return (
          candidateSamples.length >= auditorFloor &&
          otherSamples.length >= auditorFloor &&
          clearlyPreferred(candidateSamples, otherSamples, true)
        )
      })
    }),
  )
  return winners.length === 1 ? winners[0] : null
}

function auditorSentence(
  rows: ReadonlyMap<string, AuditorRow>,
  current: readonly string[],
): string {
  const entries = [...rows.entries()].sort(([, first], [, second]) =>
    modelText(first.identity).localeCompare(modelText(second.identity)),
  )
  const clauses: string[] = []
  for (let first = 0; first < entries.length; first += 1) {
    for (let second = first + 1; second < entries.length; second += 1) {
      const [firstKey, firstRow] = entries[first]
      const [secondKey, secondRow] = entries[second]
      for (const workClass of ["planning", "implementation"] as const) {
        const [firstSamples, secondSamples] = sharedAuditorSamples(
          rows,
          firstKey,
          secondKey,
          workClass,
        )
        clauses.push(
          comparisonClause(
            "auditor",
            firstRow.identity,
            secondRow.identity,
            firstSamples,
            secondSamples,
            auditorFloor,
            `For ${workClass} audits`,
          ),
        )
      }
    }
  }
  if (entries.length === 1) {
    const samples = entries[0][1].samples.filter(
      (sample) => sample.position === "first",
    )
    clauses.push(
      `${modelText(entries[0][1].identity)} has ${plural(samples.length, "settings-opened audit")} in the records`,
    )
  }
  if (entries.length === 0) clauses.push("No auditor records are available")
  const recommendation = auditorRecommendation(rows, current)
  clauses.push(
    recommendation === null
      ? "the current records do not separate one auditor clearly across both audit groups"
      : `the current records clearly support running ${modelText(rows.get(recommendation)?.identity ?? entries[0][1].identity)}`,
  )
  return `${clauses.join("; ")}.`
}

function sampleSummary(samples: readonly AuditorSample[]): string {
  if (samples.length === 0) return "none"
  return `${samples.length}, yield ${numberText(mean(samples.map((sample) => sample.yield)))}, dropped ${numberText(mean(samples.map((sample) => sample.dropped)))}, ${numberText(mean(samples.map((sample) => sample.minutes)))} min`
}

function auditorWorkCell(row: AuditorRow, workClass: WorkClass): string {
  const samples = row.samples.filter((sample) => sample.workClass === workClass)
  const first = samples.filter((sample) => sample.position === "first")
  const later = samples.filter((sample) => sample.position === "later")
  const manual = samples.filter((sample) => sample.position === "manual").length
  return `first ${sampleSummary(first)}; later ${sampleSummary(later)}; manual ${manual}`
}

function auditorTable(
  rows: ReadonlyMap<string, AuditorRow>,
  current: readonly string[],
): string[] {
  const lines = [
    "| Model | Current | Planning audits | Implementation audits | Tokens per settings-opened audit | Vet settings |",
    "| --- | --- | --- | --- | --- | --- |",
  ]
  const currentSet = new Set(current)
  for (const [key, row] of [...rows].sort(([, first], [, second]) =>
    modelText(first.identity).localeCompare(modelText(second.identity)),
  )) {
    const openings = row.samples.filter((sample) => sample.position === "first")
    const tokens: TokenTotals = new Map()
    for (const sample of openings) mergeTokens(tokens, sample.tokens)
    const vets = [...row.vets].sort()
    lines.push(
      `| ${escapeCell(modelText(row.identity))} | ${currentSet.has(key) ? "yes" : "no"} | ${escapeCell(auditorWorkCell(row, "planning"))} | ${escapeCell(auditorWorkCell(row, "implementation"))} | ${escapeCell(tokenTotalsText(tokens, openings.length))} | ${escapeCell(vets.length > 1 ? `${vets.length}: ${vets.join("; ")}` : (vets[0] ?? "none"))} |`,
    )
  }
  return lines
}

function coderReliability(row: CoderRow): {
  readonly spread: number
  readonly worst: CoderSample
} {
  const worst = [...row.samples].sort(
    (first, second) => second.yield - first.yield,
  )[0]
  return {
    spread: standardDeviation(row.samples.map((sample) => sample.yield)),
    worst,
  }
}

function coderReading(
  rows: ReadonlyMap<string, CoderRow>,
  current: readonly string[],
): CoderReading {
  const ranked = [...new Set(current)].filter(
    (key) => (rows.get(key)?.samples.length ?? 0) >= coderFloor,
  )
  if (ranked.length < 2) return { recommendation: null, reliabilityBlocks: [] }
  const potential = ranked.filter((candidate) =>
    ranked.every(
      (other) =>
        candidate === other ||
        clearlyPreferred(
          rows.get(candidate)?.samples ?? [],
          rows.get(other)?.samples ?? [],
          false,
        ),
    ),
  )
  if (potential.length !== 1)
    return { recommendation: null, reliabilityBlocks: [] }
  const candidate = potential[0]
  const candidateRow = rows.get(candidate)
  if (candidateRow === undefined)
    return { recommendation: null, reliabilityBlocks: [] }
  const candidateReliability = coderReliability(candidateRow)
  const blocks: string[] = []
  for (const other of ranked) {
    if (other === candidate) continue
    const otherRow = rows.get(other)
    if (otherRow === undefined) continue
    const otherReliability = coderReliability(otherRow)
    const disadvantages = coderReliabilityDisadvantages(
      candidateRow.samples,
      otherRow.samples,
    )
    if (disadvantages.spread)
      blocks.push(
        `${modelText(candidateRow.identity)} has higher spread than ${modelText(otherRow.identity)} (${numberText(candidateReliability.spread)} vs ${numberText(otherReliability.spread)})`,
      )
    if (disadvantages.worst)
      blocks.push(
        `${modelText(candidateRow.identity)} has the worse worst plan, ${candidateReliability.worst.stem} at ${numberText(candidateReliability.worst.yield)} findings per step`,
      )
  }
  return {
    recommendation: blocks.length === 0 ? candidate : null,
    reliabilityBlocks: blocks,
  }
}

function coderSentence(
  rows: ReadonlyMap<string, CoderRow>,
  current: readonly string[],
): string {
  const entries = [...rows.entries()].sort(([, first], [, second]) =>
    modelText(first.identity).localeCompare(modelText(second.identity)),
  )
  const clauses: string[] = []
  for (let first = 0; first < entries.length; first += 1) {
    for (let second = first + 1; second < entries.length; second += 1) {
      const firstRow = entries[first][1]
      const secondRow = entries[second][1]
      clauses.push(
        comparisonClause(
          "coder",
          firstRow.identity,
          secondRow.identity,
          firstRow.samples,
          secondRow.samples,
          coderFloor,
          "For implemented plans",
        ),
      )
    }
  }
  if (entries.length === 1)
    clauses.push(
      `${modelText(entries[0][1].identity)} has ${plural(entries[0][1].samples.length, "ranked plan")} in the records`,
    )
  if (entries.length === 0) clauses.push("No coder records are available")
  const reading = coderReading(rows, current)
  clauses.push(...reading.reliabilityBlocks)
  clauses.push(
    reading.recommendation === null
      ? reading.reliabilityBlocks.length > 0
        ? "reliability blocks the otherwise clear coder lead"
        : "the current records do not separate one coder clearly"
      : `the current records clearly support running ${modelText(rows.get(reading.recommendation)?.identity ?? entries[0][1].identity)}`,
  )
  return `${clauses.join("; ")}.`
}

function coderTable(
  rows: ReadonlyMap<string, CoderRow>,
  current: readonly string[],
): string[] {
  const currentSet = new Set(current)
  const lines = [
    "| Model | Current | Ranked plans | Yield per step | Time per step | Spread | Worst plan | Dropped A/B per step | Fix tokens per step | Excluded plans |",
    "| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | --- | --- |",
  ]
  for (const [key, row] of [...rows].sort(([, first], [, second]) =>
    modelText(first.identity).localeCompare(modelText(second.identity)),
  )) {
    const reliability = row.samples.length === 0 ? null : coderReliability(row)
    lines.push(
      `| ${escapeCell(modelText(row.identity))} | ${currentSet.has(key) ? "yes" : "no"} | ${row.samples.length} | ${row.samples.length === 0 ? "—" : numberText(mean(row.samples.map((sample) => sample.yield)))} | ${row.samples.length === 0 ? "—" : numberText(mean(row.samples.map((sample) => sample.minutes)))} | ${reliability === null ? "—" : numberText(reliability.spread)} | ${reliability === null ? "—" : escapeCell(`${reliability.worst.stem} (${numberText(reliability.worst.yield)})`)} | ${row.samples.length === 0 ? "—" : numberText(mean(row.samples.map((sample) => sample.dropped)))} | ${escapeCell(tokenTotalsText(row.tokens, row.tokenSteps))} | ${escapeCell(row.excluded.size === 0 ? "none" : [...row.excluded].map(([stem, reason]) => `${stem}: ${reason}`).join("; "))} |`,
    )
  }
  return lines
}

/** Read every retained model record and render the auditor and coder results. */
export async function modelsReport(
  context: ExecutionContext,
  coders: readonly Coder[],
): Promise<string> {
  const evidence = await readModelEvidence(context)
  const currentCoders = coders.map((coder) => modelKey(coder))
  const lines = [
    "# Model read-out",
    "",
    "## Auditors",
    "",
    auditorSentence(evidence.auditors, evidence.currentAuditors),
    "",
    ...auditorTable(evidence.auditors, evidence.currentAuditors),
    "",
    "First means a settings-chosen opening round. Later means a judge-chosen round. Manual command-line openings stay visible but do not enter the reading. Yield is accepted A and B findings per complete round. Auditor time and tokens include audit and rebuttal only.",
    "",
    "## Coders",
    "",
    coderSentence(evidence.coders, currentCoders),
    "",
    ...coderTable(evidence.coders, currentCoders),
    "",
    "One ranked coder example is one closed plan with a ready assignment, timed step records and a complete whole-plan implementation audit after the final step. Yield is accepted A and B findings per step. Time adds active step time and implementation-round fix time. Planning-round fixes do not enter coder evidence.",
  ]
  return `${lines.join("\n")}\n`
}
