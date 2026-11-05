import { mean } from "simple-statistics"
import type { ExecutionContext } from "./context.js"
import {
  auditorFloor,
  clearlyPreferred,
  clearlyPreferredMeasures,
  coderFloor,
  comparisonPreposition,
  type ReadingSample,
  speedWords,
  yieldWords,
} from "./model-comparison.js"
import {
  type AuditorRow,
  type AuditorSample,
  type CoderRow,
  type DisprovedEvidence,
  type FindingCounts,
  type ModelIdentity,
  modelKey,
  modelText,
  readModelEvidence,
  type WorkClass,
} from "./model-evidence.js"
import type { RoundSettings } from "./settings.js"

function escapeCell(text: string): string {
  return text.replaceAll("|", "\\|").replaceAll("\n", " ")
}

function numberText(value: number): string {
  return value.toFixed(1)
}

function plural(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`
}

function shortageClause(
  identity: ModelIdentity,
  sampleCount: number,
  floor: number,
  context: string,
): string | null {
  const missing = floor - sampleCount
  if (missing <= 0) return null
  return `${context}, ${modelText(identity)} needs ${plural(missing, "more example")} before it is compared`
}

function joinedSentence(clauses: readonly string[]): string {
  const joined = clauses.join("; ")
  return `${joined.charAt(0).toUpperCase()}${joined.slice(1)}.`
}

function sortedRows<Row extends { readonly identity: ModelIdentity }>(
  rows: ReadonlyMap<string, Row>,
): Array<readonly [string, Row]> {
  return [...rows].sort(([, first], [, second]) =>
    modelText(first.identity).localeCompare(modelText(second.identity)),
  )
}

function comparisonClause(
  role: "auditor" | "coder",
  first: ModelIdentity,
  second: ModelIdentity,
  firstSamples: readonly ReadingSample[],
  secondSamples: readonly ReadingSample[],
  context: string,
): string {
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

function auditorSamples(
  row: AuditorRow,
  workClass: WorkClass,
): AuditorSample[] {
  return row.samples.filter((sample) => sample.workClass === workClass)
}

function auditorRecommendation(
  rows: ReadonlyMap<string, AuditorRow>,
  workClass: WorkClass,
): string | null {
  const ranked = sortedRows(rows).filter(
    ([, row]) => auditorSamples(row, workClass).length >= auditorFloor,
  )
  if (ranked.length < 2) return null
  const winners = ranked.filter(([candidateKey, candidate]) =>
    ranked.every(
      ([otherKey, other]) =>
        candidateKey === otherKey ||
        clearlyPreferred(
          auditorSamples(candidate, workClass),
          auditorSamples(other, workClass),
          true,
        ),
    ),
  )
  return winners.length === 1 ? winners[0][0] : null
}

function configuredAuditSelections(settings: RoundSettings): Array<{
  readonly model: string
  readonly effort: string
}> {
  return (["claude", "codex"] as const).map((assistant) => {
    const configured = settings.phases.audit[assistant]
    const defaults = settings.defaults[assistant]
    return {
      model: configured.model === "default" ? defaults.model : configured.model,
      effort:
        configured.effort === "default" ? defaults.effort : configured.effort,
    }
  })
}

function currentAuditSetting(
  identity: ModelIdentity,
  settings: RoundSettings,
): boolean {
  return configuredAuditSelections(settings).some(
    (selection) =>
      identity.effort === selection.effort &&
      (identity.model === selection.model ||
        identity.model.includes(selection.model)),
  )
}

function auditorSentence(
  rows: ReadonlyMap<string, AuditorRow>,
  workClass: WorkClass,
  settings: RoundSettings,
): string {
  const entries = sortedRows(rows)
  if (entries.length === 0)
    return `No ${workClass} auditor records are available.`
  const clauses: string[] = []
  for (const [, row] of entries) {
    const shortage = shortageClause(
      row.identity,
      auditorSamples(row, workClass).length,
      auditorFloor,
      `for ${workClass} audits`,
    )
    if (shortage !== null) clauses.push(shortage)
  }
  const ranked = entries.filter(
    ([, row]) => auditorSamples(row, workClass).length >= auditorFloor,
  )
  for (let first = 0; first < ranked.length; first += 1)
    for (let second = first + 1; second < ranked.length; second += 1) {
      const firstRow = ranked[first][1]
      const secondRow = ranked[second][1]
      clauses.push(
        comparisonClause(
          "auditor",
          firstRow.identity,
          secondRow.identity,
          auditorSamples(firstRow, workClass),
          auditorSamples(secondRow, workClass),
          `for ${workClass} audits`,
        ),
      )
    }
  const recommendation = auditorRecommendation(rows, workClass)
  if (recommendation === null)
    clauses.push(`the records do not separate one ${workClass} auditor clearly`)
  else {
    const identity =
      rows.get(recommendation)?.identity ?? entries[0][1].identity
    clauses.push(
      `the records clearly support running ${modelText(identity)} for ${workClass} audits`,
    )
    if (!currentAuditSetting(identity, settings))
      clauses.push(`${modelText(identity)} is not a current audit setting`)
  }
  return joinedSentence(clauses)
}

function addCounts(first: FindingCounts, second: FindingCounts): FindingCounts {
  return {
    kept: first.kept + second.kept,
    dropped: first.dropped + second.dropped,
    downgraded: first.downgraded + second.downgraded,
    disproved: first.disproved + second.disproved,
  }
}

function auditorCounts(row: AuditorRow, workClass: WorkClass): FindingCounts {
  const counts = auditorSamples(row, workClass).reduce(
    (total, sample) => addCounts(total, sample.counts),
    { kept: 0, dropped: 0, downgraded: 0, disproved: 0 },
  )
  return {
    ...counts,
    disproved: counts.disproved + row.detachedDisproved[workClass],
  }
}

function wrongClaims(counts: FindingCounts): string {
  const total =
    counts.kept + counts.dropped + counts.downgraded + counts.disproved
  if (total === 0) return "0%"
  return `${Math.round(((counts.dropped + counts.downgraded + counts.disproved) / total) * 100)}%`
}

function auditorTable(
  rows: ReadonlyMap<string, AuditorRow>,
  workClass: WorkClass,
): string[] {
  const lines = [
    "| Model | Rounds | A/B kept | Dropped | Downgraded | Disproved | Wrong claims | Minutes per round |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ]
  for (const [, row] of sortedRows(rows)) {
    const samples = auditorSamples(row, workClass)
    const counts = auditorCounts(row, workClass)
    lines.push(
      `| ${escapeCell(modelText(row.identity))} | ${samples.length} | ${counts.kept} | ${counts.dropped} | ${counts.downgraded} | ${counts.disproved} | ${wrongClaims(counts)} | ${samples.length === 0 ? "—" : numberText(mean(samples.map((sample) => sample.minutes)))} |`,
    )
  }
  return lines
}

function coderRecommendation(
  rows: ReadonlyMap<string, CoderRow>,
): string | null {
  const ranked = sortedRows(rows).filter(
    ([, row]) =>
      row.yieldSamples.length >= coderFloor &&
      row.timeSamples.length >= coderFloor,
  )
  if (ranked.length < 2) return null
  const winners = ranked.filter(([candidateKey, candidate]) =>
    ranked.every(
      ([otherKey, other]) =>
        candidateKey === otherKey ||
        clearlyPreferredMeasures(
          candidate.yieldSamples,
          other.yieldSamples,
          candidate.timeSamples,
          other.timeSamples,
          false,
        ),
    ),
  )
  return winners.length === 1 ? winners[0][0] : null
}

function coderSentence(
  rows: ReadonlyMap<string, CoderRow>,
  settings: RoundSettings,
): string {
  const entries = sortedRows(rows)
  if (entries.length === 0) return "No coder records are available."
  const yieldRanked = entries.filter(
    ([, row]) => row.yieldSamples.length >= coderFloor,
  )
  const timeRanked = entries.filter(
    ([, row]) => row.timeSamples.length >= coderFloor,
  )
  const clauses: string[] = []
  for (const [, row] of entries) {
    const yieldShortage = shortageClause(
      row.identity,
      row.yieldSamples.length,
      coderFloor,
      "for coder yield",
    )
    if (yieldShortage !== null) clauses.push(yieldShortage)
    const timeShortage = shortageClause(
      row.identity,
      row.timeSamples.length,
      coderFloor,
      "for coder time",
    )
    if (timeShortage !== null) clauses.push(timeShortage)
  }
  for (let first = 0; first < yieldRanked.length; first += 1)
    for (let second = first + 1; second < yieldRanked.length; second += 1) {
      const firstRow = yieldRanked[first][1]
      const secondRow = yieldRanked[second][1]
      const firstYield = mean(
        firstRow.yieldSamples.map((sample) => sample.yield),
      )
      const secondYield = mean(
        secondRow.yieldSamples.map((sample) => sample.yield),
      )
      const reading = yieldWords(firstYield, secondYield)
      clauses.push(
        `for coder yield, ${modelText(firstRow.identity)} has ${reading} (${numberText(firstYield)} vs ${numberText(secondYield)} accepted A/B findings per step) ${comparisonPreposition(reading)} ${modelText(secondRow.identity)}, from ${firstRow.yieldSamples.length} and ${secondRow.yieldSamples.length} plans`,
      )
    }
  for (let first = 0; first < timeRanked.length; first += 1)
    for (let second = first + 1; second < timeRanked.length; second += 1) {
      const firstRow = timeRanked[first][1]
      const secondRow = timeRanked[second][1]
      const firstMinutes = mean(
        firstRow.timeSamples.map((sample) => sample.minutes),
      )
      const secondMinutes = mean(
        secondRow.timeSamples.map((sample) => sample.minutes),
      )
      const reading = speedWords(firstMinutes, secondMinutes)
      clauses.push(
        `for coder time, ${modelText(firstRow.identity)} is ${reading} (${numberText(firstMinutes)} vs ${numberText(secondMinutes)} min per step) ${comparisonPreposition(reading)} ${modelText(secondRow.identity)}, from ${firstRow.timeSamples.length} and ${secondRow.timeSamples.length} plans`,
      )
    }
  const recommendation = coderRecommendation(rows)
  if (recommendation === null)
    clauses.push("the records do not separate one coder clearly")
  else {
    const identity =
      rows.get(recommendation)?.identity ?? entries[0][1].identity
    clauses.push(`the records clearly support running ${modelText(identity)}`)
    const current = new Set(settings.coders.map((coder) => modelKey(coder)))
    if (!current.has(recommendation))
      clauses.push(`${modelText(identity)} is not in the current coder list`)
  }
  return joinedSentence(clauses)
}

function coderTable(rows: ReadonlyMap<string, CoderRow>): string[] {
  const lines = [
    "| Model | Plans | Timed plans | Steps | A/B kept | Minutes per step |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
  ]
  for (const [, row] of sortedRows(rows)) {
    const timedSteps = row.timeSamples.reduce(
      (total, sample) => total + sample.steps,
      0,
    )
    const totalMinutes = row.timeSamples.reduce(
      (total, sample) => total + sample.minutes * sample.steps,
      0,
    )
    lines.push(
      `| ${escapeCell(modelText(row.identity))} | ${row.yieldSamples.length} | ${row.timeSamples.length} | ${row.yieldSamples.reduce((total, sample) => total + sample.steps, 0)} | ${row.yieldSamples.reduce((total, sample) => total + sample.kept, 0)} | ${timedSteps === 0 ? "—" : numberText(totalMinutes / timedSteps)} |`,
    )
  }
  return lines
}

function disprovedSection(entries: readonly DisprovedEvidence[]): string[] {
  const lines = ["## Disproved after the round", ""]
  if (entries.length === 0)
    return [...lines, "No findings were disproved after a round."]
  const groups = new Map<string, DisprovedEvidence[]>()
  for (const entry of entries) {
    const key = modelText(entry.auditor)
    const group = groups.get(key) ?? []
    group.push(entry)
    groups.set(key, group)
  }
  for (const [auditor, group] of [...groups].sort(([first], [second]) =>
    first.localeCompare(second),
  )) {
    if (lines.length > 2) lines.push("")
    lines.push(
      `### ${auditor}`,
      "",
      "| Date | Plan and round | Finding | Tier | Vet | Reason |",
      "| --- | --- | --- | --- | --- | --- |",
    )
    for (const entry of group.sort(
      (first, second) =>
        second.date.localeCompare(first.date) ||
        first.stem.localeCompare(second.stem),
    ))
      if (entry.kind === "detached")
        lines.push(
          `| ${entry.date} | ${escapeCell(`${entry.stem}; no retained round data holds this finding`)} | — | — | — | ${escapeCell(entry.reason)} |`,
        )
      else
        lines.push(
          `| ${entry.date} | ${escapeCell(`${entry.stem}; ${entry.target} round ${entry.round}`)} | ${escapeCell(`#${entry.finding} ${entry.title}`)} | ${entry.tier} | ${escapeCell(`${entry.vet === null ? "no recorded vet" : modelText(entry.vet)}; ${entry.vetVerdict ?? "no verdict"}`)} | ${escapeCell(entry.reason)} |`,
        )
  }
  return lines
}

function titleCase(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`
}

function excludedSection(rows: ReadonlyMap<string, CoderRow>): string[] {
  const lines = ["## Excluded plans", ""]
  const reasons = new Map<string, Map<string, Set<string>>>()
  for (const [, row] of sortedRows(rows))
    for (const [stem, reason] of row.excluded) {
      const plans = reasons.get(reason) ?? new Map<string, Set<string>>()
      const models = plans.get(stem) ?? new Set<string>()
      models.add(modelText(row.identity))
      plans.set(stem, models)
      reasons.set(reason, plans)
    }
  if (reasons.size === 0) return [...lines, "No plans are excluded."]
  let first = true
  for (const [reason, plans] of [...reasons].sort(([first], [second]) =>
    first.localeCompare(second),
  )) {
    if (!first) lines.push("")
    first = false
    lines.push(`### ${titleCase(reason)}`, "")
    for (const [stem, models] of [...plans].sort(([first], [second]) =>
      first.localeCompare(second),
    ))
      lines.push(`- ${stem}: ${[...models].sort().join(", ")}`)
  }
  return lines
}

/** Read every retained model record and render the auditor and coder results. */
export async function modelsReport(
  context: ExecutionContext,
  settings: RoundSettings,
): Promise<string> {
  const evidence = await readModelEvidence(context)
  const lines = [
    "# Model read-out",
    "",
    "## Planning auditors",
    "",
    auditorSentence(evidence.auditors, "planning", settings),
    "",
    ...auditorTable(evidence.auditors, "planning"),
    "",
    "## Implementation auditors",
    "",
    auditorSentence(evidence.auditors, "implementation", settings),
    "",
    ...auditorTable(evidence.auditors, "implementation"),
    "",
    "A/B kept counts accepted A and B findings after later disprovals. Dropped and downgraded record the round's result. Disproved records the user's later ruling. Wrong claims is dropped, downgraded and disproved as a percentage of all four counts. Auditor time includes audit and rebuttal only.",
    "",
    "## Coders",
    "",
    coderSentence(evidence.coders, settings),
    "",
    ...coderTable(evidence.coders),
    "",
    "One coder example is one closed plan with a readable model record for every hosted step share, one recorded coder and a complete whole-plan implementation audit after the final step. A ready assignment, when present, must name that coder. A step without recorded active time uses the span from the ready marker or previous step to its own later share commit. Time adds step time and implementation-round fix time. Planning-round fixes do not enter coder evidence.",
    "",
    ...disprovedSection(evidence.disproved),
    "",
    ...excludedSection(evidence.coders),
  ]
  return `${lines.join("\n")}\n`
}
